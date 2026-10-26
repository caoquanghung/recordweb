import { isRecordedWaveformPeaks } from '@/lib/audioWaveform';
import type { DbRecording, DbRecordingAsset, DbSharedRecording } from '@/types/database';
import type { RecordingAssetKind, RecordingAssetMetadata, RecordingMetadata } from '@/types/recording';

export interface RecordingInspectionAsset {
  kind: RecordingAssetKind;
  mimeType: string;
  fileSizeBytes: number;
  resolution?: string;
  fps?: number;
  sampleRateHz?: number;
}

export interface RecordingInspectionMediaSource {
  blob?: Blob;
  src?: string;
  mimeType: string;
  waveformPeaks?: number[];
}

export interface RecordingInspectionCursorSource {
  blob?: Blob;
  src?: string;
}

export interface RecordingInspectionData {
  durationSeconds: number;
  assets: RecordingInspectionAsset[];
  mixed?: RecordingInspectionMediaSource;
  microphone?: RecordingInspectionMediaSource;
  systemAudio?: RecordingInspectionMediaSource;
  cursor?: RecordingInspectionCursorSource;
}

function localMediaSource(asset?: RecordingAssetMetadata): RecordingInspectionMediaSource | undefined {
  const src = asset?.storageUrl ?? undefined;
  if (!asset || (!asset.blob && !src)) return undefined;
  return {
    blob: asset.blob,
    src,
    mimeType: asset.mimeType,
    waveformPeaks: asset.waveformPeaks,
  };
}

function cloudMediaSource(asset?: DbRecordingAsset): RecordingInspectionMediaSource | undefined {
  if (!asset?.storage_url) return undefined;
  const waveformPeaks = asset.metadata?.waveformPeaks;
  return {
    src: asset.storage_url,
    mimeType: asset.mime_type,
    waveformPeaks: isRecordedWaveformPeaks(waveformPeaks) ? waveformPeaks : undefined,
  };
}

function hasInspectionAssets(data: RecordingInspectionData) {
  return Boolean(data.assets.length || data.mixed || data.microphone || data.systemAudio || data.cursor);
}

export function getLocalRecordingInspection(recording: RecordingMetadata): RecordingInspectionData | undefined {
  const cursorAsset = recording.assets?.cursor;
  const cursorSrc = cursorAsset?.storageUrl ?? undefined;
  const data: RecordingInspectionData = {
    durationSeconds: recording.durationSeconds,
    assets: Object.values(recording.assets ?? {}).map((asset) => ({
      kind: asset.kind,
      mimeType: asset.mimeType,
      fileSizeBytes: asset.fileSizeBytes,
      resolution: asset.resolution,
      fps: asset.fps,
      sampleRateHz: asset.sampleRateHz,
    })),
    mixed: localMediaSource(recording.assets?.audio),
    microphone: localMediaSource(recording.assets?.['microphone-audio']),
    systemAudio: localMediaSource(recording.assets?.['system-audio']),
    cursor: cursorAsset?.blob || cursorSrc ? { blob: cursorAsset?.blob, src: cursorSrc } : undefined,
  };
  return hasInspectionAssets(data) ? data : undefined;
}

export function getCloudRecordingInspection(
  recording: DbRecording | DbSharedRecording,
): RecordingInspectionData | undefined {
  const findAsset = (kind: DbRecordingAsset['kind']) => recording.assets?.find((asset) => asset.kind === kind);
  const cursorAsset = findAsset('cursor');
  const data: RecordingInspectionData = {
    durationSeconds: Number(recording.duration_seconds),
    assets: (recording.assets ?? []).map((asset) => ({
      kind: asset.kind,
      mimeType: asset.mime_type,
      fileSizeBytes: asset.file_size_bytes,
      resolution: asset.resolution ?? undefined,
      fps: asset.fps ?? undefined,
      sampleRateHz: asset.sample_rate_hz ?? undefined,
    })),
    mixed: cloudMediaSource(findAsset('audio')),
    microphone: cloudMediaSource(findAsset('microphone-audio')),
    systemAudio: cloudMediaSource(findAsset('system-audio')),
    cursor: cursorAsset?.storage_url ? { src: cursorAsset.storage_url } : undefined,
  };
  return hasInspectionAssets(data) ? data : undefined;
}
