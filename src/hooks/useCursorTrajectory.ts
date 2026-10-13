'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CursorHelperDisplay } from '@/types/electron';
import type { CursorCaptureController, CursorTrajectory } from '@/types/recording';

export function useCursorTrajectory(screenStream: MediaStream | null) {
  const [available, setAvailable] = useState(false);
  const [displays, setDisplays] = useState<CursorHelperDisplay[]>([]);
  const [selectedDisplayId, setSelectedDisplayIdState] = useState('');
  const [message, setMessage] = useState('Open RecordWeb with the Electron helper to capture cursor coordinates.');
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const bridge = window.recordWebCursor;
    if (!bridge) return;
    let cancelled = false;
    void bridge.getDisplays().then((nextDisplays) => {
      if (cancelled) return;
      setAvailable(true);
      setDisplays(nextDisplays);
      const preferred = nextDisplays.find((display) => display.primary) ?? nextDisplays[0];
      if (preferred) {
        setSelectedDisplayIdState(preferred.id);
        void bridge.selectDisplay(preferred.id);
        setMessage('Native helper connected · cursor output 24 Hz.');
      } else setMessage('Native helper connected, but no display is available.');
    }).catch((cause) => setMessage(`Cursor helper unavailable: ${(cause as Error).message}`));
    return () => { cancelled = true; };
  }, []);

  const setSelectedDisplayId = useCallback((displayId: string) => {
    setSelectedDisplayIdState(displayId);
    void window.recordWebCursor?.selectDisplay(displayId).then((selected) => {
      setMessage(selected ? 'Native helper connected · cursor output 24 Hz.' : 'The selected display is no longer available.');
    });
  }, []);

  const controller = useMemo<CursorCaptureController>(() => ({
    start: async (sessionId) => {
      const bridge = window.recordWebCursor;
      if (!bridge) return { started: false, warning: 'Cursor path omitted: Electron helper is not connected.' };
      const track = screenStream?.getVideoTracks()[0];
      if (!track) return { started: false, warning: 'Cursor path omitted: no screen source is connected.' };
      const settings = track.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        return { started: false, warning: `Cursor path omitted: ${settings.displaySurface} capture cannot be mapped to a desktop display.` };
      }
      if (!selectedDisplayId) return { started: false, warning: 'Cursor path omitted: select a display first.' };
      await bridge.selectDisplay(selectedDisplayId);
      await bridge.start({
        sessionId,
        displayId: selectedDisplayId,
        sourceWidth: settings.width ?? 1,
        sourceHeight: settings.height ?? 1,
        cursorBakedIntoScreenVideo: true,
      });
      sessionIdRef.current = sessionId;
      return { started: true };
    },
    pause: async () => {
      if (sessionIdRef.current) await window.recordWebCursor?.pause(sessionIdRef.current);
    },
    resume: async () => {
      if (sessionIdRef.current) await window.recordWebCursor?.resume(sessionIdRef.current);
    },
    stop: async (durationMs): Promise<CursorTrajectory | null> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return null;
      try {
        return await window.recordWebCursor?.stop(sessionId, durationMs) ?? null;
      } finally {
        sessionIdRef.current = null;
      }
    },
    reset: async () => {
      await window.recordWebCursor?.reset(sessionIdRef.current);
      sessionIdRef.current = null;
    },
  }), [screenStream, selectedDisplayId]);

  return { available, displays, selectedDisplayId, setSelectedDisplayId, message, controller };
}
