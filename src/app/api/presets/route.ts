import { NextRequest, NextResponse } from 'next/server';
import { getDb, isDbConfigured } from '@/lib/db';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { DbStudioPreset } from '@/types/database';

/** GET /api/presets — Returns only the authenticated user's studio presets. */
export async function GET(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId(request);
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json({ presets: [] }, { status: 200 });
  }

  try {
    const sql = getDb();
    // §2.9 — User-scoped query
    const rows = await sql`
      SELECT * FROM studio_presets
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC;
    `;
    return NextResponse.json({ presets: rows as DbStudioPreset[] });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** POST /api/presets — Creates a preset owned by the authenticated user. */
export async function POST(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId(request);
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json(
      { message: 'Database not configured. Preset stored locally.' },
      { status: 200 }
    );
  }

  try {
    const body = await request.json();
    const {
      preset_name,
      pip_shape = 'circle',
      pip_size = 'medium',
      pip_position = 'bottom-right',
      bg_removal_mode = 'blur',
      filters_config = {},
    } = body;

    const sql = getDb();
    // §2.8 / §2.9 — Insert with user_id FK
    const result = await sql`
      INSERT INTO studio_presets (
        user_id,
        preset_name,
        pip_shape,
        pip_size,
        pip_position,
        bg_removal_mode,
        filters_config,
        updated_at
      ) VALUES (
        ${userId},
        ${preset_name},
        ${pip_shape},
        ${pip_size},
        ${pip_position},
        ${bg_removal_mode},
        ${JSON.stringify(filters_config)},
        NOW()
      )
      RETURNING *;
    `;

    return NextResponse.json({ preset: result[0] as DbStudioPreset }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

/** DELETE /api/presets — Deletes a preset owned by the authenticated user. */
export async function DELETE(request: NextRequest) {
  // §2.9 — Auth gate
  const userId = await getSessionUserId(request);
  if (!userId) return unauthorizedResponse();

  if (!isDbConfigured) {
    return NextResponse.json({ message: 'Database not configured.' }, { status: 503 });
  }

  try {
    const { id } = await request.json();
    const sql = getDb();
    // §2.9 — Scoped delete: user can only delete their own presets
    const result = await sql`
      DELETE FROM studio_presets
      WHERE id = ${id} AND user_id = ${userId}
      RETURNING id;
    `;

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Preset not found or access denied.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ deleted: result[0].id });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
