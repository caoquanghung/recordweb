import { adminApi } from '@/lib/adminLibrary';
import { downloadAdminCalibration } from '@/lib/adminCalibration';

/** GET /api/admin/calibration/:userId/download — ZIP manifest for one user's profile. */
export async function GET(_request: Request, context: RouteContext<'/api/admin/calibration/[userId]/download'>) {
  return adminApi(async () => downloadAdminCalibration((await context.params).userId));
}
