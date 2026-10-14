import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDbConfigured } from '@/lib/db';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { DbRecording, DbRecordingAsset, DbSharedRecording } from '@/types/database';
import { del } from '@vercel/blob';

/** GET /api/recordings — Returns only the authenticated user's recordings. */
export async function GET() {
  // §2.9 — Auth gate
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json(
      { message: 'Database not configured. Using local offline mode.', recordings: [] },
      { status: 200 }
    );
  }

  try {
    const sql = getDb();
    // §2.9 — User-scoped query: only this user's recordings
    const rows = await sql`
      SELECT * FROM recordings
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50;
    `;
    const sharedRows = await sql`
      SELECT r.*, u.email AS owner_email, u.display_name AS owner_display_name,
             rs.permission AS share_permission
      FROM recording_shares rs
      JOIN recordings r ON r.id = rs.recording_id
      JOIN users u ON u.id = r.user_id
      WHERE rs.recipient_user_id = ${userId}
      ORDER BY r.created_at DESC
      LIMIT 50;
    `;
    const assetRows = await sql`
      SELECT ra.*
      FROM recording_assets ra
      JOIN recordings r ON r.id = ra.recording_id
      WHERE r.user_id = ${userId}
         OR EXISTS (
           SELECT 1 FROM recording_shares rs
           WHERE rs.recording_id = r.id
             AND rs.recipient_user_id = ${userId}
             AND rs.permission = 'viewer_download'
         )
      ORDER BY ra.created_at ASC;
    ` as DbRecordingAsset[];
    const assetsByRecording = new Map<string, DbRecordingAsset[]>();
    assetRows.forEach((asset) => {
      const current = assetsByRecording.get(asset.recording_id) ?? [];
      current.push(asset);
      assetsByRecording.set(asset.recording_id, current);
    });
    const ownedRecordings = (rows as DbRecording[]).map((recording) => ({
      ...recording,
      assets: assetsByRecording.get(recording.id) ?? [],
    }));
    const sharedRecordings = (sharedRows as DbSharedRecording[]).map((recording) => ({
      ...recording,
      assets: assetsByRecording.get(recording.id) ?? [],
    }));
    return NextResponse.json({
      recordings: ownedRecordings,
      sharedRecordings,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** POST /api/recordings — Saves recording metadata for the authenticated user. */
export async function POST(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json(
      { message: 'Database not configured. Saved to local storage only.' },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const {
      title,
      duration_seconds,
      file_size_bytes,
      resolution = '1920x1080',
      fps = 30,
      // §2.10 — mime_type stored as-is so the share page knows the container format
      mime_type = 'video/webm',
      local_id = null,
      storage_url = null,
      blob_pathname = null,  // required for future del(pathname) deletions
      is_public = false,     // §2.9 — share link off by default
      settings = {},
      assets = [],
    } = body;

    const validAssetKinds = new Set([
      'composite',
      'webcam',
      'screen',
      'audio',
      'microphone-audio',
      'system-audio',
    ]);
    if (!Array.isArray(assets) || assets.some((asset) => !validAssetKinds.has(asset?.kind))) {
      return NextResponse.json({ error: 'Invalid recording assets.' }, { status: 400 });
    }

    const sql = getDb();
    // §2.8 / §2.9 — Insert with user_id FK and is_public column
    const result = await sql`
      INSERT INTO recordings (
        user_id,
        title,
        duration_seconds,
        file_size_bytes,
        resolution,
        fps,
        mime_type,
        local_id,
        storage_url,
        blob_pathname,
        is_public,
        settings
      ) VALUES (
        ${userId},
        ${title},
        ${duration_seconds},
        ${file_size_bytes},
        ${resolution},
        ${fps},
        ${mime_type},
        ${local_id},
        ${storage_url},
        ${blob_pathname},
        ${is_public},
        ${JSON.stringify(settings)}
      )
      RETURNING *;
    `;

    const recording = result[0] as DbRecording;
    const insertedAssets: DbRecordingAsset[] = [];
    try {
      for (const asset of assets) {
        const assetResult = await sql`
          INSERT INTO recording_assets (
            recording_id,
            kind,
            storage_url,
            blob_pathname,
            mime_type,
            file_size_bytes,
            resolution,
            fps,
            sample_rate_hz,
            metadata
          ) VALUES (
            ${recording.id},
            ${asset.kind},
            ${asset.storage_url},
            ${asset.blob_pathname},
            ${asset.mime_type},
            ${asset.file_size_bytes},
            ${asset.resolution ?? null},
            ${asset.fps ?? null},
            ${asset.sample_rate_hz ?? null},
            ${JSON.stringify(asset.metadata ?? {})}
          )
          RETURNING *;
        `;
        insertedAssets.push(assetResult[0] as DbRecordingAsset);
      }
    } catch (assetError) {
      await sql`DELETE FROM recordings WHERE id = ${recording.id} AND user_id = ${userId};`;
      throw assetError;
    }

    return NextResponse.json({
      recording: { ...recording, assets: insertedAssets },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** PATCH /api/recordings — Toggle is_public for a specific recording (share link). */
export async function PATCH(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json({ message: 'Database not configured.' }, { status: 503 });
  }

  try {
    const { id, is_public } = await request.json();
    const sql = getDb();
    // §2.9 — Only allow update on the user's own recordings (user_id guard)
    const result = await sql`
      UPDATE recordings
      SET is_public = ${is_public}
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING *;
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Recording not found or access denied.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ recording: result[0] as DbRecording });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** DELETE /api/recordings — Deletes a recording owned by the authenticated user. */
export async function DELETE(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json({ message: 'Database not configured.' }, { status: 503 });
  }

  try {
    const { id } = await request.json();
    const sql = getDb();
    const result = await sql`
      SELECT blob_pathname FROM recordings
      WHERE id = ${id} AND user_id = ${userId}
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Recording not found or access denied.' },
        { status: 404 }
      );
    }

    const assetRows = await sql`
      SELECT ra.blob_pathname
      FROM recording_assets ra
      JOIN recordings r ON r.id = ra.recording_id
      WHERE ra.recording_id = ${id} AND r.user_id = ${userId};
    `;
    const pathnames = [
      result[0].blob_pathname as string | null,
      ...assetRows.map((asset) => asset.blob_pathname as string | null),
    ].filter((pathname): pathname is string => Boolean(pathname));
    const uniquePathnames = [...new Set(pathnames)];
    if (uniquePathnames.length > 0) await del(uniquePathnames);
    await sql`DELETE FROM recordings WHERE id = ${id} AND user_id = ${userId};`;
    return NextResponse.json({ deletedBlobPathnames: uniquePathnames });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
