'use client';

import { useEffect, useState } from 'react';
import { createPresentationCursorCaptureSession } from '@/lib/presentationCursorCapture';
import {
  EMPTY_PRESENTATION_POINTER,
  observePresentationPointer,
} from '@/lib/presentationPointer';
import type { PresentationCursorVisualState } from '@/types/presentation';

interface UsePresentationCursorOptions {
  target: HTMLElement | null;
  title?: string;
  cursorBakedIntoVideo?: boolean;
}

export function usePresentationCursor({
  target,
  title = 'RecordWeb presentation',
  cursorBakedIntoVideo = true,
}: UsePresentationCursorOptions) {
  const [captureSession] = useState(createPresentationCursorCaptureSession);
  const [cursor, setCursor] = useState<PresentationCursorVisualState>(EMPTY_PRESENTATION_POINTER);

  useEffect(() => {
    captureSession.updateMetadata(title, cursorBakedIntoVideo);
  }, [captureSession, cursorBakedIntoVideo, title]);

  useEffect(() => {
    captureSession.setTargetAvailable(Boolean(target));
    if (!target) return () => captureSession.setTargetAvailable(false);
    const stopObserving = observePresentationPointer(target, (next) => {
      captureSession.updatePointer(next);
      setCursor(next);
    });
    return () => {
      stopObserving();
      captureSession.setTargetAvailable(false);
      captureSession.updatePointer(EMPTY_PRESENTATION_POINTER);
      setCursor(EMPTY_PRESENTATION_POINTER);
    };
  }, [captureSession, target]);

  useEffect(() => () => captureSession.dispose(), [captureSession]);

  return { cursor, controller: captureSession.controller };
}

