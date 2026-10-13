import type { CursorTrajectory } from './recording';

export interface CursorHelperDisplay {
  id: string;
  label: string;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
  primary: boolean;
}

interface CursorHelperStartOptions {
  sessionId: string;
  displayId: string;
  sourceWidth: number;
  sourceHeight: number;
  cursorBakedIntoScreenVideo: boolean;
}

export interface RecordWebCursorBridge {
  getDisplays: () => Promise<CursorHelperDisplay[]>;
  selectDisplay: (displayId: string) => Promise<boolean>;
  start: (options: CursorHelperStartOptions) => Promise<{ started: true }>;
  pause: (sessionId: string) => Promise<void>;
  resume: (sessionId: string) => Promise<void>;
  stop: (sessionId: string, durationMs: number) => Promise<CursorTrajectory>;
  reset: (sessionId: string | null) => Promise<void>;
}

declare global {
  interface Window {
    recordWebCursor?: RecordWebCursorBridge;
  }
}

export {};
