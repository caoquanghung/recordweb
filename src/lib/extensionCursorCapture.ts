import type { CursorCaptureController, CursorTrajectory, CursorTrajectorySample } from '@/types/recording';
import type {
  ExtensionTargetTab,
  ExtensionToPageMessage,
  PageToExtensionPayload,
} from '@/types/tabCaptureExtension';

type CursorExtensionMessage = Extract<ExtensionToPageMessage, {
  type: 'CURSOR_SAMPLE' | 'CURSOR_STARTED' | 'CURSOR_STOPPED';
}>;

interface PendingCursorStart {
  requestId: string;
  sessionId: string;
  resolve: (started: boolean) => void;
  timeoutId: number;
}

interface PendingCursorStop {
  requestId: string;
  sessionId: string;
  lastSampleIndex: number | null;
  resolve: (complete: boolean) => void;
  timeoutId: number;
}

interface ExtensionCursorCaptureOptions {
  send: (message: PageToExtensionPayload) => void;
  commandTimeoutMs: number;
}

export interface ExtensionCursorCapture {
  controller: CursorCaptureController;
  handleMessage: (message: CursorExtensionMessage) => void;
  abortPendingCommands: () => void;
  hasActiveSession: () => boolean;
  setTarget: (target: ExtensionTargetTab | null) => void;
}

export function createExtensionCursorCapture({
  send,
  commandTimeoutMs,
}: ExtensionCursorCaptureOptions): ExtensionCursorCapture {
  let connectedTarget: ExtensionTargetTab | null = null;
  let sessionId: string | null = null;
  let sessionTarget: ExtensionTargetTab | null = null;
  let samples: CursorTrajectorySample[] = [];
  let viewport = { width: 1, height: 1 };
  let pendingStart: PendingCursorStart | null = null;
  let pendingStop: PendingCursorStop | null = null;

  const settleStart = (started: boolean) => {
    if (!pendingStart) return;
    window.clearTimeout(pendingStart.timeoutId);
    const resolve = pendingStart.resolve;
    pendingStart = null;
    resolve(started);
  };

  const settleStopIfDrained = () => {
    if (!pendingStop || pendingStop.lastSampleIndex === null) return;
    const receivedLastIndex = samples.at(-1)?.index ?? -1;
    if (receivedLastIndex < pendingStop.lastSampleIndex) return;
    window.clearTimeout(pendingStop.timeoutId);
    const resolve = pendingStop.resolve;
    pendingStop = null;
    resolve(true);
  };

  const abortPendingCommands = () => {
    settleStart(false);
    if (!pendingStop) return;
    window.clearTimeout(pendingStop.timeoutId);
    const resolve = pendingStop.resolve;
    pendingStop = null;
    resolve(false);
  };

  const clearSession = () => {
    sessionId = null;
    sessionTarget = null;
  };

  const handleMessage = (message: CursorExtensionMessage) => {
    if (message.type === 'CURSOR_SAMPLE') {
      if (message.sessionId !== sessionId) return;
      samples.push(message.sample);
      viewport = message.viewport;
      settleStopIfDrained();
      return;
    }

    if (message.type === 'CURSOR_STARTED') {
      if (pendingStart?.requestId !== message.requestId || pendingStart.sessionId !== message.sessionId) return;
      settleStart(true);
      return;
    }

    if (pendingStop?.requestId !== message.requestId || pendingStop.sessionId !== message.sessionId) return;
    pendingStop.lastSampleIndex = message.lastSampleIndex;
    settleStopIfDrained();
  };

  const controller: CursorCaptureController = {
    requiredForRecording: true,
    start: async (nextSessionId) => {
      const target = connectedTarget;
      if (!target) {
        return { started: false, warning: 'Cursor path omitted: no extension-selected tab is connected.' };
      }

      sessionId = nextSessionId;
      sessionTarget = target;
      samples = [];
      const requestId = crypto.randomUUID();
      const started = await new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (pendingStart?.requestId !== requestId) return;
          pendingStart = null;
          send({ type: 'CURSOR_RESET', sessionId: nextSessionId, targetTabId: target.tabId });
          resolve(false);
        }, commandTimeoutMs);
        pendingStart = { requestId, sessionId: nextSessionId, resolve, timeoutId };
        send({ type: 'CURSOR_START', requestId, sessionId: nextSessionId, targetTabId: target.tabId });
      });

      if (!started || connectedTarget?.tabId !== target.tabId) {
        clearSession();
        return {
          started: false,
          warning: 'Cursor tracker did not acknowledge recording start. Reload the Google Slides tab and reconnect it.',
        };
      }
      return { started: true };
    },
    pause: async () => {
      send({ type: 'CURSOR_PAUSE', sessionId: sessionId ?? undefined, targetTabId: connectedTarget?.tabId });
    },
    resume: async () => {
      send({ type: 'CURSOR_RESUME', sessionId: sessionId ?? undefined, targetTabId: connectedTarget?.tabId });
    },
    stop: async (durationMs): Promise<CursorTrajectory | null> => {
      if (!sessionId || !sessionTarget) return null;
      const stoppedSessionId = sessionId;
      const stoppedTarget = sessionTarget;
      if (connectedTarget?.tabId !== stoppedTarget.tabId) {
        clearSession();
        throw new Error('Cursor tracker disconnected before it could confirm the final sample.');
      }

      const requestId = crypto.randomUUID();
      const complete = await new Promise<boolean>((resolve) => {
        const timeoutId = window.setTimeout(() => {
          if (pendingStop?.requestId !== requestId) return;
          pendingStop = null;
          resolve(false);
        }, commandTimeoutMs);
        pendingStop = {
          requestId,
          sessionId: stoppedSessionId,
          lastSampleIndex: null,
          resolve,
          timeoutId,
        };
        send({
          type: 'CURSOR_STOP',
          requestId,
          sessionId: stoppedSessionId,
          targetTabId: stoppedTarget.tabId,
        });
      });
      clearSession();
      if (!complete) {
        throw new Error('Cursor tracker did not confirm its final sample; cursor.json was not created.');
      }

      return {
        schemaVersion: 1,
        sessionId: stoppedSessionId,
        sampleRateHz: 24,
        coordinateSpace: {
          origin: 'top-left',
          xRange: [0, 1],
          yRange: [0, 1],
          relativeTo: 'captured-screen-content',
          sourceWidth: viewport.width,
          sourceHeight: viewport.height,
        },
        timeline: { clock: 'active-recording-time', pausedIntervalsExcluded: true, durationMs },
        tracking: {
          mode: 'browser-extension-tab',
          cursorBakedIntoScreenVideo: false,
          targetTabId: stoppedTarget.tabId,
          targetTitle: stoppedTarget.title,
        },
        samples: [...samples],
      };
    },
    reset: async () => {
      abortPendingCommands();
      send({ type: 'CURSOR_RESET', sessionId: sessionId ?? undefined, targetTabId: connectedTarget?.tabId });
      clearSession();
      samples = [];
    },
  };

  return {
    controller,
    handleMessage,
    abortPendingCommands,
    hasActiveSession: () => Boolean(sessionId),
    setTarget: (target) => {
      connectedTarget = target;
    },
  };
}
