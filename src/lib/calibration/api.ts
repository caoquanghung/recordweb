import 'server-only';

import { NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { isDbConfigured } from '@/lib/db';
import { CalibrationError } from './server';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Shared wrapper for owner-scoped calibration endpoints: session check, same-origin
 * mutations, sanitized errors and no shared caching. The handler receives the verified user id.
 */
export async function calibrationApi(
  request: Request,
  action: (userId: string) => Promise<unknown>,
): Promise<NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (!isDbConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json(await action(userId), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof CalibrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    }
    console.error('Calibration operation failed', error);
    return NextResponse.json({ error: 'Không thể hoàn tất thao tác. Vui lòng thử lại.' }, { status: 500, headers: NO_STORE });
  }
}

export async function calibrationJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 64_000) throw new CalibrationError(400, 'Yêu cầu quá lớn.');
  try {
    return JSON.parse(text);
  } catch {
    throw new CalibrationError(400, 'Nội dung yêu cầu không hợp lệ.');
  }
}
