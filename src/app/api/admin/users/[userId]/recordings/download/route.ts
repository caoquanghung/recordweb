import type { NextRequest } from 'next/server';
import { adminApi, requireAdminUserId } from '@/lib/adminLibrary';
import { downloadUserAdminRecordings } from '@/lib/adminDownloads';

export async function GET(request: NextRequest, context: RouteContext<'/api/admin/users/[userId]/recordings/download'>) {
  return adminApi(async () => downloadUserAdminRecordings(requireAdminUserId((await context.params).userId), request));
}
