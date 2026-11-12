import 'server-only';

import { del, head } from '@vercel/blob';
import { getBlobCommandCredentials } from '@/lib/blobCredentials';
import { getDb } from '@/lib/db';
import type { CalibrationPosture, CalibrationProfile } from '@/types/calibration';
import type { DbCalibrationPosture, DbCalibrationProfile } from '@/types/database';
import {
  CALIBRATION_CELL_COUNT,
  CALIBRATION_CONSENT_VERSION,
  CALIBRATION_MAX_BYTES,
  CALIBRATION_PENDING_TTL_MS,
  isCalibrationPathnameFor,
  parseCalibrationCommit,
  type CalibrationValidationError,
} from './policy';

export class CalibrationError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const NO_PROFILE = 'Hãy xác nhận thông báo quyền riêng tư trước khi lưu thiết lập.';

function toPosture(row: DbCalibrationPosture): CalibrationPosture {
  return {
    id: row.id,
    cellRow: row.cell_row,
    cellCol: row.cell_col,
    url: row.storage_url,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    widthPx: row.width_px,
    heightPx: row.height_px,
    sourceWidth: row.source_width,
    sourceHeight: row.source_height,
    sourceBbox: row.source_bbox,
    scaleFactor: Number(row.scale_factor),
    mirrored: row.mirrored,
    bodyCoverage: row.body_coverage,
    headToHipPx: row.head_to_hip_px === null ? null : Number(row.head_to_hip_px),
    poseModel: row.pose_model,
    captureSessionId: row.capture_session_id,
    capturedAt: new Date(row.captured_at).toISOString(),
  };
}

export async function getCalibrationProfile(userId: string): Promise<CalibrationProfile | null> {
  const sql = getDb();
  const [profile] = await sql`SELECT * FROM calibration_profiles WHERE user_id = ${userId};` as DbCalibrationProfile[];
  if (!profile) return null;
  const rows = await sql`SELECT * FROM calibration_postures WHERE user_id = ${userId}
    ORDER BY cell_row, cell_col;` as DbCalibrationPosture[];
  return {
    consentVersion: profile.consent_version,
    consentAcceptedAt: new Date(profile.consent_accepted_at).toISOString(),
    updatedAt: new Date(profile.updated_at).toISOString(),
    completeness: rows.length,
    postures: rows.map(toPosture),
  };
}

/** Idempotent: creates the empty profile or refreshes consent when the notice version changed. */
export async function acceptCalibrationConsent(userId: string): Promise<void> {
  const sql = getDb();
  try {
    await sql`INSERT INTO calibration_profiles (user_id, consent_version)
      VALUES (${userId}, ${CALIBRATION_CONSENT_VERSION})
      ON CONFLICT (user_id) DO UPDATE SET
        consent_version = EXCLUDED.consent_version,
        consent_accepted_at = CASE WHEN calibration_profiles.consent_version <> EXCLUDED.consent_version
          THEN NOW() ELSE calibration_profiles.consent_accepted_at END;`;
  } catch (error) {
    if ((error as { code?: string }).code === '23503') {
      throw new CalibrationError(409, 'Tài khoản chưa được đồng bộ. Vui lòng đăng nhập lại sau ít phút.');
    }
    throw error;
  }
}

/** Records a pathname the server is about to issue an upload token for. */
export async function recordCalibrationUploadToken(userId: string, pathname: string): Promise<void> {
  if (!isCalibrationPathnameFor(userId, pathname)) throw new CalibrationError(400, 'Đường dẫn upload không hợp lệ.');
  const sql = getDb();
  const [profile] = await sql`SELECT 1 FROM calibration_profiles WHERE user_id = ${userId};`;
  if (!profile) throw new CalibrationError(409, NO_PROFILE);
  await sql`INSERT INTO calibration_upload_ledger (blob_pathname, user_id)
    VALUES (${pathname}, ${userId}) ON CONFLICT (blob_pathname) DO NOTHING;`;
}

/**
 * Best-effort removal of replaced images and of uploads that were never
 * committed. Failures leave the ledger rows in place so a later call retries.
 */
export async function sweepCalibrationBlobs(userId: string, request?: Request): Promise<number> {
  try {
    const sql = getDb();
    const cutoff = new Date(Date.now() - CALIBRATION_PENDING_TTL_MS).toISOString();
    const rows = await sql`SELECT blob_pathname FROM calibration_upload_ledger
      WHERE user_id = ${userId} AND (status = 'replaced' OR (status = 'pending' AND created_at < ${cutoff}))
      ORDER BY created_at LIMIT 50;`;
    const paths = rows.map((row) => row.blob_pathname as string).filter((path) => isCalibrationPathnameFor(userId, path));
    if (!paths.length) return 0;
    await del(paths, getBlobCommandCredentials(request));
    await sql`DELETE FROM calibration_upload_ledger WHERE user_id = ${userId} AND blob_pathname = ANY(${paths}::text[]);`;
    return paths.length;
  } catch (error) {
    console.error('Calibration blob cleanup deferred', error);
    return 0;
  }
}

export async function commitCalibrationPostures(userId: string, raw: unknown, request: Request): Promise<CalibrationProfile> {
  let body;
  try {
    body = parseCalibrationCommit(userId, raw);
  } catch (error) {
    throw new CalibrationError(400, (error as CalibrationValidationError).message);
  }
  const sql = getDb();
  const [profile] = await sql`SELECT 1 FROM calibration_profiles WHERE user_id = ${userId};`;
  if (!profile) throw new CalibrationError(409, NO_PROFILE);

  const paths = body.postures.map((posture) => posture.pathname);
  const pending = await sql`SELECT blob_pathname FROM calibration_upload_ledger
    WHERE user_id = ${userId} AND blob_pathname = ANY(${paths}::text[]) AND status IN ('pending', 'committed');`;
  if (pending.length !== paths.length) {
    throw new CalibrationError(409, 'Một số ảnh đã hết hạn upload. Hãy lưu lại.');
  }

  // Trust the store, never the browser, for URL, size and content type.
  const verified = await Promise.all(body.postures.map(async (posture) => {
    const blob = await head(posture.pathname, getBlobCommandCredentials(request)).catch(() => null);
    if (!blob || blob.pathname !== posture.pathname || blob.contentType !== 'image/png'
      || blob.size < 1 || blob.size > CALIBRATION_MAX_BYTES) {
      throw new CalibrationError(400, 'Ảnh đã upload không hợp lệ hoặc chưa tồn tại.');
    }
    return { posture, url: blob.url, size: blob.size };
  }));

  const writes = verified.map(({ posture, url, size }) => sql`INSERT INTO calibration_postures (
      user_id, cell_row, cell_col, storage_url, blob_pathname, mime_type, file_size_bytes, width_px, height_px,
      source_width, source_height, source_bbox, scale_factor, mirrored, body_coverage, head_to_hip_px,
      pose_model, capture_session_id, captured_at)
    VALUES (${userId}, ${posture.cellRow}, ${posture.cellCol}, ${url}, ${posture.pathname}, 'image/png', ${size},
      ${posture.widthPx}, ${posture.heightPx}, ${posture.sourceWidth}, ${posture.sourceHeight},
      ${JSON.stringify(posture.sourceBbox)}::jsonb, ${posture.scaleFactor}, FALSE, ${posture.bodyCoverage}, ${posture.headToHipPx}, ${posture.poseModel},
      ${body.captureSessionId}, ${posture.capturedAt})
    ON CONFLICT (user_id, cell_row, cell_col) DO UPDATE SET
      storage_url = EXCLUDED.storage_url, blob_pathname = EXCLUDED.blob_pathname,
      file_size_bytes = EXCLUDED.file_size_bytes, width_px = EXCLUDED.width_px, height_px = EXCLUDED.height_px,
      source_width = EXCLUDED.source_width, source_height = EXCLUDED.source_height,
      source_bbox = EXCLUDED.source_bbox, scale_factor = EXCLUDED.scale_factor,
      body_coverage = EXCLUDED.body_coverage, head_to_hip_px = EXCLUDED.head_to_hip_px, pose_model = EXCLUDED.pose_model,
      capture_session_id = EXCLUDED.capture_session_id, captured_at = EXCLUDED.captured_at, created_at = NOW();`);

  await sql.transaction([
    ...writes,
    // A full re-capture replaces the whole profile: cells that were not captured are removed.
    ...(body.mode === 'replace-all'
      ? [sql`DELETE FROM calibration_postures WHERE user_id = ${userId} AND NOT (blob_pathname = ANY(${paths}::text[]));`]
      : []),
    sql`UPDATE calibration_upload_ledger SET status = 'committed', updated_at = NOW()
      WHERE user_id = ${userId} AND blob_pathname = ANY(${paths}::text[]);`,
    // Anything committed earlier that no posture references any more is now replaced.
    sql`UPDATE calibration_upload_ledger SET status = 'replaced', updated_at = NOW()
      WHERE user_id = ${userId} AND status = 'committed'
        AND blob_pathname NOT IN (SELECT blob_pathname FROM calibration_postures WHERE user_id = ${userId});`,
    sql`UPDATE calibration_profiles SET updated_at = NOW() WHERE user_id = ${userId};`,
  ]);

  await sweepCalibrationBlobs(userId, request);
  const saved = await getCalibrationProfile(userId);
  if (!saved || saved.completeness > CALIBRATION_CELL_COUNT) throw new Error('Calibration profile is inconsistent.');
  return saved;
}

/** Deletes every posture row, the profile and every Blob the user ever uploaded for calibration. */
export async function deleteCalibrationProfile(userId: string, request: Request): Promise<void> {
  const sql = getDb();
  const rows = await sql`SELECT blob_pathname FROM calibration_postures WHERE user_id = ${userId}
    UNION SELECT blob_pathname FROM calibration_upload_ledger WHERE user_id = ${userId};`;
  const paths = rows.map((row) => row.blob_pathname as string).filter((path) => isCalibrationPathnameFor(userId, path));
  if (paths.length) await del(paths, getBlobCommandCredentials(request));
  await sql.transaction([
    sql`DELETE FROM calibration_upload_ledger WHERE user_id = ${userId};`,
    sql`DELETE FROM calibration_profiles WHERE user_id = ${userId};`,
  ]);
}
