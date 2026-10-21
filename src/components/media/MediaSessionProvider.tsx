'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useMediaDevices, type UseMediaDevicesResult } from '@/hooks/useMediaDevices';
import {
  useTabCaptureExtension,
  type TabCaptureExtensionResult,
} from '@/hooks/useTabCaptureExtension';

export interface MediaSessionContextValue extends UseMediaDevicesResult {
  tabCapture: TabCaptureExtensionResult;
}

const MediaSessionContext = createContext<MediaSessionContextValue | null>(null);
MediaSessionContext.displayName = 'MediaSessionContext';

interface MediaSessionProviderProps {
  children: ReactNode;
}

export function MediaSessionProvider({ children }: MediaSessionProviderProps) {
  const mediaSession = useMediaDevices();
  const {
    stopAll: stopAllOwned,
  } = mediaSession;
  const tabCapture = useTabCaptureExtension();
  const disconnectTabCapture = tabCapture.disconnect;
  const stopAll = useCallback(() => {
    disconnectTabCapture();
    stopAllOwned();
  }, [disconnectTabCapture, stopAllOwned]);
  const value = useMemo<MediaSessionContextValue>(() => ({
    ...mediaSession,
    stopAll,
    tabCapture,
  }), [mediaSession, stopAll, tabCapture]);

  return (
    <MediaSessionContext.Provider value={value}>
      {children}
    </MediaSessionContext.Provider>
  );
}

export function useMediaSession(): MediaSessionContextValue {
  const mediaSession = useContext(MediaSessionContext);

  if (!mediaSession) {
    throw new Error('useMediaSession must be used inside MediaSessionProvider.');
  }

  return mediaSession;
}
