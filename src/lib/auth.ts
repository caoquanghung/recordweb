import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Returns the authenticated userId from the request session.
 * Returns `null` if the user is not authenticated.
 *
 */
export async function getSessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Returns a 401 NextResponse. Use at the top of every route handler.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
