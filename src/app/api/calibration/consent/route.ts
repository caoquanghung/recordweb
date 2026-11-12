import type { NextRequest } from 'next/server';
import { calibrationApi } from '@/lib/calibration/api';
import { CALIBRATION_CONSENT_VERSION } from '@/lib/calibration/policy';
import { acceptCalibrationConsent, getCalibrationProfile } from '@/lib/calibration/server';

/** POST /api/calibration/consent — records acceptance of the privacy notice (idempotent). */
export async function POST(request: NextRequest) {
  return calibrationApi(request, async (userId) => {
    await acceptCalibrationConsent(userId);
    return { profile: await getCalibrationProfile(userId), consentVersion: CALIBRATION_CONSENT_VERSION };
  });
}
