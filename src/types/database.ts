export interface DbRecording {
  id: string;
  title: string;
  duration_seconds: number;
  file_size_bytes: number;
  resolution: string;
  fps: number;
  mime_type: string;
  local_id: string | null;
  storage_url: string | null;
  blob_pathname: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface DbStudioPreset {
  id: string;
  preset_name: string;
  pip_shape: string;
  pip_size: string;
  pip_position: string;
  bg_removal_mode: string;
  filters_config: Record<string, unknown>;
  updated_at: string;
}
