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
    adoptScreenStream,
    stopScreen: stopOwnedScreen,
    stopAll: stopAllOwned,
  } = mediaSession;
  const handleCapture = useCallback((stream: MediaStream) => {
    adoptScreenStream(stream);
  }, [adoptScreenStream]);
  const handleCaptureEnded = useCallback(() => {
    stopOwnedScreen();
  }, [stopOwnedScreen]);
  const tabCapture = useTabCaptureExtension({
    onCapture: handleCapture,
    onCaptureEnded: handleCaptureEnded,
  });
  const disconnectTabCapture = tabCapture.disconnect;
  const stopScreen = useCallback(() => {
    disconnectTabCapture();
    stopOwnedScreen();
  }, [disconnectTabCapture, stopOwnedScreen]);
  const stopAll = useCallback(() => {
    disconnectTabCapture();
    stopAllOwned();
  }, [disconnectTabCapture, stopAllOwned]);
  const value = useMemo<MediaSessionContextValue>(() => ({
    ...mediaSession,
    stopScreen,
    stopAll,
    tabCapture,
  }), [mediaSession, stopAll, stopScreen, tabCapture]);

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
