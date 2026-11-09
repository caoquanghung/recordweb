import type { NextRequest } from 'next/server';
import { adminApi, listAdminUsers } from '@/lib/adminLibrary';

export async function GET(request: NextRequest) {
  return adminApi(() => listAdminUsers(request));
}
