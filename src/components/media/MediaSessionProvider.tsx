'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useMediaDevices, type UseMediaDevicesResult } from '@/hooks/useMediaDevices';
import {
  useTabCaptureExtension,
  type TabCaptureExtensionResult,
} from '@/hooks/useTabCaptureExtension';

export interface MediaSessionContextValue extends UseMediaDevicesResult {
  tabCapture: TabCaptureExtensionResult;
  micMuted: boolean;
  setMicMuted: Dispatch<SetStateAction<boolean>>;
  cameraVisible: boolean;
  setCameraVisible: Dispatch<SetStateAction<boolean>>;
}

const MediaSessionContext = createContext<MediaSessionContextValue | null>(null);
MediaSessionContext.displayName = 'MediaSessionContext';

interface MediaSessionProviderProps {
  children: ReactNode;
}

export function MediaSessionProvider({ children }: MediaSessionProviderProps) {
  const [micMuted, setMicMuted] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(true);
  const mediaSession = useMediaDevices();
  const {
    stopAll: stopAllOwned,
    microphoneStream,
    cameraStream,
  } = mediaSession;
  const tabCapture = useTabCaptureExtension();
  const disconnectTabCapture = tabCapture.disconnect;
  const stopAll = useCallback(() => {
    disconnectTabCapture();
    stopAllOwned();
  }, [disconnectTabCapture, stopAllOwned]);

  useEffect(() => {
    const tracks = microphoneStream?.getAudioTracks() ?? [];
    if (!micMuted) {
      tracks.forEach((track) => {
        track.enabled = true;
      });
      return;
    }

    // Let the DSP gain reach silence before disabling the shared raw track.
    const disableTracks = window.setTimeout(() => {
      tracks.forEach((track) => {
        if (track.readyState === 'live') track.enabled = false;
      });
    }, 60);
    return () => window.clearTimeout(disableTracks);
  }, [microphoneStream, micMuted]);

  useEffect(() => {
    cameraStream?.getVideoTracks().forEach((track) => {
      track.enabled = cameraVisible;
    });
  }, [cameraStream, cameraVisible]);

  const value = useMemo<MediaSessionContextValue>(() => ({
    ...mediaSession,
    stopAll,
    tabCapture,
    micMuted,
    setMicMuted,
    cameraVisible,
    setCameraVisible,
  }), [mediaSession, stopAll, tabCapture, micMuted, cameraVisible]);

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
