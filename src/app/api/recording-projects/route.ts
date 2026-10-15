import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getDb, isDbConfigured } from '@/lib/db';
import {
  isRecordingMediaProfile,
  isRecordingProjectStatus,
} from '@/lib/recordingProjects';
import type { DbRecordingProject, DbRecordingProjectSegment } from '@/types/database';
import type { RecordingProject, RecordingProjectSegment } from '@/types/recordingProject';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializeSegment(row: DbRecordingProjectSegment): RecordingProjectSegment {
  return {
    id: row.id,
    projectId: row.project_id,
    recordingId: row.recording_id,
    sequenceNumber: row.sequence_number,
    mediaProfile: row.media_profile,
    durationSeconds: row.duration_seconds,
    fileSizeBytes: row.file_size_bytes,
    mimeType: row.mime_type,
    storageUrl: row.storage_url,
    blobPathname: row.blob_pathname,
    title: row.title,
    createdAt: row.created_at,
  };
}

function serializeProject(
  row: DbRecordingProject,
  segments: RecordingProjectSegment[],
): RecordingProject {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    mediaProfile: row.media_profile,
    settings: row.settings,
    revision: row.revision,
    totalDurationSeconds: segments.reduce((total, segment) => total + segment.durationSeconds, 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    segments,
  };
}

/** GET /api/recording-projects — Lists the current user's resumable lecture projects. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) return NextResponse.json({ projects: [] });

  try {
    const sql = getDb();
    const projectRows = await sql`
      SELECT * FROM recording_projects
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC;
    ` as DbRecordingProject[];
    const segmentRows = await sql`
      SELECT
        rps.*,
        r.title,
        r.duration_seconds,
        r.file_size_bytes,
        r.mime_type,
        r.storage_url,
        r.blob_pathname
      FROM recording_project_segments rps
      JOIN recording_projects rp ON rp.id = rps.project_id
      JOIN recordings r ON r.id = rps.recording_id
      WHERE rp.user_id = ${userId}
      ORDER BY rps.project_id, rps.sequence_number;
    ` as DbRecordingProjectSegment[];

    const segmentsByProject = new Map<string, RecordingProjectSegment[]>();
    segmentRows.forEach((row) => {
      const segments = segmentsByProject.get(row.project_id) ?? [];
      segments.push(serializeSegment(row));
      segmentsByProject.set(row.project_id, segments);
    });
    return NextResponse.json({
      projects: projectRows.map((row) => serializeProject(row, segmentsByProject.get(row.id) ?? [])),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** POST /api/recording-projects — Creates an empty resumable lecture project. */
export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const mediaProfile = body.media_profile ?? null;
    const settings = body.settings ?? {};
    if (!title || title.length > 255) {
      return NextResponse.json({ error: 'Project title must be between 1 and 255 characters.' }, { status: 400 });
    }
    if (mediaProfile !== null && !isRecordingMediaProfile(mediaProfile)) {
      return NextResponse.json({ error: 'Invalid recording media profile.' }, { status: 400 });
    }
    if (!isPlainObject(settings)) {
      return NextResponse.json({ error: 'Project settings must be an object.' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      INSERT INTO recording_projects (user_id, title, media_profile, settings)
      VALUES (${userId}, ${title}, ${mediaProfile ? JSON.stringify(mediaProfile) : null}, ${JSON.stringify(settings)})
      RETURNING *;
    ` as DbRecordingProject[];
    return NextResponse.json({ project: serializeProject(rows[0], []) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** PATCH /api/recording-projects — Updates project metadata with optimistic revision control. */
export async function PATCH(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const expectedRevision = Number.isInteger(body.expected_revision) ? body.expected_revision : -1;
    const title = body.title === undefined ? null : String(body.title).trim();
    const status = body.status === undefined ? null : body.status;
    const settings = body.settings === undefined ? null : body.settings;
    if (!id || expectedRevision < 0) {
      return NextResponse.json({ error: 'Project ID and expected_revision are required.' }, { status: 400 });
    }
    if (title !== null && (!title || title.length > 255)) {
      return NextResponse.json({ error: 'Project title must be between 1 and 255 characters.' }, { status: 400 });
    }
    if (status !== null && !isRecordingProjectStatus(status)) {
      return NextResponse.json({ error: 'Invalid project status.' }, { status: 400 });
    }
    if (settings !== null && !isPlainObject(settings)) {
      return NextResponse.json({ error: 'Project settings must be an object.' }, { status: 400 });
    }
    if (title === null && status === null && settings === null) {
      return NextResponse.json({ error: 'No project changes were provided.' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      UPDATE recording_projects rp
      SET
        title = COALESCE(${title}, rp.title),
        status = COALESCE(${status}, rp.status),
        settings = COALESCE(${settings ? JSON.stringify(settings) : null}::jsonb, rp.settings),
        revision = rp.revision + 1,
        updated_at = NOW()
      WHERE rp.id = ${id}
        AND rp.user_id = ${userId}
        AND rp.revision = ${expectedRevision}
        AND (
          ${status}::text IS DISTINCT FROM 'completed'
          OR EXISTS (
            SELECT 1 FROM recording_project_segments rps WHERE rps.project_id = rp.id
          )
        )
      RETURNING rp.*;
    ` as DbRecordingProject[];
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Project was not found, has no segments, or was changed in another tab.' },
        { status: 409 },
      );
    }
    const segmentRows = await sql`
      SELECT
        rps.*,
        r.title,
        r.duration_seconds,
        r.file_size_bytes,
        r.mime_type,
        r.storage_url,
        r.blob_pathname
      FROM recording_project_segments rps
      JOIN recordings r ON r.id = rps.recording_id
      WHERE rps.project_id = ${id}
      ORDER BY rps.sequence_number;
    ` as DbRecordingProjectSegment[];
    return NextResponse.json({
      project: serializeProject(rows[0], segmentRows.map(serializeSegment)),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

/** DELETE /api/recording-projects — Deletes the project only; finalized recordings remain intact. */
export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  try {
    const { id } = await request.json();
    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Project ID is required.' }, { status: 400 });
    }
    const sql = getDb();
    const rows = await sql`
      DELETE FROM recording_projects
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id;
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 404 });
    }
    return NextResponse.json({ deleted: rows[0].id });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

