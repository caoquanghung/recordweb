export type MediaSource = 'screen' | 'camera' | 'microphone';

export type MediaSourceStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'ended'
  | 'unsupported'
  | 'error';

export interface MediaDevicesError {
  source: MediaSource | 'devices';
  code:
    | 'permission-denied'
    | 'device-not-found'
    | 'device-busy'
    | 'constraints-unavailable'
    | 'unsupported'
    | 'unknown';
  message: string;
  cause?: unknown;
}

export interface MediaSourceState {
  screen: MediaSourceStatus;
  camera: MediaSourceStatus;
  microphone: MediaSourceStatus;
}

export interface UseMediaDevicesResult {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  microphoneStream: MediaStream | null;
  systemAudioStream: MediaStream | null;
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  statuses: MediaSourceState;
  error: MediaDevicesError | null;
  hasSystemAudio: boolean;
  refreshDevices: () => Promise<void>;
  acquireScreen: () => Promise<MediaStream | null>;
  acquireCamera: (deviceId?: string) => Promise<MediaStream | null>;
  acquireMicrophone: (deviceId?: string) => Promise<MediaStream | null>;
  stopScreen: () => void;
  stopCamera: () => void;
  stopMicrophone: () => void;
  stopAll: () => void;
  clearError: () => void;
}
