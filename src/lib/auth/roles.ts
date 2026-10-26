export const APP_ROLES = ['user', 'developer'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
  'recording:use',
  'recording-assets:inspect',
  'diagnostics:internal',
  'telemetry:read',
  'experiments:use',
  'users:manage',
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AppRole, ReadonlySet<AppPermission>> = {
  user: new Set<AppPermission>(['recording:use']),
  developer: new Set<AppPermission>(APP_PERMISSIONS),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function parseAppRole(value: unknown): AppRole {
  return value === 'developer' ? 'developer' : 'user';
}

/**
 * Reads the app role only from Clerk-signed session claims.
 *
 * The preferred Clerk session template is:
 * `{ "metadata": "{{user.public_metadata}}" }`.
 * The additional keys keep existing signed templates compatible while all
 * missing or invalid values continue to fail closed to `user`.
 */
export function getRoleFromSessionClaims(sessionClaims: unknown): AppRole {
  const claims = asRecord(sessionClaims);
  if (!claims) return 'user';

  const metadata = asRecord(claims.metadata);
  const publicMetadata = asRecord(claims.publicMetadata);
  const snakeCasePublicMetadata = asRecord(claims.public_metadata);

  return parseAppRole(
    metadata?.appRole
      ?? publicMetadata?.appRole
      ?? snakeCasePublicMetadata?.appRole
      ?? claims.appRole
  );
}

export function getPermissions(role: AppRole): readonly AppPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasPermission(role: AppRole, permission: AppPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

