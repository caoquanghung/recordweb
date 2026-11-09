import { adminApi, adminBody, requireAdminUserId, AdminLibraryError } from '@/lib/adminLibrary';
import { createAdminDeletion, publicDeletionJob, runAdminDeletion } from '@/lib/adminDeletions';
import { getDb } from '@/lib/db';
import type { DbAdminDeletionJob } from '@/types/database';

export async function DELETE(request: Request, context: RouteContext<'/api/admin/users/[userId]'>) {
  return adminApi(async (auth) => {
    const userId = requireAdminUserId((await context.params).userId);
    const body = await adminBody(request);
    const sql = getDb();
    const [user] = await sql`SELECT id FROM users WHERE id = ${userId};`;
    if (!user) {
      const [job] = await sql`SELECT * FROM admin_deletion_jobs WHERE target_user_id = ${userId}
        AND scope = 'account' ORDER BY created_at DESC LIMIT 1;`;
      if (!job) throw new AdminLibraryError(404, 'Không tìm thấy user.');
      if (body.confirmEmail !== job.target_email) throw new AdminLibraryError(400, 'Email xác nhận không khớp.');
      return { job: job.status === 'completed' ? publicDeletionJob(job as DbAdminDeletionJob) : await runAdminDeletion(job.id as string, request) };
    }
    const id = await createAdminDeletion(auth.userId, userId, 'account', null, body.confirmEmail);
    return { job: await runAdminDeletion(id, request) };
  }, request);
}
