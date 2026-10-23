import { createRecordingClock } from '@/lib/recordingClock';
import {
  EMPTY_PRESENTATION_POINTER,
  type PresentationPointerSnapshot,
} from '@/lib/presentationPointer';
import type {
  CursorCaptureController,
  CursorTrajectory,
  CursorTrajectorySample,
} from '@/types/recording';
import { PRESENTATION_CURSOR_SAMPLE_RATE_HZ } from '@/types/presentation';

export interface PresentationCursorCaptureSession {
  controller: CursorCaptureController;
  dispose: () => void;
  setTargetAvailable: (available: boolean) => void;
  updateMetadata: (title: string, cursorBakedIntoVideo: boolean) => void;
  updatePointer: (pointer: PresentationPointerSnapshot) => void;
}

export function createPresentationCursorCaptureSession(): PresentationCursorCaptureSession {
  const clock = createRecordingClock();
  let sessionId: string | null = null;
  let samples: CursorTrajectorySample[] = [];
  let timer: number | null = null;
  let pointer = EMPTY_PRESENTATION_POINTER;
  let title = 'RecordWeb presentation';
  let cursorBakedIntoVideo = true;
  let targetAvailable = false;

  const clearTimer = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  };
  const startTimer = () => {
    clearTimer();
    timer = window.setInterval(() => {
      if (!clock.isActive()) return;
      samples.push({
        index: samples.length,
        timestampMs: Math.round(clock.elapsed()),
        x: pointer.visible ? pointer.x : null,
        y: pointer.visible ? pointer.y : null,
        visible: pointer.visible,
      });
    }, 1000 / PRESENTATION_CURSOR_SAMPLE_RATE_HZ);
  };
  const resetSession = () => {
    clearTimer();
    sessionId = null;
    samples = [];
    clock.reset();
  };

  const controller: CursorCaptureController = {
    start: async (nextSessionId) => {
      if (!targetAvailable) {
        return { started: false, warning: 'Presentation cursor omitted: the presentation area is not mounted.' };
      }
      resetSession();
      sessionId = nextSessionId;
      clock.start();
      startTimer();
      return { started: true };
    },
    pause: async () => {
      if (!clock.isActive()) return;
      clock.pause();
      clearTimer();
    },
    resume: async () => {
      if (!sessionId || clock.isActive()) return;
      clock.start();
      startTimer();
    },
    stop: async (durationMs): Promise<CursorTrajectory | null> => {
      if (!sessionId) return null;
      clock.pause();
      clearTimer();
      const completedSessionId = sessionId;
      sessionId = null;
      return {
        schemaVersion: 1,
        sessionId: completedSessionId,
        sampleRateHz: PRESENTATION_CURSOR_SAMPLE_RATE_HZ,
        coordinateSpace: {
          origin: 'top-left',
          xRange: [0, 1],
          yRange: [0, 1],
          relativeTo: 'captured-presentation-content',
          sourceWidth: pointer.sourceWidth,
          sourceHeight: pointer.sourceHeight,
        },
        timeline: {
          clock: 'active-recording-time',
          pausedIntervalsExcluded: true,
          durationMs,
        },
        tracking: {
          mode: 'recordweb-presentation',
          cursorBakedIntoScreenVideo: cursorBakedIntoVideo,
          presentationTitle: title,
        },
        samples: [...samples],
      };
    },
    reset: async () => resetSession(),
  };

  return {
    controller,
    dispose: resetSession,
    setTargetAvailable: (available) => {
      targetAvailable = available;
    },
    updateMetadata: (nextTitle, nextCursorBakedIntoVideo) => {
      title = nextTitle;
      cursorBakedIntoVideo = nextCursorBakedIntoVideo;
    },
    updatePointer: (nextPointer) => {
      pointer = nextPointer;
    },
  };
}
