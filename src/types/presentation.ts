import type { CursorCaptureController } from './recording';

export type PresentationFileKind = 'pdf' | 'pptx';

export type PresentationDeckStatus =
  | 'idle'
  | 'validating'
  | 'loading'
  | 'ready'
  | 'error';

export type PresentationCaptureStatus =
  | 'idle'
  | 'requesting'
  | 'capturing'
  | 'ended'
  | 'error';

export type PresentationCaptureScope = 'tab' | 'element';

export interface PresentationFileMetadata {
  name: string;
  kind: PresentationFileKind;
  sizeBytes: number;
  pageCount: number;
}

export interface PresentationTabCapture {
  stream: MediaStream;
  videoStream: MediaStream;
  audioStream: MediaStream | null;
  scope: PresentationCaptureScope;
  width: number | null;
  height: number | null;
}

export interface PresentationCursorVisualState {
  x: number;
  y: number;
  visible: boolean;
  pressed: boolean;
}

export interface PresentationRecordingSource {
  capture: PresentationTabCapture | null;
  cursorController: CursorCaptureController;
  cursor: PresentationCursorVisualState;
}

export const MAX_PRESENTATION_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_PRESENTATION_PAGES = 300;
export const PRESENTATION_CURSOR_SAMPLE_RATE_HZ = 24;

