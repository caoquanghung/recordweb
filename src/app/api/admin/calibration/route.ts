import type { NextRequest } from 'next/server';
import { adminApi } from '@/lib/adminLibrary';
import { listAdminCalibration } from '@/lib/adminCalibration';

/** GET /api/admin/calibration — users with calibration status (`recordings:manage`). */
export async function GET(request: NextRequest) {
  return adminApi(() => listAdminCalibration(request));
}
