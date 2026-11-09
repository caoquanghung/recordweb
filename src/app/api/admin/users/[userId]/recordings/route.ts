import { adminApi, adminBody, requireAdminUserId } from '@/lib/adminLibrary';
import { createAdminDeletion, runAdminDeletion } from '@/lib/adminDeletions';

export async function DELETE(request: Request, context: RouteContext<'/api/admin/users/[userId]/recordings'>) {
  return adminApi(async (auth) => {
    const userId = requireAdminUserId((await context.params).userId);
    const body = await adminBody(request);
    const id = await createAdminDeletion(auth.userId, userId, 'recordings', null, body.confirmEmail);
    return { job: await runAdminDeletion(id, request) };
  }, request);
}
