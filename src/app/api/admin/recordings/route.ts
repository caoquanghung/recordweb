import type { NextRequest } from 'next/server';
import { adminApi, listAdminRecordings } from '@/lib/adminLibrary';

export async function GET(request: NextRequest) {
  return adminApi(() => listAdminRecordings(request));
}
