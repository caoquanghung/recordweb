import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDbConfigured } from '@/lib/db';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getBlobCommandCredentials } from '@/lib/blobCredentials';
import { getRecordingTitleError, normalizeRecordingTitle } from '@/lib/recordingTitle';
import { completeUploadAttempt, UploadConflict } from '@/lib/recordingUploads';
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
      ORDER BY recorded_at DESC, created_at DESC
      LIMIT 50;
    `;
    const sharedRows = await sql`
      SELECT r.*, u.email AS owner_email, u.display_name AS owner_display_name,
             rs.permission AS share_permission
      FROM recording_shares rs
      JOIN recordings r ON r.id = rs.recording_id
      JOIN users u ON u.id = r.user_id
      WHERE rs.recipient_user_id = ${userId}
      ORDER BY r.recorded_at DESC, r.created_at DESC
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

/** POST /api/recordings — Atomically completes one authenticated upload attempt. */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  try {
    const recording = await completeUploadAttempt(userId, await request.json(), request);
    return NextResponse.json({ recording }, { status: 201 });
  } catch (error) {
    console.error('Recording completion failed', error);
    return NextResponse.json({
      error: error instanceof UploadConflict ? error.message : 'Could not finish saving this recording. Please try again.',
    }, { status: error instanceof UploadConflict ? 409 : 400 });
  }
}

/** PATCH /api/recordings — Update an owned recording title or sharing state. */
export async function PATCH(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json({ message: 'Database not configured.' }, { status: 503 });
  }

  try {
    const { id, is_public, title } = await request.json();
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'A recording id is required.' }, { status: 400 });
    }
    const updatesTitle = title !== undefined;
    if (updatesTitle) {
      const titleError = getRecordingTitleError(title);
      if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
    } else if (typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'A title or sharing state is required.' }, { status: 400 });
    }
    const sql = getDb();
    // §2.9 — Only allow update on the user's own recordings (user_id guard)
    const result = updatesTitle
      ? await sql`
          UPDATE recordings SET title = ${normalizeRecordingTitle(title)}
          WHERE id = ${id} AND user_id = ${userId} RETURNING *;
        `
      : await sql`
          UPDATE recordings SET is_public = ${is_public}
          WHERE id = ${id} AND user_id = ${userId} RETURNING *;
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
    if (uniquePathnames.length > 0) {
      await del(uniquePathnames, getBlobCommandCredentials(request));
    }
    await sql.transaction([
      sql`
        UPDATE recording_projects rp
        SET revision = rp.revision + 1, updated_at = NOW()
        WHERE rp.user_id = ${userId}
          AND EXISTS (
            SELECT 1 FROM recording_project_segments rps
            WHERE rps.project_id = rp.id AND rps.recording_id = ${id}
          );
      `,
      sql`DELETE FROM recordings WHERE id = ${id} AND user_id = ${userId};`,
    ]);
    return NextResponse.json({ deletedBlobPathnames: uniquePathnames });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
