import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { requirePermission, type AuthContext } from '@/lib/auth';
import { getDb, isDbConfigured } from '@/lib/db';
import { ADMIN_PAGE_SIZE, isAdminUuid } from '@/lib/adminLibraryPolicy';
import type { AdminRecording } from '@/types/adminLibrary';

export class AdminLibraryError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function adminApi(action: (context: AuthContext) => Promise<unknown>, request?: Request) {
  const result = await requirePermission('recordings:manage');
  if (!result.authorized) return result.response;
  if (request && !['GET', 'HEAD'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }
  if (!isDbConfigured) return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  try {
    return NextResponse.json(await action(result.context), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AdminLibraryError) return NextResponse.json({ error: error.message }, { status: error.status });
    const code = (error as { code?: string }).code;
    if (code === 'P0002') return NextResponse.json({ error: 'Không tìm thấy dữ liệu.' }, { status: 404 });
    if (code === '42501') return NextResponse.json({ error: 'Không được xoá tài khoản này.' }, { status: 403 });
    if (code === '22023') return NextResponse.json({ error: 'Thông tin xác nhận không hợp lệ.' }, { status: 400 });
    if (code === '55000' || code === '23505') return NextResponse.json({ error: 'User đang có tác vụ xoá. Hãy tiếp tục tác vụ đó trước.' }, { status: 409 });
    console.error('Admin library operation failed', error);
    return NextResponse.json({ error: 'Không thể hoàn tất thao tác. Vui lòng thử lại.' }, { status: 500 });
  }
}

export function requireAdminUuid(value: unknown): string {
  if (!isAdminUuid(value)) throw new AdminLibraryError(400, 'ID không hợp lệ.');
  return value;
}

export function requireAdminUserId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 128) throw new AdminLibraryError(400, 'User ID không hợp lệ.');
  return value;
}

export function adminPage(request: NextRequest) {
  const value = Number(request.nextUrl.searchParams.get('page') ?? '1');
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new AdminLibraryError(400, 'Trang không hợp lệ.');
  return value;
}

export async function adminBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 32_000) throw new AdminLibraryError(400, 'Yêu cầu quá lớn.');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new AdminLibraryError(400, 'Nội dung yêu cầu không hợp lệ.'); }
}

export async function adminRecordingsByIds(ids: string[]): Promise<AdminRecording[]> {
  const sql = getDb();
  return await sql`SELECT r.*, u.email AS owner_email, u.display_name AS owner_display_name, u.role AS owner_role,
      COALESCE((SELECT jsonb_agg(a ORDER BY a.kind) FROM recording_assets a WHERE a.recording_id = r.id), '[]'::jsonb) AS assets
    FROM recordings r JOIN users u ON u.id = r.user_id
    WHERE r.id = ANY(${ids}::uuid[]) ORDER BY r.recorded_at DESC, r.id DESC;` as AdminRecording[];
}

export async function listAdminRecordings(request: NextRequest) {
  const sql = getDb();
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 255);
  const ownerId = request.nextUrl.searchParams.get('userId') ?? '';
  if (ownerId.length > 128) throw new AdminLibraryError(400, 'User ID không hợp lệ.');
  const page = adminPage(request);
  const oldest = request.nextUrl.searchParams.get('sort') === 'oldest';
  // One result object preserves the total even when the requested page is empty.
  const rows = await sql`WITH filtered AS (
      SELECT r.*, u.email AS owner_email, u.display_name AS owner_display_name, u.role AS owner_role
      FROM recordings r JOIN users u ON u.id = r.user_id
      WHERE (${ownerId} = '' OR r.user_id = ${ownerId})
        AND (${query} = '' OR STRPOS(LOWER(r.title), LOWER(${query})) > 0 OR STRPOS(LOWER(u.email), LOWER(${query})) > 0)
    ), page AS (
      SELECT * FROM filtered ORDER BY
        CASE WHEN ${oldest} THEN recorded_at END ASC,
        CASE WHEN NOT ${oldest} THEN recorded_at END DESC, id DESC
      LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
    ) SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(p) FROM (
        SELECT page.*, COALESCE((SELECT jsonb_agg(a ORDER BY a.kind) FROM recording_assets a WHERE a.recording_id = page.id), '[]'::jsonb) AS assets
        FROM page ORDER BY CASE WHEN ${oldest} THEN recorded_at END ASC,
          CASE WHEN NOT ${oldest} THEN recorded_at END DESC, id DESC
      ) p), '[]'::jsonb) AS recordings;`;
  return { ...rows[0], page, pageSize: ADMIN_PAGE_SIZE };
}

export async function listAdminUsers(request: NextRequest) {
  const sql = getDb();
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 255);
  const page = adminPage(request);
  const rows = await sql`WITH filtered AS (
    SELECT u.*, (SELECT COUNT(*)::int FROM recordings r WHERE r.user_id = u.id) AS recording_count
    FROM users u WHERE ${query} = '' OR STRPOS(LOWER(u.email), LOWER(${query})) > 0
      OR STRPOS(LOWER(COALESCE(u.display_name, '')), LOWER(${query})) > 0
  ) SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
    COALESCE((SELECT jsonb_agg(p) FROM (SELECT * FROM filtered ORDER BY email, id LIMIT 20 OFFSET ${(page - 1) * 20}) p), '[]'::jsonb) AS users;`;
  return { ...rows[0], page, pageSize: 20 };
}
