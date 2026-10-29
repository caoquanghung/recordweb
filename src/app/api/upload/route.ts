import { issueSignedToken } from '@vercel/blob';
import {
  handleUpload,
  handleUploadPresigned,
  type HandleUploadBody,
  type HandleUploadPresignedBody,
} from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId } from '@/lib/auth';
import { authorizeUploadPath, handleUploadCompleted } from '@/lib/recordingUploads';
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
          onBeforeGenerateToken: async (pathname) => {
            const userId = await authorizeUpload();
            const { attempt, asset } = await authorizeUploadPath(userId, pathname);
            return {
              allowedContentTypes: [asset.contentType],
              maximumSizeInBytes: asset.size,
              validUntil: Date.parse(attempt.token_expires_at),
              addRandomSuffix: false,
              allowOverwrite: false,
              tokenPayload: JSON.stringify({
                userId,
                uploadedAt: new Date().toISOString(),
              }),
            };
          },
          onUploadCompleted: async ({ blob }) => handleUploadCompleted(blob.pathname, request),
        })
      : await handleUploadPresigned({
          body: body as HandleUploadPresignedBody,
          request,
          webhookPublicKey: getBlobWebhookPublicKey(),
          getSignedToken: async (pathname) => {
            const userId = await authorizeUpload();
            const { attempt, asset } = await authorizeUploadPath(userId, pathname);
            return {
              token: await issueSignedToken({
                ...getBlobCommandCredentials(request),
                pathname,
                operations: ['put'],
                allowedContentTypes: [asset.contentType],
                maximumSizeInBytes: asset.size,
                validUntil: Date.parse(attempt.token_expires_at),
              }),
              urlOptions: { addRandomSuffix: false, allowOverwrite: false },
            };
          },
          onUploadCompleted: async ({ blob }) => handleUploadCompleted(blob.pathname, request),
        });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
