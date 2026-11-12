import { after, type NextRequest } from 'next/server';
import { calibrationApi } from '@/lib/calibration/api';
import { deleteCalibrationProfile, getCalibrationProfile, sweepCalibrationBlobs } from '@/lib/calibration/server';

/** GET /api/calibration — the caller's calibration profile, or `{ profile: null }`. */
export async function GET(request: NextRequest) {
  return calibrationApi(request, async (userId) => {
    const profile = await getCalibrationProfile(userId);
    if (profile) after(() => sweepCalibrationBlobs(userId, request));
    return { profile };
  });
}

/** DELETE /api/calibration — removes the profile, its rows and every calibration Blob. */
export async function DELETE(request: NextRequest) {
  return calibrationApi(request, async (userId) => {
    await deleteCalibrationProfile(userId, request);
    return { profile: null };
  });
}
