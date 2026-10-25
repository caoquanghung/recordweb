'use client';

import { useAuth } from '@clerk/nextjs';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  getPermissions,
  getRoleFromSessionClaims,
  hasPermission as roleHasPermission,
  type AppPermission,
  type AppRole,
} from '@/lib/auth/roles';

interface PermissionContextValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  role: AppRole;
  permissions: readonly AppPermission[];
  hasPermission: (permission: AppPermission) => boolean;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, sessionClaims } = useAuth();
  const role = isLoaded && isSignedIn
    ? getRoleFromSessionClaims(sessionClaims)
    : 'user';

  const value = useMemo<PermissionContextValue>(() => ({
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    role,
    permissions: getPermissions(role),
    hasPermission: (permission) => Boolean(
      isLoaded && isSignedIn && roleHasPermission(role, permission)
    ),
  }), [isLoaded, isSignedIn, role]);

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions(): PermissionContextValue {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionProvider.');
  }
  return context;
}

export function usePermission(permission: AppPermission): boolean {
  return usePermissions().hasPermission(permission);
}

export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: AppPermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return usePermission(permission) ? children : fallback;
}

