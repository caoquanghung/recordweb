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
  | 'connecting'
  | 'connected'
  | 'error';

export interface TabCaptureExtensionResult {
  available: boolean;
  connected: boolean;
  status: TabCaptureExtensionStatus;
  target: ExtensionTargetTab | null;
  message: string;
  googleSlidesUrl: string;
  cursorController: CursorCaptureController;
  setGoogleSlidesUrl: (url: string) => void;
  openGoogleSlides: () => Promise<ExtensionTargetTab | null>;
  focusApp: () => void;
  focusTarget: () => void;
  disconnect: () => void;
}

interface PendingTargetConnection {
  promise: Promise<ExtensionTargetTab | null>;
  resolve: (target: ExtensionTargetTab | null) => void;
  timeoutId: number;
}

const TARGET_CONNECTION_TIMEOUT_MS = 10_000;

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

export function useTabCaptureExtension(): TabCaptureExtensionResult {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<TabCaptureExtensionStatus>('unavailable');
  const [target, setTarget] = useState<ExtensionTargetTab | null>(null);
  const [message, setMessage] = useState('Install or enable the RecordWeb extension, then reload this page.');
  const [googleSlidesUrl, setGoogleSlidesUrl] = useState('');
  const targetRef = useRef<ExtensionTargetTab | null>(null);
  const sessionTargetRef = useRef<ExtensionTargetTab | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionPausedRef = useRef(false);
  const samplesRef = useRef<CursorTrajectorySample[]>([]);
  const viewportRef = useRef({ width: 1, height: 1 });
  const pendingTargetConnectionRef = useRef<PendingTargetConnection | null>(null);

  const settlePendingTargetConnection = useCallback((target: ExtensionTargetTab | null) => {
    const pendingConnection = pendingTargetConnectionRef.current;
    if (!pendingConnection) return;
    pendingTargetConnectionRef.current = null;
    window.clearTimeout(pendingConnection.timeoutId);
    pendingConnection.resolve(target);
  }, []);

  const openGoogleSlides = useCallback(() => {
    if (!available) {
      setStatus('unavailable');
      setMessage('Install or enable the RecordWeb extension before opening Google Slides.');
      return Promise.resolve(null);
    }
    if (targetRef.current) {
      return Promise.resolve(targetRef.current);
    }
    if (pendingTargetConnectionRef.current) {
      return pendingTargetConnectionRef.current.promise;
    }
    const url = parseGoogleSlidesUrl(googleSlidesUrl);
    if (!url) {
      setStatus('error');
      setMessage('Enter a valid Google Slides URL from docs.google.com/presentation.');
      return Promise.resolve(null);
    }
    setStatus('opening');
    setMessage('Looking for an existing Google Slides tab…');
    let resolveConnection!: (target: ExtensionTargetTab | null) => void;
    const promise = new Promise<ExtensionTargetTab | null>((resolve) => {
      resolveConnection = resolve;
    });
    const timeoutId = window.setTimeout(() => {
      if (pendingTargetConnectionRef.current?.promise !== promise) return;
      pendingTargetConnectionRef.current = null;
      setStatus('error');
      setMessage('Google Slides opened, but its cursor tracker did not connect in time. Click Connect sources to try again.');
      resolveConnection(null);
    }, TARGET_CONNECTION_TIMEOUT_MS);
    pendingTargetConnectionRef.current = {
      promise,
      resolve: resolveConnection,
      timeoutId,
    };
    postToExtension({ type: 'OPEN_GOOGLE_SLIDES', url: url.href });
    return promise;
  }, [available, googleSlidesUrl]);

  const focusTarget = useCallback(() => {
    const targetTabId = targetRef.current?.tabId;
    if (typeof targetTabId !== 'number') return;
    postToExtension({ type: 'FOCUS_TARGET', targetTabId });
  }, []);

  const focusApp = useCallback(() => {
    postToExtension({ type: 'FOCUS_APP' });
  }, []);

  const disconnect = useCallback(() => {
    const targetTabId = targetRef.current?.tabId;
    postToExtension({ type: 'DISCONNECT', targetTabId });
    settlePendingTargetConnection(null);
    targetRef.current = null;
    setTarget(null);
    setStatus(available ? 'ready' : 'unavailable');
    setMessage(available
      ? 'Extension ready. Paste a Google Slides URL to prepare cursor tracking.'
      : 'Install or enable the RecordWeb extension, then reload this page.');
  }, [available, settlePendingTargetConnection]);

  useEffect(() => {
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

      if (extensionMessage.type === 'TARGET_READY') {
        setAvailable(true);
        targetRef.current = extensionMessage.target;
        setTarget(extensionMessage.target);
        setStatus('connected');
        setMessage(`Cursor tracking is ready for “${extensionMessage.target.title}”.`);
        settlePendingTargetConnection(extensionMessage.target);
        const activeSessionId = sessionIdRef.current;
        if (activeSessionId) {
          const lastSample = samplesRef.current.at(-1);
          postToExtension({
            type: 'CURSOR_START',
            sessionId: activeSessionId,
            targetTabId: extensionMessage.target.tabId,
            offsetMs: lastSample?.timestampMs ?? 0,
            startIndex: lastSample ? lastSample.index + 1 : 0,
          });
          if (sessionPausedRef.current) {
            postToExtension({
              type: 'CURSOR_PAUSE',
              sessionId: activeSessionId,
              targetTabId: extensionMessage.target.tabId,
            });
          }
        }
        return;
      }

      if (extensionMessage.type === 'TARGET_OPENED') {
        setAvailable(true);
        setStatus('connecting');
        setMessage(extensionMessage.reused
          ? 'Existing Google Slides tab found. Switching to it and preparing cursor tracking…'
          : 'Google Slides opened. Waiting for its cursor tracker to initialize…');
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
      settlePendingTargetConnection(null);
      if (extensionMessage.type === 'TARGET_ENDED') {
        targetRef.current = null;
        setTarget(null);
      }
    };

    window.addEventListener('message', handleMessage);
    postToExtension({ type: 'PAGE_READY' });
    return () => {
      window.removeEventListener('message', handleMessage);
      settlePendingTargetConnection(null);
    };
  }, [settlePendingTargetConnection]);

  const cursorController = useMemo<CursorCaptureController>(() => ({
    start: async (sessionId) => {
      const currentTarget = targetRef.current;
      if (!currentTarget) {
        return { started: false, warning: 'Cursor path omitted: no extension-selected tab is connected.' };
      }
      sessionIdRef.current = sessionId;
      sessionTargetRef.current = currentTarget;
      sessionPausedRef.current = false;
      samplesRef.current = [];
      postToExtension({ type: 'CURSOR_START', sessionId, targetTabId: currentTarget.tabId });
      return { started: true };
    },
    pause: async () => {
      sessionPausedRef.current = true;
      postToExtension({
        type: 'CURSOR_PAUSE',
        sessionId: sessionIdRef.current ?? undefined,
        targetTabId: targetRef.current?.tabId,
      });
    },
    resume: async () => {
      sessionPausedRef.current = false;
      postToExtension({
        type: 'CURSOR_RESUME',
        sessionId: sessionIdRef.current ?? undefined,
        targetTabId: targetRef.current?.tabId,
      });
    },
    stop: async (durationMs): Promise<CursorTrajectory | null> => {
      const sessionId = sessionIdRef.current;
      const currentTarget = sessionTargetRef.current;
      if (!sessionId || !currentTarget) return null;
      postToExtension({ type: 'CURSOR_STOP', sessionId, targetTabId: currentTarget.tabId });
      sessionIdRef.current = null;
      sessionTargetRef.current = null;
      sessionPausedRef.current = false;
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
      sessionTargetRef.current = null;
      sessionPausedRef.current = false;
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
    focusApp,
    focusTarget,
    disconnect,
  };
}
