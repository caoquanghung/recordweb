import { issueSignedToken } from '@vercel/blob';
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import {
  getBlobClientUploadMethod,
  getBlobCommandCredentials,
  getBlobWebhookPublicKey,
} from '@/lib/blobCredentials';
import {
  CALIBRATION_MAX_BYTES,
  CALIBRATION_PREFIX,
  CALIBRATION_UPLOAD_LIMIT_PER_HOUR,
  isCalibrationPathnameFor,
} from '@/lib/calibration/policy';
import { CalibrationError, recordCalibrationUploadToken } from '@/lib/calibration/server';

// Per-process limiter, same approach as /api/upload. Nine images per save plus retakes.
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function withinRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(userId);
  if (!entry || entry.resetAt < now) {
    rateLimiter.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= CALIBRATION_UPLOAD_LIMIT_PER_HOUR) return false;
  entry.count += 1;
  return true;
}

async function authorizeCalibrationUpload(pathname: string): Promise<{ userId: string; validUntil: number }> {
  const userId = await getSessionUserId();
  if (!userId) throw new CalibrationError(401, 'Unauthorized');
  if (!isCalibrationPathnameFor(userId, pathname)) throw new CalibrationError(400, 'Đường dẫn upload không hợp lệ.');
  if (!withinRateLimit(userId)) {
    throw new CalibrationError(429, `Đã vượt giới hạn upload (tối đa ${CALIBRATION_UPLOAD_LIMIT_PER_HOUR} ảnh mỗi giờ).`);
  }
  await recordCalibrationUploadToken(userId, pathname);
  return { userId, validUntil: Date.now() + 60 * 60 * 1000 };
}

/** GET — tells the browser which upload method to use and the pathname prefix it may write to. */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  return NextResponse.json(
    { uploadMethod: getBlobClientUploadMethod(), prefix: `${CALIBRATION_PREFIX}${userId}/` },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

/**
 * POST — issues Blob client-upload tokens for calibration images. Images never pass
 * through this handler's body; the browser uploads directly to Vercel Blob. No
 * completion callback is registered, so no unauthenticated callback route is required.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body: unknown = await request.json();
    const method = getBlobClientUploadMethod();
    const tokenPayload = (userId: string) => JSON.stringify({ userId, uploadedAt: new Date().toISOString() });

    const jsonResponse = method === 'client-token'
      ? await handleUpload({
          body: body as HandleUploadBody,
          request,
          ...getBlobCommandCredentials(request),
          onBeforeGenerateToken: async (pathname) => {
            const { userId, validUntil } = await authorizeCalibrationUpload(pathname);
            return {
              allowedContentTypes: ['image/png'],
              maximumSizeInBytes: CALIBRATION_MAX_BYTES,
              validUntil,
              addRandomSuffix: false,
              allowOverwrite: false,
              tokenPayload: tokenPayload(userId),
            };
          },
        })
      : await handleUploadPresigned({
          body: body as HandleUploadPresignedBody,
          request,
          webhookPublicKey: getBlobWebhookPublicKey(),
          getSignedToken: async (pathname) => {
            const { validUntil } = await authorizeCalibrationUpload(pathname);
            return {
              token: await issueSignedToken({
                ...getBlobCommandCredentials(request),
                pathname,
                operations: ['put'],
                allowedContentTypes: ['image/png'],
                maximumSizeInBytes: CALIBRATION_MAX_BYTES,
                validUntil,
              }),
              urlOptions: { addRandomSuffix: false, allowOverwrite: false },
            };
          },
        });

    return NextResponse.json(jsonResponse, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof CalibrationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Calibration upload token failed', error);
    return NextResponse.json({ error: 'Không thể chuẩn bị upload. Vui lòng thử lại.' }, { status: 400 });
  }
}
