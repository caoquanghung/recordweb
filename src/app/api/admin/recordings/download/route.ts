import { adminApi, adminBody } from '@/lib/adminLibrary';
import { downloadSelectedAdminRecordings } from '@/lib/adminDownloads';

export async function POST(request: Request) {
  return adminApi(async () => downloadSelectedAdminRecordings((await adminBody(request)).ids), request);
}
