import 'server-only';

import { del, head } from '@vercel/blob';
import { getDb } from '@/lib/db';
import { getBlobCommandCredentials } from '@/lib/blobCredentials';
import { buildUploadManifest, isUploadId, uploadIdFromPath } from '@/lib/recordingUploadProtocol';
import { getRecordingTitleError, normalizeRecordingTitle } from '@/lib/recordingTitle';
import type { DbRecording, DbRecordingUploadAttempt } from '@/types/database';

export class UploadConflict extends Error {}

export async function findSavedRecording(userId: string, localId: string): Promise<DbRecording | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM recordings WHERE user_id = ${userId} AND local_id = ${localId} LIMIT 1;`;
  if (!rows[0]) return null;
  const assets = await sql`SELECT * FROM recording_assets WHERE recording_id = ${rows[0].id};`;
  return { ...rows[0], assets } as DbRecording;
}

export async function getUploadAttempt(id: string, userId?: string): Promise<DbRecordingUploadAttempt | null> {
  if (!isUploadId(id)) return null;
  const sql = getDb();
  const rows = userId
    ? await sql`SELECT * FROM recording_upload_attempts WHERE id = ${id} AND user_id = ${userId};`
    : await sql`SELECT * FROM recording_upload_attempts WHERE id = ${id};`;
  return (rows[0] as DbRecordingUploadAttempt | undefined) ?? null;
}

export async function startUploadAttempt(userId: string, id: string, localId: string, assets: unknown) {
  if (!isUploadId(id) || typeof localId !== 'string' || !localId || localId.length > 128) {
    throw new Error('Invalid upload identity.');
  }
  const manifest = buildUploadManifest(id, assets);
  const saved = await findSavedRecording(userId, localId);
  if (saved) return { recording: saved };
  const sql = getDb();
  // Expiry is terminal. A new attempt always gets an independent Blob namespace.
  await sql`UPDATE recording_upload_attempts SET status = 'cancelled'
    WHERE user_id = ${userId} AND local_id = ${localId} AND status = 'uploading' AND lease_expires_at <= NOW();`;
  const rows = await sql`INSERT INTO recording_upload_attempts (id, user_id, local_id, manifest)
    VALUES (${id}, ${userId}, ${localId}, ${JSON.stringify(manifest)})
    ON CONFLICT DO NOTHING RETURNING *;`;
  if (rows[0]) return { attempt: rows[0] as DbRecordingUploadAttempt };
  const existing = await getUploadAttempt(id, userId);
  if (existing?.status === 'uploading' && existing.local_id === localId
    && existing.manifest.length === manifest.length && manifest.every((asset) => existing.manifest.some((item) =>
      item.pathname === asset.pathname && item.kind === asset.kind && item.size === asset.size && item.contentType === asset.contentType))) {
    return { attempt: existing };
  }
  throw new UploadConflict('This recording is already being saved in another tab. Return there or wait for that upload to expire.');
}

export async function authorizeUploadPath(userId: string, pathname: string) {
  const id = uploadIdFromPath(pathname);
  const attempt = id ? await getUploadAttempt(id, userId) : null;
  const asset = attempt?.manifest.find((item) => item.pathname === pathname);
  if (!attempt || !asset || attempt.status !== 'uploading'
    || Date.parse(attempt.lease_expires_at) <= Date.now() || Date.parse(attempt.token_expires_at) <= Date.now()) {
    throw new UploadConflict('This upload is no longer active. Please try saving again.');
  }
  return { attempt, asset };
}

export async function cancelUploadAttempt(userId: string, id: string, localId: string, assets: unknown) {
  if (!isUploadId(id)) throw new Error('Invalid upload identity.');
  const sql = getDb();
  if (typeof localId !== 'string' || !localId || localId.length > 128) throw new Error('Invalid local recording identity.');
  const manifest = buildUploadManifest(id, assets);
  // A cancellation may beat the start request. Its tombstone prevents a late start.
  await sql`INSERT INTO recording_upload_attempts (id, user_id, local_id, manifest, status)
    VALUES (${id}, ${userId}, ${localId}, ${JSON.stringify(manifest)}, 'cancelled') ON CONFLICT DO NOTHING;`;
  // Races with completion on the SAME row. Completed recordings can never be cancelled.
  await sql`UPDATE recording_upload_attempts SET status = 'cancelled'
    WHERE id = ${id} AND user_id = ${userId} AND status = 'uploading';`;
  return getUploadAttempt(id, userId);
}

export async function heartbeatUploadAttempt(userId: string, id: string) {
  if (!isUploadId(id)) throw new Error('Invalid upload identity.');
  const sql = getDb();
  const rows = await sql`UPDATE recording_upload_attempts SET lease_expires_at = NOW() + INTERVAL '15 minutes'
    WHERE id = ${id} AND user_id = ${userId} AND status = 'uploading'
      AND lease_expires_at > NOW() AND token_expires_at > NOW() RETURNING id;`;
  if (!rows.length) throw new UploadConflict('This upload expired or was cancelled. Please save again.');
}

export async function cleanupUploadAttempt(id: string, request?: Request): Promise<void> {
  const attempt = await getUploadAttempt(id);
  if (!attempt || attempt.status !== 'cancelled') return;
  // Only server-generated manifest paths, never client-submitted URLs or broad prefixes.
  const manifest = buildUploadManifest(attempt.id, attempt.manifest.map((asset) => ({
    kind: asset.kind, mimeType: asset.contentType, size: asset.size,
  })));
  await del(manifest.map((asset) => asset.pathname), getBlobCommandCredentials(request));
  const sql = getDb();
  await sql`UPDATE recording_upload_attempts SET cleaned_at = NOW() WHERE id = ${id} AND status = 'cancelled';`;
}

export async function cleanupExpiredUploads(request?: Request, userId?: string): Promise<number> {
  const sql = getDb();
  if (userId) {
    await sql`UPDATE recording_upload_attempts SET status = 'cancelled'
      WHERE user_id = ${userId} AND status = 'uploading' AND lease_expires_at <= NOW();`;
  } else {
    await sql`UPDATE recording_upload_attempts SET status = 'cancelled'
      WHERE status = 'uploading' AND lease_expires_at <= NOW();`;
  }
  const rows = userId
    ? await sql`SELECT id FROM recording_upload_attempts WHERE user_id = ${userId} AND status = 'cancelled'
        AND (cleaned_at IS NULL OR cleaned_at < token_expires_at + INTERVAL '1 day')
        ORDER BY cleaned_at ASC NULLS FIRST LIMIT 50;`
    : await sql`SELECT id FROM recording_upload_attempts WHERE status = 'cancelled'
        AND (cleaned_at IS NULL OR cleaned_at < token_expires_at + INTERVAL '1 day')
        ORDER BY cleaned_at ASC NULLS FIRST LIMIT 50;`;
  const results = await Promise.allSettled(rows.map((row) => cleanupUploadAttempt(row.id as string, request)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) throw new Error(`${failed.length} upload cleanup operations need a retry.`);
  return rows.length;
}

export async function handleUploadCompleted(pathname: string, request: Request): Promise<void> {
  const id = uploadIdFromPath(pathname);
  if (!id) return; // Legacy uploads are never deleted by this workflow.
  const attempt = await getUploadAttempt(id);
  if (!attempt || !attempt.manifest.some((asset) => asset.pathname === pathname)) throw new Error('Unknown upload asset.');
  if (attempt.status === 'cancelled') await cleanupUploadAttempt(id, request);
}

export async function completeUploadAttempt(userId: string, body: Record<string, unknown>, request: Request): Promise<DbRecording> {
  const { attempt_id: id, title, recorded_at: recordedAt, duration_seconds: duration, settings = {}, assets = [] } = body;
  if (!isUploadId(id)) throw new Error('A valid upload attempt is required.');
  const attempt = await getUploadAttempt(id, userId);
  if (!attempt) throw new Error('Upload not found.');
  const saved = await findSavedRecording(userId, attempt.local_id);
  if (saved) return saved;
  if (attempt.status !== 'uploading') throw new UploadConflict('This upload was cancelled. Please save again.');
  const titleError = getRecordingTitleError(title);
  if (titleError) throw new Error(titleError);
  const timestamp = typeof recordedAt === 'string' ? new Date(recordedAt) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime()) || typeof duration !== 'number' || !Number.isFinite(duration)
    || duration <= 0 || duration > 1800 || !Array.isArray(assets) || assets.length !== attempt.manifest.length) {
    throw new Error('Invalid recording metadata.');
  }
  // Check the actual store rather than trusting URLs reported by the browser.
  const verifiedAssets = await Promise.all(attempt.manifest.map(async (expected) => {
    const metadata = assets.find((asset) => asset?.kind === expected.kind);
    if (!metadata) throw new Error('A required recording asset is missing.');
    const blob = await head(expected.pathname, getBlobCommandCredentials(request));
    if (blob.pathname !== expected.pathname || blob.size !== expected.size || blob.contentType !== expected.contentType) {
      throw new Error('An uploaded recording asset did not match its backup.');
    }
    return {
      kind: expected.kind, storage_url: blob.url, blob_pathname: blob.pathname,
      mime_type: expected.contentType, file_size_bytes: blob.size,
      resolution: typeof metadata.resolution === 'string' ? metadata.resolution : null,
      fps: Number.isInteger(metadata.fps) && metadata.fps > 0 ? metadata.fps : null,
      sample_rate_hz: Number.isInteger(metadata.sample_rate_hz) && metadata.sample_rate_hz > 0 ? metadata.sample_rate_hz : null,
      metadata: metadata.metadata && typeof metadata.metadata === 'object' ? metadata.metadata : {},
    };
  }));
  const composite = verifiedAssets.find((asset) => asset.kind === 'composite')!;
  const sql = getDb();
  // One statement/transaction: claim attempt + recording + ALL asset rows.
  // Cancellation/expiry wins the same row lock, or completion wins; never both.
  const rows = await sql`WITH claimed AS (
      UPDATE recording_upload_attempts SET status = 'completed', completed_at = NOW()
      WHERE id = ${id} AND user_id = ${userId} AND status = 'uploading'
        AND lease_expires_at > NOW() AND token_expires_at > NOW() RETURNING *
    ), inserted AS (
      INSERT INTO recordings (id, user_id, local_id, title, recorded_at, duration_seconds,
        file_size_bytes, resolution, fps, mime_type, storage_url, blob_pathname, is_public, settings)
      SELECT recording_id, user_id, local_id, ${normalizeRecordingTitle(title as string)}, ${timestamp.toISOString()},
        ${duration}, ${composite.file_size_bytes}, ${composite.resolution ?? '1920x1080'}, ${composite.fps ?? 30},
        ${composite.mime_type}, ${composite.storage_url}, ${composite.blob_pathname}, FALSE, ${JSON.stringify(settings)}
      FROM claimed RETURNING *
    ), inserted_assets AS (
      INSERT INTO recording_assets (recording_id, kind, storage_url, blob_pathname, mime_type,
        file_size_bytes, resolution, fps, sample_rate_hz, metadata)
      SELECT inserted.id, asset.kind, asset.storage_url, asset.blob_pathname, asset.mime_type,
        asset.file_size_bytes, asset.resolution, asset.fps, asset.sample_rate_hz, asset.metadata
      FROM inserted CROSS JOIN jsonb_to_recordset(${JSON.stringify(verifiedAssets)}::jsonb)
        AS asset(kind TEXT, storage_url TEXT, blob_pathname TEXT, mime_type TEXT,
          file_size_bytes BIGINT, resolution TEXT, fps INTEGER, sample_rate_hz INTEGER, metadata JSONB)
      RETURNING *
    ) SELECT inserted.*, COALESCE((SELECT jsonb_agg(inserted_assets) FROM inserted_assets), '[]'::jsonb) AS assets FROM inserted;`;
  if (rows[0]) return rows[0] as DbRecording;
  // A concurrent completion may have won while we verified Blob metadata.
  const completed = await findSavedRecording(userId, attempt.local_id);
  if (completed) return completed;
  throw new UploadConflict('This upload expired or was cancelled before saving finished.');
}
