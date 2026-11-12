import type { NextRequest } from 'next/server';
import { calibrationApi, calibrationJsonBody } from '@/lib/calibration/api';
import { commitCalibrationPostures } from '@/lib/calibration/server';

/** PUT /api/calibration/postures — atomically commits uploaded images into the profile. */
export async function PUT(request: NextRequest) {
  return calibrationApi(request, async (userId) => {
    const profile = await commitCalibrationPostures(userId, await calibrationJsonBody(request), request);
    return { profile };
  });
}
