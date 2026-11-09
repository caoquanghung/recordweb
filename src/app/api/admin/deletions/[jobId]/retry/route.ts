import { adminApi, requireAdminUuid, AdminLibraryError } from '@/lib/adminLibrary';
import { getAdminDeletion, runAdminDeletion } from '@/lib/adminDeletions';

export async function POST(request: Request, context: RouteContext<'/api/admin/deletions/[jobId]/retry'>) {
  return adminApi(async (auth) => {
    const id = requireAdminUuid((await context.params).jobId);
    const job = await getAdminDeletion(id);
    if (job.target_user_id === auth.userId) throw new AdminLibraryError(403, 'Không được tiếp tục tác vụ xoá chính mình.');
    return { job: await runAdminDeletion(id, request) };
  }, request);
}
