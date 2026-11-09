import { adminApi } from '@/lib/adminLibrary';
import { downloadAdminRecording } from '@/lib/adminDownloads';

export async function GET(_request: Request, context: RouteContext<'/api/admin/recordings/[recordingId]/download'>) {
  return adminApi(async () => downloadAdminRecording((await context.params).recordingId));
}
