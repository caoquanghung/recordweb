import { adminApi } from '@/lib/adminLibrary';
import { listAdminDeletions } from '@/lib/adminDeletions';

export async function GET() {
  return adminApi(async () => ({ jobs: await listAdminDeletions() }));
}
