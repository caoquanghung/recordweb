import { after, NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import {
  cancelUploadAttempt, cleanupExpiredUploads, cleanupUploadAttempt,
  heartbeatUploadAttempt, startUploadAttempt, UploadConflict,
} from '@/lib/recordingUploads';

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  try {
    const body = await request.json();
    if (body.action === 'start') {
      const result = await startUploadAttempt(userId, body.id, body.localId, body.assets);
      after(async () => { await cleanupExpiredUploads(request, userId).catch((error) => console.error('Upload cleanup needs retry', error)); });
      return NextResponse.json(result);
    }
    if (body.action === 'cancel') {
      const attempt = await cancelUploadAttempt(userId, body.id, body.localId, body.assets);
      if (!attempt) return NextResponse.json({ error: 'Upload not found.' }, { status: 404 });
      if (attempt.status === 'cancelled') {
        after(() => cleanupUploadAttempt(attempt.id, request).catch((error) => console.error('Upload cleanup needs retry', error)));
      }
      return NextResponse.json({ status: attempt.status });
    }
    if (body.action === 'heartbeat') {
      await heartbeatUploadAttempt(userId, body.id);
      return NextResponse.json({ status: 'uploading' });
    }
    return NextResponse.json({ error: 'Unknown upload action.' }, { status: 400 });
  } catch (error) {
    console.error('Recording upload request failed', error);
    return NextResponse.json({ error: error instanceof UploadConflict ? error.message : 'Could not update this upload. Please try again.' },
      { status: error instanceof UploadConflict ? 409 : 400 });
  }
}
