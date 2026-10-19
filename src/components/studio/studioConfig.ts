import type { AudioDspPreset } from '@/hooks/useAudioDSP';
import type { BackgroundRemovalMode, RecordingMode } from '@/types/media';
import type { RecordingAssetKind, RecordingAssetMetadata, RecordingMetadata } from '@/types/recording';

export type SessionState = 'setup' | 'countdown' | 'recording' | 'paused' | 'processing' | 'review';
export type CheckState = 'idle' | 'checking' | 'ready' | 'error';
export type Theme = 'light' | 'dark';
export type UploadState = 'idle' | 'uploading' | 'saving' | 'ready' | 'error';
export type EffectsTab = 'camera' | 'audio' | 'preset';

export interface HealthResponse {
  auth: 'authenticated';
  database: 'connected' | 'not-configured' | 'error';
  blob: 'configured' | 'not-configured';
  checkedAt: string;
}

export interface BrowserCapabilities {
  screenCapture: boolean;
  cameraAndMic: boolean;
  mediaRecorder: boolean;
  indexedDb: boolean;
  fileSystemSave: boolean;
}

export const MEDIA_ASSET_KINDS: Exclude<RecordingAssetKind, 'cursor'>[] = [
  'composite',
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
];

export const modes: Array<{ value: RecordingMode; label: string; detail: string }> = [
  { value: 'screen-pip', label: 'Studio', detail: 'Screen + camera' },
  { value: 'screen-only', label: 'Screen', detail: 'Display only' },
  { value: 'webcam-only', label: 'Camera', detail: 'Webcam only' },
];

export const backgrounds: Array<{ value: BackgroundRemovalMode; label: string }> = [
  { value: 'original', label: 'Original' },
  { value: 'blur', label: 'Blur' },
  { value: 'cutout', label: 'Cutout' },
];

export const audioModes = ['Natural', 'Voice clarity', 'Noise reduction', 'Podcast', 'Custom'];

export const audioPresetByLabel: Record<string, AudioDspPreset> = {
  Natural: 'natural',
  'Voice clarity': 'voice-clarity',
  'Noise reduction': 'noise-reduction',
  Podcast: 'podcast',
  Custom: 'custom',
};

type BlobContentType = 'video/mp4' | 'video/webm' | 'audio/mp4' | 'audio/webm' | 'application/json';

export function getBlobContentType(mimeType: string): BlobContentType {
  const baseType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (
    baseType === 'video/mp4'
    || baseType === 'video/webm'
    || baseType === 'audio/mp4'
    || baseType === 'audio/webm'
    || baseType === 'application/json'
  ) {
    return baseType;
  }
  throw new Error(`Unsupported recording content type: ${mimeType || 'unknown'}`);
}

export function extensionForMimeType(mimeType: string) {
  if (mimeType.split(';', 1)[0].trim().toLowerCase() === 'application/json') return 'json';
  const baseType = getBlobContentType(mimeType);
  if (baseType === 'audio/mp4') return 'm4a';
  if (baseType.endsWith('/mp4')) return 'mp4';
  return 'webm';
}

export function compositeAssetFor(recording: RecordingMetadata): RecordingAssetMetadata | null {
  if (recording.assets?.composite) return recording.assets.composite;
  if (!recording.blob) return null;
  return {
    kind: 'composite',
    blob: recording.blob,
    fileSizeBytes: recording.fileSizeBytes,
    mimeType: recording.mimeType,
    resolution: recording.resolution,
    fps: recording.fps,
  };
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}
