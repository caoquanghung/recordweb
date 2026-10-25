import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import {
  getPermissions,
  getRoleFromSessionClaims,
  hasPermission,
  type AppPermission,
  type AppRole,
} from '@/lib/auth/roles';

export interface AuthContext {
  userId: string;
  role: AppRole;
  permissions: readonly AppPermission[];
}

export type PermissionResult =
  | { authorized: true; context: AuthContext }
  | { authorized: false; response: NextResponse };

/**
 * Returns the authenticated userId from the request session.
 * Returns `null` if the user is not authenticated.
 *
 */
export async function getSessionUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/** Returns the authenticated user and permissions derived from signed claims. */
export async function getAuthContext(): Promise<AuthContext | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const role = getRoleFromSessionClaims(sessionClaims);
  return {
    userId,
    role,
    permissions: getPermissions(role),
  };
}

/**
 * Returns a 401 NextResponse. Use at the top of every route handler.
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/** Returns a 403 response without exposing internal authorization details. */
export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Enforces one application permission in Route Handlers.
 * Resource ownership/share checks remain the caller's responsibility.
 */
export async function requirePermission(
  permission: AppPermission
): Promise<PermissionResult> {
  const context = await getAuthContext();

  if (!context) {
    return { authorized: false, response: unauthorizedResponse() };
  }

  if (!hasPermission(context.role, permission)) {
    return { authorized: false, response: forbiddenResponse() };
  }

  return { authorized: true, context };
}
