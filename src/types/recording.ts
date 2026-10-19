import { AudioFilterConfig, BackgroundRemovalMode, PipConfig, RecordingMode } from './media';

export type RecordingStatus =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'processing'
  | 'ready';

export type RecordingAudioAssetKind = 'audio' | 'microphone-audio' | 'system-audio';

export type RecordingAssetKind =
  | 'composite'
  | 'webcam'
  | 'screen'
  | RecordingAudioAssetKind
  | 'cursor';

export interface CursorTrajectorySample {
  index: number;
  timestampMs: number;
  x: number | null;
  y: number | null;
  visible: boolean;
}

export interface CursorTrajectory {
  schemaVersion: 1;
  sessionId: string;
  sampleRateHz: 24;
  coordinateSpace: {
    origin: 'top-left';
    xRange: [0, 1];
    yRange: [0, 1];
    relativeTo: 'captured-screen-content' | 'captured-presentation-content';
    sourceWidth: number;
    sourceHeight: number;
  };
  timeline: {
    clock: 'active-recording-time';
    pausedIntervalsExcluded: true;
    durationMs: number;
  };
  tracking:
    | {
        mode: 'native-helper';
        cursorBakedIntoScreenVideo: boolean;
        displayId: string;
        displayLabel: string;
      }
    | {
        mode: 'browser-extension-tab';
        cursorBakedIntoScreenVideo: boolean;
        targetTabId: number;
        targetTitle: string;
      }
    | {
        mode: 'recordweb-presentation';
        cursorBakedIntoScreenVideo: boolean;
        presentationTitle: string;
      };
  samples: CursorTrajectorySample[];
}

export interface CursorCaptureController {
  start: (sessionId: string) => Promise<{ started: boolean; warning?: string }>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (durationMs: number) => Promise<CursorTrajectory | null>;
  reset: () => Promise<void>;
}

export interface RecordingAssetMetadata {
  kind: RecordingAssetKind;
  fileSizeBytes: number;
  mimeType: string;
  resolution?: string;
  fps?: number;
  sampleRateHz?: number;
  waveformPeaks?: number[];
  blob?: Blob;
  storageUrl?: string | null;
  blobPathname?: string | null;
}

export interface RecordingSettingsSnapshot {
  recordingMode: RecordingMode;
  pipConfig: PipConfig;
  bgRemovalMode: BackgroundRemovalMode;
  audioFilters: AudioFilterConfig;
}

export interface RecordingMetadata {
  id: string;
  title: string;
  durationSeconds: number;
  fileSizeBytes: number;
  resolution: string;
  fps: number;
  mimeType: string;
  createdAt: string;
  localId?: string;
  storageUrl?: string | null;
  blobPathname?: string | null;
  isPublic?: boolean;          // share link toggle (maps to is_public in DB)
  settings?: RecordingSettingsSnapshot;
  blob?: Blob;
  previewUrl?: string;
  assets?: Partial<Record<RecordingAssetKind, RecordingAssetMetadata>>;
}
