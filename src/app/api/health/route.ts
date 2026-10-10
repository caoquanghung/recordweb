import { NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getDb, isDbConfigured } from '@/lib/db';

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();

  let database: 'connected' | 'not-configured' | 'error' = 'not-configured';

  if (isDbConfigured) {
    try {
      const sql = getDb();
      await sql`SELECT 1 AS ok;`;
      database = 'connected';
    } catch {
      database = 'error';
    }
  }

  return NextResponse.json(
    {
      auth: 'authenticated',
      database,
      blob: process.env.BLOB_READ_WRITE_TOKEN ? 'configured' : 'not-configured',
      checkedAt: new Date().toISOString(),
    },
    { status: database === 'error' ? 503 : 200 }
  );
}
