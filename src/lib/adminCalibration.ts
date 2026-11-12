import 'server-only';

import type { NextRequest } from 'next/server';
import { AdminLibraryError, adminPage, requireAdminUserId } from '@/lib/adminLibrary';
import { adminFileStem } from '@/lib/adminLibraryPolicy';
import { getDb } from '@/lib/db';
import type { AdminCalibrationUser } from '@/types/calibration';
import type { AdminDownloadManifest } from '@/types/adminLibrary';
import type { DbCalibrationPosture, DbCalibrationProfile } from '@/types/database';

const PAGE_SIZE = 20;

/** Users with their calibration status; users without a profile are included. */
export async function listAdminCalibration(request: NextRequest) {
  const sql = getDb();
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 255);
  const page = adminPage(request);
  const rows = await sql`WITH filtered AS (
      SELECT u.id, u.email, u.display_name, p.consent_version, p.updated_at
      FROM users u LEFT JOIN calibration_profiles p ON p.user_id = u.id
      WHERE ${query} = '' OR STRPOS(LOWER(u.email), LOWER(${query})) > 0
        OR STRPOS(LOWER(COALESCE(u.display_name, '')), LOWER(${query})) > 0
    ) SELECT (SELECT COUNT(*)::int FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(row_to_json(page)) FROM (
        SELECT f.id, f.email, f.display_name, f.consent_version, f.updated_at,
          (SELECT COUNT(*)::int FROM calibration_postures c WHERE c.user_id = f.id) AS completeness,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('cellRow', c.cell_row, 'cellCol', c.cell_col, 'url', c.storage_url)
            ORDER BY c.cell_row, c.cell_col) FROM calibration_postures c WHERE c.user_id = f.id), '[]'::jsonb) AS postures
        FROM filtered f ORDER BY f.email, f.id LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
      ) page), '[]'::jsonb) AS users;`;
  return { ...rows[0] as { total: number; users: AdminCalibrationUser[] }, page, pageSize: PAGE_SIZE };
}

/** Manifest for one user's calibration ZIP; bytes are fetched by the browser straight from Blob. */
export async function downloadAdminCalibration(userIdValue: unknown): Promise<AdminDownloadManifest> {
  const userId = requireAdminUserId(userIdValue);
  const sql = getDb();
  const [user] = await sql`SELECT email FROM users WHERE id = ${userId};`;
  if (!user) throw new AdminLibraryError(404, 'Không tìm thấy user.');
  const [profile] = await sql`SELECT * FROM calibration_profiles WHERE user_id = ${userId};` as DbCalibrationProfile[];
  if (!profile) throw new AdminLibraryError(404, 'User chưa có profile calibration.');
  const postures = await sql`SELECT * FROM calibration_postures WHERE user_id = ${userId}
    ORDER BY cell_row, cell_col;` as DbCalibrationPosture[];
  if (!postures.length) throw new AdminLibraryError(404, 'Profile chưa có ảnh nào.');

  const folder = `${adminFileStem(user.email as string)}/calibration`;
  const metadata = {
    owner_email: user.email,
    consent_version: profile.consent_version,
    consent_accepted_at: profile.consent_accepted_at,
    updated_at: profile.updated_at,
    completeness: postures.length,
    postures: postures.map((p) => ({
      file: `${p.cell_row}-${p.cell_col}.png`,
      cell_row: p.cell_row, cell_col: p.cell_col,
      width_px: p.width_px, height_px: p.height_px,
      source_width: p.source_width, source_height: p.source_height,
      source_bbox: p.source_bbox, scale_factor: Number(p.scale_factor),
      mirrored: p.mirrored, pose_model: p.pose_model,
      capture_session_id: p.capture_session_id, captured_at: p.captured_at,
    })),
  };
  const text = JSON.stringify(metadata, null, 2);
  return {
    name: `${adminFileStem(user.email as string)}-calibration.zip`,
    files: [
      { name: `${folder}/metadata.json`, text, size: new TextEncoder().encode(text).length },
      ...postures.map((p) => ({
        name: `${folder}/${p.cell_row}-${p.cell_col}.png`, url: p.storage_url, size: Number(p.file_size_bytes),
      })),
    ],
  };
}
