import { NextRequest, NextResponse } from 'next/server';
import { getSessionUserId, unauthorizedResponse } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function ownsRecording(recordingId: string, userId: string) {
  const sql = getDb();
  const rows = await sql`SELECT id FROM recordings WHERE id = ${recordingId} AND user_id = ${userId};`;
  return rows.length > 0;
}

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  const recordingId = request.nextUrl.searchParams.get('recordingId');
  if (!recordingId || !(await ownsRecording(recordingId, userId))) return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
  const sql = getDb();
  const shares = await sql`
    SELECT rs.recording_id, rs.recipient_user_id, rs.permission, rs.created_at, u.email, u.display_name
    FROM recording_shares rs JOIN users u ON u.id = rs.recipient_user_id
    WHERE rs.recording_id = ${recordingId} ORDER BY rs.created_at DESC;
  `;
  return NextResponse.json({ shares });
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  const { recordingId, recipientUserId, permission = 'viewer' } = await request.json();
  if (!recordingId || !recipientUserId || !['viewer', 'viewer_download'].includes(permission)) return NextResponse.json({ error: 'Invalid share request.' }, { status: 400 });
  if (!(await ownsRecording(recordingId, userId))) return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
  const sql = getDb();
  const rows = await sql`
    INSERT INTO recording_shares (recording_id, recipient_user_id, permission)
    VALUES (${recordingId}, ${recipientUserId}, ${permission})
    ON CONFLICT (recording_id, recipient_user_id) DO UPDATE SET permission = EXCLUDED.permission
    RETURNING *;
  `;
  return NextResponse.json({ share: rows[0] }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorizedResponse();
  const { recordingId, recipientUserId } = await request.json();
  if (!recordingId || !(await ownsRecording(recordingId, userId))) return NextResponse.json({ error: 'Recording not found or access denied.' }, { status: 404 });
  const sql = getDb();
  await sql`DELETE FROM recording_shares WHERE recording_id = ${recordingId} AND recipient_user_id = ${recipientUserId};`;
  return NextResponse.json({ deleted: true });
}
