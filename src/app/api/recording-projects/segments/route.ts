import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getDb, isDbConfigured } from '@/lib/db';
import { isRecordingMediaProfile, validateSegmentOrder } from '@/lib/recordingProjects';

function databaseConflict(error: unknown) {
  const message = (error as Error).message;
  return message.includes('recording_project_segments_project_sequence_key')
    || message.includes('could not serialize access');
}

/** POST — Attaches an owned, uploaded finalized recording as the next project segment. */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const projectId = typeof body.project_id === 'string' ? body.project_id : '';
    const recordingId = typeof body.recording_id === 'string' ? body.recording_id : '';
    const expectedRevision = Number.isInteger(body.expected_revision) ? body.expected_revision : -1;
    const mediaProfile = body.media_profile;
    if (!projectId || !recordingId || expectedRevision < 0 || !isRecordingMediaProfile(mediaProfile)) {
      return NextResponse.json(
        { error: 'project_id, recording_id, expected_revision, and a valid media_profile are required.' },
        { status: 400 },
      );
    }

    const sql = getDb();
    const rows = await sql`
      WITH eligible AS (
        SELECT
          rp.id AS project_id,
          COALESCE(MAX(rps.sequence_number) + 1, 0)::integer AS next_sequence
        FROM recording_projects rp
        JOIN recordings r
          ON r.id = ${recordingId}
         AND r.user_id = ${userId}
         AND r.storage_url IS NOT NULL
        LEFT JOIN recording_project_segments rps ON rps.project_id = rp.id
        WHERE rp.id = ${projectId}
          AND rp.user_id = ${userId}
          AND rp.status = 'draft'
          AND rp.revision = ${expectedRevision}
          AND (rp.media_profile IS NULL OR rp.media_profile = ${JSON.stringify(mediaProfile)}::jsonb)
        GROUP BY rp.id
      ), inserted AS (
        INSERT INTO recording_project_segments (
          project_id,
          recording_id,
          sequence_number,
          media_profile
        )
        SELECT project_id, ${recordingId}, next_sequence, ${JSON.stringify(mediaProfile)}::jsonb
        FROM eligible
        ON CONFLICT (recording_id) DO NOTHING
        RETURNING *
      ), bumped AS (
        UPDATE recording_projects rp
        SET
          media_profile = COALESCE(rp.media_profile, ${JSON.stringify(mediaProfile)}::jsonb),
          revision = rp.revision + 1,
          updated_at = NOW()
        FROM inserted i
        WHERE rp.id = i.project_id
        RETURNING rp.revision
      )
      SELECT i.*, b.revision
      FROM inserted i
      CROSS JOIN bumped b;
    `;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'The project changed, is completed, has an incompatible profile, or the recording is unavailable.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ segment: rows[0], revision: rows[0].revision }, { status: 201 });
  } catch (error) {
    if (databaseConflict(error)) {
      return NextResponse.json({ error: 'Another segment was added concurrently. Reload and retry.' }, { status: 409 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PATCH — Reorders every segment in a draft project atomically. */
export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const projectId = typeof body.project_id === 'string' ? body.project_id : '';
    const expectedRevision = Number.isInteger(body.expected_revision) ? body.expected_revision : -1;
    const segmentIds: string[] = Array.isArray(body.segment_ids)
      ? body.segment_ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    if (!projectId || expectedRevision < 0 || segmentIds.length === 0) {
      return NextResponse.json(
        { error: 'project_id, expected_revision, and segment_ids are required.' },
        { status: 400 },
      );
    }

    const sql = getDb();
    const current = await sql`
      SELECT rps.id
      FROM recording_project_segments rps
      JOIN recording_projects rp ON rp.id = rps.project_id
      WHERE rps.project_id = ${projectId}
        AND rp.user_id = ${userId}
        AND rp.status = 'draft'
        AND rp.revision = ${expectedRevision}
      ORDER BY rps.sequence_number;
    `;
    try {
      validateSegmentOrder(current.map((row) => row.id as string), segmentIds);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }

    const queries = segmentIds.map((segmentId, sequenceNumber) => sql`
      UPDATE recording_project_segments rps
      SET sequence_number = ${sequenceNumber}
      WHERE rps.id = ${segmentId}
        AND rps.project_id = ${projectId}
        AND EXISTS (
          SELECT 1 FROM recording_projects rp
          WHERE rp.id = rps.project_id
            AND rp.user_id = ${userId}
            AND rp.status = 'draft'
            AND rp.revision = ${expectedRevision}
        );
    `);
    queries.push(sql`
      UPDATE recording_projects
      SET revision = revision + 1, updated_at = NOW()
      WHERE id = ${projectId}
        AND user_id = ${userId}
        AND status = 'draft'
        AND revision = ${expectedRevision}
      RETURNING revision;
    `);
    const results = await sql.transaction(queries, { isolationLevel: 'Serializable' });
    const revisionRows = results.at(-1) ?? [];
    if (revisionRows.length === 0) {
      return NextResponse.json({ error: 'Project was changed in another tab.' }, { status: 409 });
    }
    return NextResponse.json({ segment_ids: segmentIds, revision: revisionRows[0].revision });
  } catch (error) {
    if (databaseConflict(error)) {
      return NextResponse.json({ error: 'Project was changed concurrently. Reload and retry.' }, { status: 409 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE — Detaches a segment without deleting its finalized recording or Blob assets. */
export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const projectId = typeof body.project_id === 'string' ? body.project_id : '';
    const segmentId = typeof body.segment_id === 'string' ? body.segment_id : '';
    const expectedRevision = Number.isInteger(body.expected_revision) ? body.expected_revision : -1;
    if (!projectId || !segmentId || expectedRevision < 0) {
      return NextResponse.json(
        { error: 'project_id, segment_id, and expected_revision are required.' },
        { status: 400 },
      );
    }

    const sql = getDb();
    const rows = await sql`
      WITH eligible AS (
        SELECT rp.id
        FROM recording_projects rp
        WHERE rp.id = ${projectId}
          AND rp.user_id = ${userId}
          AND rp.status = 'draft'
          AND rp.revision = ${expectedRevision}
      ), removed AS (
        DELETE FROM recording_project_segments rps
        USING eligible e
        WHERE rps.id = ${segmentId} AND rps.project_id = e.id
        RETURNING rps.id, rps.project_id
      ), resequenced AS (
        UPDATE recording_project_segments rps
        SET sequence_number = ordered.sequence_number
        FROM (
          SELECT id, ROW_NUMBER() OVER (ORDER BY sequence_number) - 1 AS sequence_number
          FROM recording_project_segments
          WHERE project_id = ${projectId}
            AND id <> ${segmentId}
            AND EXISTS (SELECT 1 FROM removed)
        ) ordered
        WHERE rps.id = ordered.id
        RETURNING rps.id
      ), bumped AS (
        UPDATE recording_projects rp
        SET revision = rp.revision + 1, updated_at = NOW()
        FROM removed r
        WHERE rp.id = r.project_id
        RETURNING rp.revision
      )
      SELECT r.id, b.revision FROM removed r CROSS JOIN bumped b;
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Segment not found or project was changed.' }, { status: 409 });
    }
    return NextResponse.json({ detached: rows[0].id, revision: rows[0].revision });
  } catch (error) {
    if (databaseConflict(error)) {
      return NextResponse.json({ error: 'Project was changed concurrently. Reload and retry.' }, { status: 409 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

