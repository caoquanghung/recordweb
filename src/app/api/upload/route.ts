import { issueSignedToken } from '@vercel/blob';
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import {
  getBlobClientUploadMethod,
  getBlobCommandCredentials,
  getBlobWebhookPublicKey,
} from '@/lib/blobCredentials';

// Simple in-memory rate limiter; the allowance is defined below.
// Replace with a Redis-backed solution (e.g. Upstash) for production scale.
const uploadRateLimiter = new Map<string, { count: number; resetAt: number }>();
// A complete session can request seven client-upload tokens (composite, video
// sources, mixed audio, two optional source-audio files, and cursor JSON).
const MAX_UPLOADS_PER_HOUR = 40;
const MAXIMUM_UPLOAD_SIZE = 300 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  'video/mp4',
  'video/webm',
  'audio/mp4',
  'audio/webm',
  'application/json',
];

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

async function authorizeUpload(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Unauthorized');

  if (!checkRateLimit(userId)) {
    throw new Error(
      `Upload rate limit exceeded (max ${MAX_UPLOADS_PER_HOUR}/hour).`
    );
  }

  return userId;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ uploadMethod: getBlobClientUploadMethod() });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    const uploadMethod = getBlobClientUploadMethod();

    const jsonResponse = uploadMethod === 'client-token'
      ? await handleUpload({
          body: body as HandleUploadBody,
          request,
          ...getBlobCommandCredentials(request),
          onBeforeGenerateToken: async () => {
            const userId = await authorizeUpload();
            return {
              allowedContentTypes: ALLOWED_CONTENT_TYPES,
              maximumSizeInBytes: MAXIMUM_UPLOAD_SIZE,
              tokenPayload: JSON.stringify({
                userId,
                uploadedAt: new Date().toISOString(),
              }),
            };
          },
          onUploadCompleted: async ({ blob, tokenPayload }) => {
            console.log('Blob upload completed:', blob.url, '| payload:', tokenPayload);
          },
        })
      : await handleUploadPresigned({
          body: body as HandleUploadPresignedBody,
          request,
          webhookPublicKey: getBlobWebhookPublicKey(),
          getSignedToken: async (pathname) => {
            await authorizeUpload();
            return {
              token: await issueSignedToken({
                ...getBlobCommandCredentials(request),
                pathname,
                operations: ['put'],
                allowedContentTypes: ALLOWED_CONTENT_TYPES,
                maximumSizeInBytes: MAXIMUM_UPLOAD_SIZE,
              }),
            };
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
