export type RecordingProjectStatus = 'draft' | 'completed';

export type RecordingContainer = 'mp4' | 'webm';

export interface RecordingVideoProfile {
  codec: string;
  codecParameterString: string;
  decoderConfigDescription: string | null;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  flipped: boolean;
  frameRate: number;
}

export interface RecordingAudioProfile {
  codec: string;
  codecParameterString: string;
  decoderConfigDescription: string | null;
  sampleRate: number;
  numberOfChannels: number;
}

/**
 * The immutable media contract shared by every composite segment in a project.
 * The decoder-config fingerprints make packet-copy merging stricter than a
 * MIME-type-only comparison.
 */
export interface RecordingMediaProfile {
  schemaVersion: 1;
  container: RecordingContainer;
  mimeType: 'video/mp4' | 'video/webm';
  video: RecordingVideoProfile;
  audio: RecordingAudioProfile | null;
}

export interface RecordingProjectSegment {
  id: string;
  projectId: string;
  recordingId: string;
  sequenceNumber: number;
  mediaProfile: RecordingMediaProfile;
  durationSeconds: number;
  fileSizeBytes: number;
  mimeType: string;
  storageUrl: string | null;
  blobPathname: string | null;
  title: string;
  createdAt: string;
}

export interface RecordingProject {
  id: string;
  title: string;
  status: RecordingProjectStatus;
  mediaProfile: RecordingMediaProfile | null;
  settings: Record<string, unknown>;
  revision: number;
  totalDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
  segments: RecordingProjectSegment[];
}

export interface RecordingPlaylistItem<TSegment extends { id: string; durationSeconds: number }> {
  segment: TSegment;
  index: number;
  startSeconds: number;
  endSeconds: number;
}

export interface RecordingPlaylist<TSegment extends { id: string; durationSeconds: number }> {
  items: RecordingPlaylistItem<TSegment>[];
  totalDurationSeconds: number;
}

