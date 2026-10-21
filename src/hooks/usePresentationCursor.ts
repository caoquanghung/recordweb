'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CursorCaptureController,
  CursorTrajectory,
  CursorTrajectorySample,
} from '@/types/recording';
import {
  PRESENTATION_CURSOR_SAMPLE_RATE_HZ,
  type PresentationCursorVisualState,
} from '@/types/presentation';

interface UsePresentationCursorOptions {
  target: HTMLElement | null;
  title?: string;
  cursorBakedIntoVideo?: boolean;
}

interface PointerSnapshot extends PresentationCursorVisualState {
  sourceWidth: number;
  sourceHeight: number;
  clientX: number;
  clientY: number;
}

const EMPTY_POINTER: PointerSnapshot = {
  x: 0,
  y: 0,
  visible: false,
  pressed: false,
  sourceWidth: 1,
  sourceHeight: 1,
  clientX: 0,
  clientY: 0,
};

export function usePresentationCursor({
  target,
  title = 'RecordWeb presentation',
  cursorBakedIntoVideo = true,
}: UsePresentationCursorOptions) {
  const pointerRef = useRef<PointerSnapshot>(EMPTY_POINTER);
  const titleRef = useRef(title);
  const cursorBakedIntoVideoRef = useRef(cursorBakedIntoVideo);
  const sessionIdRef = useRef<string | null>(null);
  const samplesRef = useRef<CursorTrajectorySample[]>([]);
  const timerRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const activeStartedAtRef = useRef(0);
  const activeRef = useRef(false);
  const [cursor, setCursor] = useState<PresentationCursorVisualState>(EMPTY_POINTER);

  useEffect(() => {
    titleRef.current = title;
    cursorBakedIntoVideoRef.current = cursorBakedIntoVideo;
  }, [cursorBakedIntoVideo, title]);

  useEffect(() => {
    if (!target) return;

    const pointerFromClientPosition = (
      clientX: number,
      clientY: number,
      visible: boolean,
      pressed: boolean,
    ): PointerSnapshot => {
      const bounds = target.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      return {
        x: Math.min(1, Math.max(0, (clientX - bounds.left) / width)),
        y: Math.min(1, Math.max(0, (clientY - bounds.top) / height)),
        visible,
        pressed,
        sourceWidth: Math.round(width),
        sourceHeight: Math.round(height),
        clientX,
        clientY,
      };
    };
    const updatePointer = (event: PointerEvent, visible: boolean) => {
      const next = pointerFromClientPosition(
        event.clientX,
        event.clientY,
        visible,
        pointerRef.current.pressed,
      );
      pointerRef.current = next;
      setCursor(next);
    };
    let boundsFrame: number | null = null;
    const syncPointerToBounds = () => {
      if (boundsFrame !== null) window.cancelAnimationFrame(boundsFrame);
      boundsFrame = window.requestAnimationFrame(() => {
        boundsFrame = null;
        const pointer = pointerRef.current;
        const next = pointerFromClientPosition(
          pointer.clientX,
          pointer.clientY,
          pointer.visible,
          pointer.pressed,
        );
        pointerRef.current = next;
        setCursor(next);
      });
    };
    const onPointerMove = (event: PointerEvent) => updatePointer(event, true);
    const onPointerEnter = (event: PointerEvent) => updatePointer(event, true);
    const onPointerLeave = () => {
      pointerRef.current = { ...pointerRef.current, visible: false, pressed: false };
      setCursor(pointerRef.current);
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current = { ...pointerRef.current, pressed: true };
      updatePointer(event, true);
    };
    const onPointerUp = (event: PointerEvent) => {
      pointerRef.current = { ...pointerRef.current, pressed: false };
      updatePointer(event, true);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerenter', onPointerEnter);
    target.addEventListener('pointerleave', onPointerLeave);
    target.addEventListener('pointerdown', onPointerDown);
    target.addEventListener('pointerup', onPointerUp);
    target.addEventListener('pointercancel', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);
    window.addEventListener('resize', syncPointerToBounds);
    document.addEventListener('fullscreenchange', syncPointerToBounds);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(syncPointerToBounds);
    resizeObserver?.observe(target);
    syncPointerToBounds();
    return () => {
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerenter', onPointerEnter);
      target.removeEventListener('pointerleave', onPointerLeave);
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('resize', syncPointerToBounds);
      document.removeEventListener('fullscreenchange', syncPointerToBounds);
      resizeObserver?.disconnect();
      if (boundsFrame !== null) window.cancelAnimationFrame(boundsFrame);
      pointerRef.current = EMPTY_POINTER;
      setCursor(EMPTY_POINTER);
    };
  }, [target]);

  const controller = useMemo<CursorCaptureController>(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    const currentActiveTime = () => accumulatedMsRef.current + (
      activeRef.current ? performance.now() - activeStartedAtRef.current : 0
    );
    const startTimer = () => {
      clearTimer();
      timerRef.current = window.setInterval(() => {
        if (!activeRef.current) return;
        const pointer = pointerRef.current;
        samplesRef.current.push({
          index: samplesRef.current.length,
          timestampMs: Math.round(currentActiveTime()),
          x: pointer.visible ? pointer.x : null,
          y: pointer.visible ? pointer.y : null,
          visible: pointer.visible,
        });
      }, 1000 / PRESENTATION_CURSOR_SAMPLE_RATE_HZ);
    };

    return {
      start: async (sessionId) => {
        if (!target) {
          return { started: false, warning: 'Presentation cursor omitted: the presentation area is not mounted.' };
        }
        sessionIdRef.current = sessionId;
        samplesRef.current = [];
        accumulatedMsRef.current = 0;
        activeStartedAtRef.current = performance.now();
        activeRef.current = true;
        startTimer();
        return { started: true };
      },
      pause: async () => {
        if (!activeRef.current) return;
        accumulatedMsRef.current = currentActiveTime();
        activeRef.current = false;
        clearTimer();
      },
      resume: async () => {
        if (!sessionIdRef.current || activeRef.current) return;
        activeStartedAtRef.current = performance.now();
        activeRef.current = true;
        startTimer();
      },
      stop: async (durationMs): Promise<CursorTrajectory | null> => {
        const sessionId = sessionIdRef.current;
        if (!sessionId) return null;
        if (activeRef.current) accumulatedMsRef.current = currentActiveTime();
        activeRef.current = false;
        clearTimer();
        sessionIdRef.current = null;
        const pointer = pointerRef.current;
        return {
          schemaVersion: 1,
          sessionId,
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
            cursorBakedIntoScreenVideo: cursorBakedIntoVideoRef.current,
            presentationTitle: titleRef.current,
          },
          samples: [...samplesRef.current],
        };
      },
      reset: async () => {
        clearTimer();
        sessionIdRef.current = null;
        samplesRef.current = [];
        accumulatedMsRef.current = 0;
        activeRef.current = false;
      },
    };
  }, [target]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    sessionIdRef.current = null;
    samplesRef.current = [];
    activeRef.current = false;
  }, []);

  return { cursor, controller };
}

