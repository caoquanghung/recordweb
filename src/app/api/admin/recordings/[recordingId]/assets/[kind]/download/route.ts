import { adminApi } from '@/lib/adminLibrary';
import { downloadAdminRecording } from '@/lib/adminDownloads';

export async function GET(_request: Request, context: RouteContext<'/api/admin/recordings/[recordingId]/assets/[kind]/download'>) {
  return adminApi(async () => {
    const { recordingId, kind } = await context.params;
    return downloadAdminRecording(recordingId, kind);
  });
}
