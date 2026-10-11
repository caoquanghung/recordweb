import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getDb, isDbConfigured } from '@/lib/db';

async function ownsRecording(recordingId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`SELECT id FROM recordings WHERE id = ${recordingId} AND user_id = ${userId};`;
  return rows.length > 0;
}

function databaseUnavailable() {
  return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) return databaseUnavailable();

  try {
    const recordingId = request.nextUrl.searchParams.get('recordingId');
    if (!recordingId || !(await ownsRecording(recordingId, userId))) {
      return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
    }
    const sql = getDb();
    const shares = await sql`
      SELECT rs.recording_id, rs.recipient_user_id, rs.permission, rs.created_at,
             u.email, u.display_name
      FROM recording_shares rs
      JOIN users u ON u.id = rs.recipient_user_id
      WHERE rs.recording_id = ${recordingId}
      ORDER BY rs.created_at DESC;
    `;
    return NextResponse.json({ shares });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) return databaseUnavailable();

  try {
    const { recordingId, recipientUserId, recipientEmail, permission = 'viewer' } = await request.json();
    if (!recordingId || (!recipientUserId && !recipientEmail) || !['viewer', 'viewer_download'].includes(permission)) {
      return NextResponse.json({ error: 'A recording, recipient, and valid permission are required.' }, { status: 400 });
    }
    if (!(await ownsRecording(recordingId, userId))) {
      return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
    }

    const sql = getDb();
    const recipients = recipientUserId
      ? await sql`SELECT id, email, display_name FROM users WHERE id = ${recipientUserId} LIMIT 1;`
      : await sql`SELECT id, email, display_name FROM users WHERE LOWER(email) = LOWER(${String(recipientEmail).trim()}) LIMIT 1;`;

    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No registered RecordWeb user has that email.' }, { status: 404 });
    }
    const recipient = recipients[0];
    if (recipient.id === userId) {
      return NextResponse.json({ error: 'The owner already has full access.' }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO recording_shares (recording_id, recipient_user_id, permission)
      VALUES (${recordingId}, ${recipient.id}, ${permission})
      ON CONFLICT (recording_id, recipient_user_id)
      DO UPDATE SET permission = EXCLUDED.permission
      RETURNING *;
    `;
    return NextResponse.json({
      share: { ...rows[0], email: recipient.email, display_name: recipient.display_name },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  if (!isDbConfigured) return databaseUnavailable();

  try {
    const { recordingId, recipientUserId } = await request.json();
    if (!recordingId || !recipientUserId || !(await ownsRecording(recordingId, userId))) {
      return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
    }
    const sql = getDb();
    await sql`
      DELETE FROM recording_shares
      WHERE recording_id = ${recordingId} AND recipient_user_id = ${recipientUserId};
    `;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
