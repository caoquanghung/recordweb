'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CursorCaptureController, CursorTrajectory, CursorTrajectorySample } from '@/types/recording';
import {
  RECORDWEB_EXTENSION_CHANNEL,
  RECORDWEB_PRESENTATION_COMMAND_EVENT,
  type ExtensionTargetTab,
  type ExtensionToPageMessage,
  type PageToExtensionMessage,
} from '@/types/tabCaptureExtension';

export type TabCaptureExtensionStatus =
  | 'unavailable'
  | 'ready'
  | 'opening'
  | 'awaiting-authorization'
  | 'connecting'
  | 'connected'
  | 'error';

interface UseTabCaptureExtensionOptions {
  onCapture: (stream: MediaStream) => void;
  onCaptureEnded: () => void;
}

export interface TabCaptureExtensionResult {
  available: boolean;
  connected: boolean;
  status: TabCaptureExtensionStatus;
  target: ExtensionTargetTab | null;
  message: string;
  googleSlidesUrl: string;
  cursorController: CursorCaptureController;
  setGoogleSlidesUrl: (url: string) => void;
  openGoogleSlides: () => void;
  focusTarget: () => void;
  disconnect: () => void;
}

interface ChromiumTabConstraints extends MediaTrackConstraints {
  mandatory: {
    chromeMediaSource: 'tab';
    chromeMediaSourceId: string;
  };
}

function postToExtension(message: Omit<PageToExtensionMessage, 'channel' | 'direction'>) {
  window.postMessage({
    ...message,
    channel: RECORDWEB_EXTENSION_CHANNEL,
    direction: 'page-to-extension',
  } satisfies PageToExtensionMessage, window.location.origin);
}

function isExtensionMessage(value: unknown): value is ExtensionToPageMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExtensionToPageMessage>;
  return candidate.channel === RECORDWEB_EXTENSION_CHANNEL && candidate.direction === 'extension-to-page';
}

function parseGoogleSlidesUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    const slidePath = /^\/presentation\/(?:u\/\d+\/)?d\/[^/]+(?:\/|$)/;
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !slidePath.test(url.pathname)) {
      return null;
    }
    const editableDeckPath = url.pathname.match(
      /^(\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+)(?:\/(?:edit|view|preview|present))?\/?$/,
    );
    if (editableDeckPath) url.pathname = `${editableDeckPath[1]}/present`;
    return url;
  } catch {
    return null;
  }
}

async function consumeTabStream(streamId: string): Promise<MediaStream> {
  const mandatory: ChromiumTabConstraints['mandatory'] = {
    chromeMediaSource: 'tab',
    chromeMediaSourceId: streamId,
  };
  return navigator.mediaDevices.getUserMedia({
    video: { mandatory } as ChromiumTabConstraints,
    audio: { mandatory } as ChromiumTabConstraints,
  });
}

export function useTabCaptureExtension({
  onCapture,
  onCaptureEnded,
}: UseTabCaptureExtensionOptions): TabCaptureExtensionResult {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<TabCaptureExtensionStatus>('unavailable');
  const [target, setTarget] = useState<ExtensionTargetTab | null>(null);
  const [message, setMessage] = useState('Install or enable the RecordWeb extension, then click it on the tab to record.');
  const [googleSlidesUrl, setGoogleSlidesUrl] = useState('');
  const mountedRef = useRef(true);
  const targetRef = useRef<ExtensionTargetTab | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const samplesRef = useRef<CursorTrajectorySample[]>([]);
  const viewportRef = useRef({ width: 1, height: 1 });

  const openGoogleSlides = useCallback(() => {
    if (!available) {
      setStatus('unavailable');
      setMessage('Install or enable the RecordWeb extension before opening Google Slides.');
      return;
    }
    if (targetRef.current) {
      setMessage('Disconnect the current captured tab before opening another Google Slides presentation.');
      return;
    }
    const url = parseGoogleSlidesUrl(googleSlidesUrl);
    if (!url) {
      setStatus('error');
      setMessage('Enter a valid Google Slides URL from docs.google.com/presentation.');
      return;
    }
    setStatus('opening');
    setMessage('Opening Google Slides…');
    postToExtension({ type: 'OPEN_GOOGLE_SLIDES', url: url.href });
  }, [available, googleSlidesUrl]);

  const focusTarget = useCallback(() => {
    const targetTabId = targetRef.current?.tabId;
    if (typeof targetTabId !== 'number') return;
    postToExtension({ type: 'FOCUS_TARGET', targetTabId });
  }, []);

  const disconnect = useCallback(() => {
    const targetTabId = targetRef.current?.tabId;
    postToExtension({ type: 'DISCONNECT', targetTabId });
    targetRef.current = null;
    sessionIdRef.current = null;
    samplesRef.current = [];
    setTarget(null);
    setStatus(available ? 'ready' : 'unavailable');
    setMessage(available
      ? 'Extension ready. Open the target tab and click the RecordWeb extension.'
      : 'Install or enable the RecordWeb extension, then click it on the tab to record.');
  }, [available]);

  useEffect(() => {
    mountedRef.current = true;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin || !isExtensionMessage(event.data)) return;
      const extensionMessage = event.data;

      if (extensionMessage.type === 'BRIDGE_READY') {
        setAvailable(true);
        setStatus((current) => current === 'unavailable' ? 'ready' : current);
        setMessage((current) => current.startsWith('Install or enable')
          ? 'Extension ready. Paste a Google Slides URL to open the presentation tab.'
          : current);
        return;
      }

      if (extensionMessage.type === 'CAPTURE_OFFER') {
        setAvailable(true);
        setStatus('connecting');
        setMessage(`Connecting “${extensionMessage.target.title}”…`);
        void consumeTabStream(extensionMessage.streamId).then((stream) => {
          if (!mountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          targetRef.current = extensionMessage.target;
          setTarget(extensionMessage.target);
          stream.getTracks().forEach((track) => {
            track.addEventListener('ended', () => {
              if (targetRef.current?.tabId !== extensionMessage.target.tabId) return;
              targetRef.current = null;
              setTarget(null);
              setStatus('ready');
              setMessage('Tab capture ended. Click the extension on a target tab to reconnect.');
              onCaptureEnded();
            }, { once: true });
          });
          onCapture(stream);
          setStatus('connected');
          setMessage(`Capturing “${extensionMessage.target.title}” with tab audio and 24 Hz cursor tracking.`);
        }).catch((cause: unknown) => {
          setStatus('error');
          setMessage(`Could not consume the extension tab stream: ${cause instanceof Error ? cause.message : 'unknown error'}`);
        });
        return;
      }

      if (extensionMessage.type === 'TARGET_OPENED') {
        setAvailable(true);
        setStatus('awaiting-authorization');
        setMessage('Google Slides opened. In that tab, press Alt+Shift+R or click the RecordWeb extension once to authorize capture.');
        return;
      }

      if (extensionMessage.type === 'CURSOR_SAMPLE') {
        if (extensionMessage.sessionId !== sessionIdRef.current) return;
        samplesRef.current.push(extensionMessage.sample);
        viewportRef.current = extensionMessage.viewport;
        return;
      }


      if (extensionMessage.type === 'PRESENTATION_COMMAND') {
        window.dispatchEvent(new CustomEvent(RECORDWEB_PRESENTATION_COMMAND_EVENT, {
          detail: extensionMessage.command,
        }));
        return;
      }

      setStatus('error');
      setMessage(extensionMessage.message);
      if (extensionMessage.type === 'TARGET_ENDED') {
        targetRef.current = null;
        sessionIdRef.current = null;
        setTarget(null);
        onCaptureEnded();
      }
    };

    window.addEventListener('message', handleMessage);
    postToExtension({ type: 'PAGE_READY' });
    return () => {
      mountedRef.current = false;
      window.removeEventListener('message', handleMessage);
    };
  }, [onCapture, onCaptureEnded]);

  const cursorController = useMemo<CursorCaptureController>(() => ({
    start: async (sessionId) => {
      const currentTarget = targetRef.current;
      if (!currentTarget) {
        return { started: false, warning: 'Cursor path omitted: no extension-selected tab is connected.' };
      }
      sessionIdRef.current = sessionId;
      samplesRef.current = [];
      postToExtension({ type: 'CURSOR_START', sessionId, targetTabId: currentTarget.tabId });
      return { started: true };
    },
    pause: async () => {
      postToExtension({
        type: 'CURSOR_PAUSE',
        sessionId: sessionIdRef.current ?? undefined,
        targetTabId: targetRef.current?.tabId,
      });
    },
    resume: async () => {
      postToExtension({
        type: 'CURSOR_RESUME',
        sessionId: sessionIdRef.current ?? undefined,
        targetTabId: targetRef.current?.tabId,
      });
    },
    stop: async (durationMs): Promise<CursorTrajectory | null> => {
      const sessionId = sessionIdRef.current;
      const currentTarget = targetRef.current;
      if (!sessionId || !currentTarget) return null;
      postToExtension({ type: 'CURSOR_STOP', sessionId, targetTabId: currentTarget.tabId });
      sessionIdRef.current = null;
      return {
        schemaVersion: 1,
        sessionId,
        sampleRateHz: 24,
        coordinateSpace: {
          origin: 'top-left',
          xRange: [0, 1],
          yRange: [0, 1],
          relativeTo: 'captured-screen-content',
          sourceWidth: viewportRef.current.width,
          sourceHeight: viewportRef.current.height,
        },
        timeline: { clock: 'active-recording-time', pausedIntervalsExcluded: true, durationMs },
        tracking: {
          mode: 'browser-extension-tab',
          cursorBakedIntoScreenVideo: false,
          targetTabId: currentTarget.tabId,
          targetTitle: currentTarget.title,
        },
        samples: [...samplesRef.current],
      };
    },
    reset: async () => {
      postToExtension({
        type: 'CURSOR_RESET',
        sessionId: sessionIdRef.current ?? undefined,
        targetTabId: targetRef.current?.tabId,
      });
      sessionIdRef.current = null;
      samplesRef.current = [];
    },
  }), []);

  return {
    available,
    connected: status === 'connected',
    status,
    target,
    message,
    googleSlidesUrl,
    cursorController,
    setGoogleSlidesUrl,
    openGoogleSlides,
    focusTarget,
    disconnect,
  };
}
