import { adminApi, requireAdminUuid, AdminLibraryError } from '@/lib/adminLibrary';
import { createAdminDeletion, publicDeletionJob, runAdminDeletion } from '@/lib/adminDeletions';
import { getDb } from '@/lib/db';
import type { DbAdminDeletionJob } from '@/types/database';

export async function DELETE(request: Request, context: RouteContext<'/api/admin/recordings/[recordingId]'>) {
  return adminApi(async (auth) => {
    const id = requireAdminUuid((await context.params).recordingId);
    const sql = getDb();
    const [recording] = await sql`SELECT user_id FROM recordings WHERE id = ${id};`;
    if (!recording) {
      const [previous] = await sql`SELECT * FROM admin_deletion_jobs WHERE recording_id = ${id} ORDER BY created_at DESC LIMIT 1;`;
      if (previous?.status === 'completed') return { job: publicDeletionJob(previous as DbAdminDeletionJob) };
      throw new AdminLibraryError(404, 'Không tìm thấy bản ghi.');
    }
    const jobId = await createAdminDeletion(auth.userId, recording.user_id as string, 'recording', id, null);
    return { job: await runAdminDeletion(jobId, request) };
  }, request);
}
