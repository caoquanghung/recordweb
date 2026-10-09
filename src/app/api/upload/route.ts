import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';

// Simple in-memory rate limiter: max 10 upload tokens per user per hour.
// Replace with a Redis-backed solution (e.g. Upstash) for production scale.
const uploadRateLimiter = new Map<string, { count: number; resetAt: number }>();
const MAX_UPLOADS_PER_HOUR = 10;

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
  // §2.9 — Auth gate: reject anonymous requests
  const userId = await getSessionUserId(request);
  if (!userId) return unauthorizedResponse();

  // §2.9 — Per-user rate limiting to prevent blob quota abuse
  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: `Upload rate limit exceeded (max ${MAX_UPLOADS_PER_HOUR}/hour).` },
      { status: 429 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          // §2.10 — Accept both MP4 (preferred) and WebM (fallback) per codec detection
          allowedContentTypes: ['video/mp4', 'video/webm'],
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
