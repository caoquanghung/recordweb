import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';

// Simple in-memory rate limiter; the allowance is defined below.
// Replace with a Redis-backed solution (e.g. Upstash) for production scale.
const uploadRateLimiter = new Map<string, { count: number; resetAt: number }>();
// A complete session can request seven client-upload tokens (composite, video
// sources, mixed audio, two optional source-audio files, and cursor JSON).
const MAX_UPLOADS_PER_HOUR = 40;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = uploadRateLimiter.get(userId);

  if (!entry || entry.resetAt < now) {
    uploadRateLimiter.set(userId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }

  if (entry.count >= MAX_UPLOADS_PER_HOUR) return false;

  entry.count++;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Token generation comes from the signed-in browser. The completion
        // callback comes from Vercel Blob and is verified by handleUpload.
        const userId = await getSessionUserId();
        if (!userId) {
          throw new Error('Unauthorized');
        }

        if (!checkRateLimit(userId)) {
          throw new Error(
            `Upload rate limit exceeded (max ${MAX_UPLOADS_PER_HOUR}/hour).`
          );
        }

        return {
          // §2.10 — Accept both MP4 (preferred) and WebM (fallback) per codec detection
          allowedContentTypes: [
            'video/mp4',
            'video/webm',
            'audio/mp4',
            'audio/webm',
            'application/json',
          ],
          maximumSizeInBytes: 300 * 1024 * 1024, // 300MB ceiling for 30-min 1080p
          tokenPayload: JSON.stringify({
            userId,
            uploadedAt: new Date().toISOString(),
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log('Blob upload completed:', blob.url, '| payload:', tokenPayload);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
