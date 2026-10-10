import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function displayName(firstName: string | null, lastName: string | null) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);
    const sql = getDb();

    if (event.type === 'user.created' || event.type === 'user.updated') {
      const user = event.data;
      const primaryEmail = user.email_addresses.find(
        (email) => email.id === user.primary_email_address_id
      )?.email_address ?? user.email_addresses[0]?.email_address;

      if (!primaryEmail) {
        return NextResponse.json(
          { error: 'Clerk user does not have an email address.' },
          { status: 400 }
        );
      }

      await sql`
        INSERT INTO users (id, email, display_name)
        VALUES (
          ${user.id},
          ${primaryEmail},
          ${displayName(user.first_name, user.last_name)}
        )
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name;
      `;
    }

    if (event.type === 'user.deleted' && event.data.id) {
      await sql`DELETE FROM users WHERE id = ${event.data.id};`;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Clerk webhook verification failed:', error);
    return NextResponse.json(
      { error: 'Webhook verification failed.' },
      { status: 400 }
    );
  }
}
