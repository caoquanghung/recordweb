import type { DbAdminDeletionJob, DbRecording, DbUser } from './database';

export interface AdminRecording extends DbRecording {
  owner_email: string;
  owner_display_name: string | null;
  owner_role: DbUser['role'];
}

export interface AdminLibraryUser extends DbUser {
  recording_count: number;
}

export interface AdminDownloadFile {
  name: string;
  url?: string;
  text?: string;
  size: number;
}

export interface AdminDownloadManifest {
  name: string;
  files: AdminDownloadFile[];
  nextCursor?: string | null;
  snapshotAt?: string;
}

export type AdminDeletionScope = DbAdminDeletionJob['scope'];

export interface AdminDeletionJob {
  id: string;
  target_user_id: string;
  target_email: string;
  scope: AdminDeletionScope;
  recording_id: string | null;
  status: DbAdminDeletionJob['status'];
  blob_cursor: number;
  blob_count: number;
  recording_count: number;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}
