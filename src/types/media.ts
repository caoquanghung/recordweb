export type RecordingMode = 'screen-pip' | 'screen-only' | 'webcam-only';

export type PipShape = 'circle' | 'rounded' | 'cutout';
export type PipSize = 'small' | 'medium' | 'large';
export type PipPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'custom';

export type BackgroundRemovalMode = 'original' | 'blur' | 'cutout' | 'virtual';

export interface PipConfig {
  shape: PipShape;
  size: PipSize;
  position: PipPosition;
  customCoords?: { x: number; y: number };
  width: number;
  height: number;
}

export interface AudioFilterConfig {
  highPassEnabled: boolean;     // 80Hz rumble cut
  vocalBoostEnabled: boolean;   // 2.8kHz peaking filter
  lowPassEnabled: boolean;      // 12kHz hiss cut
  compressorEnabled: boolean;   // Dynamics compressor
  noiseGateEnabled: boolean;    // Silence threshold gating
  micGain: number;              // 0.0 to 2.0 (100% default)
}

export interface MediaDeviceSelection {
  audioDeviceId?: string;
  videoDeviceId?: string;
  hasSystemAudio: boolean;
}
