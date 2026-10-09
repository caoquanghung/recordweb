/**
 * auth.ts — Session helper for Next.js Route Handlers.
 *
 * SWAP THIS when an auth provider is installed:
 *  - Clerk:    import { auth } from '@clerk/nextjs/server';
 *              const { userId } = auth();
 *  - NextAuth: import { getServerSession } from 'next-auth';
 *              const session = await getServerSession(authOptions);
 *              const userId = session?.user?.id ?? null;
 */
import { NextRequest, NextResponse } from 'next/server';

/**
 * Returns the authenticated userId from the request session.
 * Returns `null` if the user is not authenticated.
 *
 * @todo Replace this stub with a real provider call (Clerk / NextAuth).
 */
export async function getSessionUserId(
  _request: NextRequest | Request
): Promise<string | null> {
  // --- STUB: Replace with real auth provider call ---
  // Example (Clerk):
  //   const { userId } = auth();
  //   return userId;
  //
  // Example (NextAuth):
  //   const session = await getServerSession(authOptions);
  //   return session?.user?.id ?? null;

  // During development, read X-Dev-User-Id header so local curl/Postman testing
  // still works before the provider is wired up.
  if (process.env.NODE_ENV === 'development') {
    const devId = (_request as Request).headers.get('x-dev-user-id');
    if (devId) return devId;
  }

  // Production: no real auth yet → reject all cloud operations
  return null;
}

/**
 * Returns a 401 NextResponse. Use at the top of every route handler.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}
