import { AudioFilterConfig, BackgroundRemovalMode, PipConfig, RecordingMode } from './media';

export type RecordingStatus =
  | 'idle'
  | 'countdown'
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'processing'
  | 'ready';

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
}
