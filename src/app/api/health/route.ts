import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { isBlobStorageConfigured } from '@/lib/blobCredentials';
import { getDb, isDbConfigured } from '@/lib/db';

export async function GET(request: NextRequest) {
  const authorization = await requirePermission('diagnostics:internal');
  if (!authorization.authorized) return authorization.response;

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
      blob: isBlobStorageConfigured(request) ? 'configured' : 'not-configured',
      checkedAt: new Date().toISOString(),
    },
    { status: database === 'error' ? 503 : 200 }
  );
}
