'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useMediaDevices, type UseMediaDevicesResult } from '@/hooks/useMediaDevices';

const MediaSessionContext = createContext<UseMediaDevicesResult | null>(null);

export function MediaSessionProvider({ children }: { children: ReactNode }) {
  const mediaSession = useMediaDevices();

  return (
    <MediaSessionContext.Provider value={mediaSession}>
      {children}
    </MediaSessionContext.Provider>
  );
}

export function useMediaSession(): UseMediaDevicesResult {
  const mediaSession = useContext(MediaSessionContext);

  if (!mediaSession) {
    throw new Error('useMediaSession must be used inside MediaSessionProvider.');
  }

  return mediaSession;
}
