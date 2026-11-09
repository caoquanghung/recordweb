import 'server-only';

import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { adminRecordingsByIds, AdminLibraryError, requireAdminUuid } from '@/lib/adminLibrary';
import { ADMIN_ASSET_KINDS, ADMIN_DOWNLOAD_PAGE_SIZE, buildAdminDownloadManifest } from '@/lib/adminLibraryPolicy';

export async function downloadAdminRecording(id: string, kind?: string) {
  const [recording] = await adminRecordingsByIds([requireAdminUuid(id)]);
  if (!recording) throw new AdminLibraryError(404, 'Không tìm thấy bản ghi.');
  const manifest = buildAdminDownloadManifest([recording], `${recording.id}-${recording.title}-assets`);
  if (kind !== undefined) {
    if (!(ADMIN_ASSET_KINDS as readonly string[]).includes(kind)) throw new AdminLibraryError(400, 'Loại file không hợp lệ.');
    const file = manifest.files.find((file) => file.url && file.name.split('/').at(-1)?.startsWith(`${kind}.`));
    if (!file) throw new AdminLibraryError(404, 'Bản ghi không có file này.');
    return { name: file.name.split('/').at(-1)!, files: [file] };
  }
  return manifest;
}

export async function downloadSelectedAdminRecordings(ids: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.length > ADMIN_DOWNLOAD_PAGE_SIZE) {
    throw new AdminLibraryError(400, 'Chọn từ 1 đến 100 bản ghi mỗi yêu cầu.');
  }
  const unique = [...new Set(ids.map(requireAdminUuid))];
  const recordings = await adminRecordingsByIds(unique);
  if (recordings.length !== unique.length) throw new AdminLibraryError(409, 'Một số bản ghi đã bị xoá. Làm mới danh sách trước khi tải.');
  return buildAdminDownloadManifest(recordings, 'selected-recordings');
}

export async function downloadUserAdminRecordings(userId: string, request: NextRequest) {
  const sql = getDb();
  const [user] = await sql`SELECT email FROM users WHERE id = ${userId};`;
  if (!user) throw new AdminLibraryError(404, 'Không tìm thấy user.');
  const cursor = request.nextUrl.searchParams.get('cursor');
  if (cursor) requireAdminUuid(cursor);
  const timestamp = request.nextUrl.searchParams.get('snapshotAt') ?? new Date().toISOString();
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || parsed > Date.now() + 5_000) throw new AdminLibraryError(400, 'Mốc thời gian tải không hợp lệ.');
  const snapshotAt = new Date(parsed).toISOString();
  const rows = await sql`SELECT id FROM recordings WHERE user_id = ${userId} AND created_at <= ${snapshotAt}
    AND (${cursor}::uuid IS NULL OR id > ${cursor}::uuid) ORDER BY id LIMIT ${ADMIN_DOWNLOAD_PAGE_SIZE + 1};`;
  const page = rows.slice(0, ADMIN_DOWNLOAD_PAGE_SIZE);
  const recordings = await adminRecordingsByIds(page.map((row) => row.id as string));
  if (recordings.length !== page.length) throw new AdminLibraryError(409, 'Dữ liệu vừa thay đổi. Hãy bắt đầu lại lượt tải.');
  return {
    ...buildAdminDownloadManifest(recordings, `${user.email}-recordings`), snapshotAt,
    nextCursor: rows.length > ADMIN_DOWNLOAD_PAGE_SIZE ? page.at(-1)!.id as string : null,
  };
}
