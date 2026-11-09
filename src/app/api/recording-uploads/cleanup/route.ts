import { NextRequest, NextResponse } from 'next/server';
import { cleanupExpiredUploads } from '@/lib/recordingUploads';
import { cleanupAdminDeletions } from '@/lib/adminDeletions';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const adminDeletions = await cleanupAdminDeletions(request);
    return NextResponse.json({ cleaned: await cleanupExpiredUploads(request), adminDeletions });
  } catch (error) {
    console.error('Scheduled recording cleanup failed', error);
    return NextResponse.json({ error: 'Cleanup needs a retry.' }, { status: 500 });
  }
}
