import type { RecordingMediaProfile, RecordingProjectStatus } from './recordingProject';
import type { AppRole } from '@/lib/auth/roles';
import type { UploadManifestAsset } from '@/lib/recordingUploadProtocol';

/** Durable administrative cleanup record; deliberately independent of user FKs. */
export interface DbAdminDeletionJob {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  target_email: string;
  scope: 'recording' | 'recordings' | 'account';
  recording_id: string | null;
  recording_ids: string[];
  blob_pathnames: string[];
  blob_cursor: number;
  status: 'pending' | 'running' | 'failed' | 'completed';
  lease_token: string | null;
  lease_expires_at: string | null;
  cleanup_until: string;
  last_cleanup_at: string | null;
  cleanup_cursor: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DbRecordingUploadAttempt {
  id: string;
  user_id: string;
  local_id: string;
  recording_id: string;
  status: 'uploading' | 'cancelled' | 'completed';
  manifest: UploadManifestAsset[];
  lease_expires_at: string;
  token_expires_at: string;
}

/** Mirrors the `users` table — populated by the auth provider callback. */
export interface DbUser {
  id: string;           // Clerk / Auth.js user ID (VARCHAR 128)
  email: string;
  display_name: string | null;
  role: AppRole;
  created_at: string;
}

/** Mirrors the `recordings` table. */
export interface DbRecording {
  id: string;
  user_id: string;      // FK → users.id
  title: string;
  duration_seconds: number;
  file_size_bytes: number;
  resolution: string;
  fps: number;
  mime_type: string;
  local_id: string | null;
  storage_url: string | null;    // Vercel Blob CDN URL
  blob_pathname: string | null;  // Vercel Blob pathname (used for del())
  is_public: boolean;            // Share link toggle
  settings: Record<string, unknown>;
  recorded_at: string;         // Actual recording session start time
  created_at: string;
  assets?: DbRecordingAsset[];
}

export interface DbRecordingAsset {
  id: string;
  recording_id: string;
  kind: 'composite' | 'webcam' | 'screen' | 'audio' | 'microphone-audio' | 'system-audio' | 'cursor';
  storage_url: string;
  blob_pathname: string;
  mime_type: string;
  file_size_bytes: number;
  resolution: string | null;
  fps: number | null;
  sample_rate_hz: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DbSharedRecording extends DbRecording {
  owner_email: string;
  owner_display_name: string | null;
  share_permission: 'viewer' | 'viewer_download';
}

export interface DbRecordingShare {
  recording_id: string;
  recipient_user_id: string;
  permission: 'viewer' | 'viewer_download';
  created_at: string;
  email: string;
  display_name: string | null;
}

export interface DbRecordingProject {
  id: string;
  user_id: string;
  title: string;
  status: RecordingProjectStatus;
  media_profile: RecordingMediaProfile | null;
  settings: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface DbRecordingProjectSegment {
  id: string;
  project_id: string;
  recording_id: string;
  sequence_number: number;
  media_profile: RecordingMediaProfile;
  created_at: string;
  title: string;
  duration_seconds: number;
  file_size_bytes: number;
  mime_type: string;
  storage_url: string | null;
  blob_pathname: string | null;
}

/** Mirrors the `studio_presets` table. */
export interface DbStudioPreset {
  id: string;
  user_id: string;      // FK → users.id
  preset_name: string;
  pip_shape: string;
  pip_size: string;
  pip_position: string;
  bg_removal_mode: string;
  filters_config: Record<string, unknown>;
  updated_at: string;
}
