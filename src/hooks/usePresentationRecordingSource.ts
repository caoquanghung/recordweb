'use client';

import { usePresentationCursor } from './usePresentationCursor';
import { usePresentationTabCapture } from './usePresentationTabCapture';

interface UsePresentationRecordingSourceOptions {
  presentationElement: HTMLElement | null;
  presentationTitle?: string;
}

export function usePresentationRecordingSource({
  presentationElement,
  presentationTitle,
}: UsePresentationRecordingSourceOptions) {
  const tabCapture = usePresentationTabCapture();
  const presentationCursor = usePresentationCursor({
    target: presentationElement,
    title: presentationTitle,
    cursorBakedIntoVideo: true,
  });

  return {
    ...tabCapture,
    cursor: presentationCursor.cursor,
    cursorController: presentationCursor.controller,
    videoStream: tabCapture.capture?.videoStream ?? null,
    presentationAudioStream: tabCapture.capture?.audioStream ?? null,
  };
}

