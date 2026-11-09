import 'server-only';

import { clerkClient } from '@clerk/nextjs/server';
import { del } from '@vercel/blob';
import { randomUUID } from 'node:crypto';
import { getDb } from '@/lib/db';
import { getBlobCommandCredentials } from '@/lib/blobCredentials';
import { AdminLibraryError } from '@/lib/adminLibrary';
import { canAdminDeleteUser } from '@/lib/adminLibraryPolicy';
import { parseAppRole } from '@/lib/auth/roles';
import type { AdminDeletionJob, AdminDeletionScope } from '@/types/adminLibrary';
import type { DbAdminDeletionJob } from '@/types/database';

export function publicDeletionJob(row: DbAdminDeletionJob): AdminDeletionJob {
  return {
    id: row.id, target_user_id: row.target_user_id, target_email: row.target_email,
    scope: row.scope, recording_id: row.recording_id, status: row.status,
    blob_cursor: row.blob_cursor, blob_count: row.blob_pathnames.length,
    recording_count: row.recording_ids.length, error: row.error,
    created_at: row.created_at, completed_at: row.completed_at,
  };
}

async function clerkTarget(userId: string) {
  try { return await (await clerkClient()).users.getUser(userId); }
  catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

async function assertDeletionTarget(actorId: string, userId: string) {
  const sql = getDb();
  const [mirror] = await sql`SELECT role FROM users WHERE id = ${userId};`;
  const user = await clerkTarget(userId);
  const role = user ? parseAppRole(user.publicMetadata.appRole) : (mirror?.role ?? 'user');
  if (!canAdminDeleteUser(actorId, userId, role) || mirror?.role === 'developer') {
    throw new AdminLibraryError(403, 'Không được xoá chính mình hoặc tài khoản developer.');
  }
  return user;
}

export async function createAdminDeletion(
  actorId: string, userId: string, scope: AdminDeletionScope, recordingId: string | null, email: unknown,
) {
  await assertDeletionTarget(actorId, userId);
  if (scope !== 'recording' && typeof email !== 'string') throw new AdminLibraryError(400, 'Nhập email để xác nhận xoá.');
  const sql = getDb();
  const [row] = await sql`SELECT begin_admin_deletion(${actorId}, ${userId}, ${scope}, ${recordingId}::uuid,
    ${typeof email === 'string' ? email.trim() : null}) AS id;`;
  return row.id as string;
}

export async function getAdminDeletion(id: string): Promise<DbAdminDeletionJob> {
  const sql = getDb();
  const [row] = await sql`SELECT * FROM admin_deletion_jobs WHERE id = ${id};`;
  if (!row) throw new AdminLibraryError(404, 'Không tìm thấy tác vụ xoá.');
  return row as DbAdminDeletionJob;
}

export async function listAdminDeletions() {
  const sql = getDb();
  // Unfinished operations always remain visible, even after many completed jobs.
  return await sql`SELECT id, target_user_id, target_email, scope, recording_id, status, blob_cursor,
    cardinality(blob_pathnames) AS blob_count, cardinality(recording_ids) AS recording_count, error, created_at, completed_at
    FROM admin_deletion_jobs ORDER BY (status <> 'completed') DESC, created_at DESC LIMIT 50;` as AdminDeletionJob[];
}

export async function runAdminDeletion(id: string, request?: Request): Promise<AdminDeletionJob> {
  const sql = getDb();
  const token = randomUUID();
  const [claimed] = await sql`UPDATE admin_deletion_jobs SET status = 'running', lease_token = ${token},
      lease_expires_at = NOW() + INTERVAL '2 minutes', error = NULL
    WHERE id = ${id} AND status <> 'completed'
      AND (lease_expires_at IS NULL OR lease_expires_at < NOW()) RETURNING *;`;
  if (!claimed) return publicDeletionJob(await getAdminDeletion(id));
  const job = claimed as DbAdminDeletionJob;
  try {
    await assertDeletionTarget(job.actor_user_id, job.target_user_id);
    const paths = job.blob_pathnames.slice(job.blob_cursor, job.blob_cursor + 200);
    if (paths.length) await del(paths, getBlobCommandCredentials(request));
    const cursor = job.blob_cursor + paths.length;
    if (cursor < job.blob_pathnames.length) {
      await sql`UPDATE admin_deletion_jobs SET blob_cursor = ${cursor}, status = 'pending',
        lease_token = NULL, lease_expires_at = NULL WHERE id = ${id} AND lease_token = ${token};`;
      return publicDeletionJob(await getAdminDeletion(id));
    }
    // If Clerk has already deleted the user, its webhook may have cascaded the DB
    // rows. The manifest above is independent of those rows and remains retryable.
    if (job.scope === 'account') {
      const user = await assertDeletionTarget(job.actor_user_id, job.target_user_id);
      if (user) {
        try { await (await clerkClient()).users.deleteUser(job.target_user_id); }
        catch (error) { if ((error as { status?: number }).status !== 404) throw error; }
      }
    }
    await sql.transaction([
      sql`UPDATE recording_projects p SET revision = revision + 1, updated_at = NOW()
        WHERE p.user_id = ${job.target_user_id} AND EXISTS (
          SELECT 1 FROM recording_project_segments s WHERE s.project_id = p.id AND s.recording_id = ANY(${job.recording_ids}::uuid[])
        ) AND EXISTS (SELECT 1 FROM admin_deletion_jobs WHERE id = ${id} AND lease_token = ${token});`,
      sql`DELETE FROM recordings WHERE user_id = ${job.target_user_id} AND id = ANY(${job.recording_ids}::uuid[])
        AND EXISTS (SELECT 1 FROM admin_deletion_jobs WHERE id = ${id} AND lease_token = ${token});`,
      sql`DELETE FROM users WHERE id = ${job.target_user_id} AND ${job.scope} = 'account'
        AND EXISTS (SELECT 1 FROM admin_deletion_jobs WHERE id = ${id} AND lease_token = ${token});`,
      sql`UPDATE admin_deletion_jobs SET status = 'completed', blob_cursor = cardinality(blob_pathnames),
        completed_at = NOW(), lease_token = NULL, lease_expires_at = NULL
        WHERE id = ${id} AND lease_token = ${token};`,
    ]);
  } catch (error) {
    console.error('Admin deletion requires retry', id, error);
    await sql`UPDATE admin_deletion_jobs SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
      error = 'Chưa hoàn tất xoá. Dữ liệu đã xoá không thể khôi phục; hãy thử lại để tiếp tục.'
      WHERE id = ${id} AND lease_token = ${token};`;
  }
  return publicDeletionJob(await getAdminDeletion(id));
}

export async function cleanupAdminDeletions(request?: Request) {
  const sql = getDb();
  const pending = await sql`SELECT id FROM admin_deletion_jobs WHERE status <> 'completed'
    AND (lease_expires_at IS NULL OR lease_expires_at < NOW()) ORDER BY created_at LIMIT 3;`;
  for (const row of pending) await runAdminDeletion(row.id as string, request);
  // Tokens issued before deletion can still finish after the initial Blob delete.
  // Repeat bounded sweeps, including one complete sweep after the token horizon.
  const completed = await sql`SELECT * FROM admin_deletion_jobs WHERE status = 'completed'
    AND (last_cleanup_at IS NULL OR last_cleanup_at <= cleanup_until) ORDER BY last_cleanup_at ASC NULLS FIRST LIMIT 3;`;
  for (const row of completed) {
    const job = row as DbAdminDeletionJob;
    const paths = job.blob_pathnames.slice(job.cleanup_cursor, job.cleanup_cursor + 200);
    if (paths.length) await del(paths, getBlobCommandCredentials(request));
    const done = job.cleanup_cursor + paths.length >= job.blob_pathnames.length;
    await sql`UPDATE admin_deletion_jobs SET cleanup_cursor = ${done ? 0 : job.cleanup_cursor + paths.length},
      last_cleanup_at = CASE WHEN ${done} THEN NOW() ELSE last_cleanup_at END WHERE id = ${job.id};`;
  }
  return pending.length;
}

export async function cleanupDeletedAdminUpload(pathname: string, request: Request) {
  const sql = getDb();
  const rows = await sql`SELECT id FROM admin_deletion_jobs WHERE ${pathname} = ANY(blob_pathnames) LIMIT 1;`;
  if (!rows.length) return false;
  await del(pathname, getBlobCommandCredentials(request));
  return true;
}
