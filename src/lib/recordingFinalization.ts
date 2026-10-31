import { decodeRecordedWaveform } from '@/lib/audioWaveform';
import { createCursorAsset } from '@/lib/cursorTrajectory';
import {
  AUDIO_ASSET_KINDS,
  MEDIA_ASSET_ORDER,
  createRecordingAsset,
  type RecordingAssetSpec,
} from '@/lib/recordingAssets';
import type {
  CursorTrajectory,
  RecordingAssetKind,
  RecordingAssetMetadata,
} from '@/types/recording';

interface FinalizeRecordingAssetsOptions {
  chunksByKind: Partial<Record<RecordingAssetKind, Blob[]>>;
  specsByKind: Partial<Record<RecordingAssetKind, RecordingAssetSpec>>;
  durationMs: number;
  getCursorTrajectory: () => Promise<CursorTrajectory | null>;
  errors: string[];
}

export async function finalizeRecordingAssets({
  chunksByKind,
  specsByKind,
  durationMs,
  getCursorTrajectory,
  errors,
}: FinalizeRecordingAssetsOptions): Promise<Partial<Record<RecordingAssetKind, RecordingAssetMetadata>>> {
  const assets: Partial<Record<RecordingAssetKind, RecordingAssetMetadata>> = {};

  for (const kind of MEDIA_ASSET_ORDER) {
    const chunks = chunksByKind[kind];
    const spec = specsByKind[kind];
    if (!chunks?.length || !spec) continue;
    assets[kind] = await createRecordingAsset(kind, chunks, spec, durationMs);
  }

  const cursor = await getCursorTrajectory().catch((cause) => {
    errors.push(`cursor: ${(cause as Error).message}`);
    return null;
  });
  if (cursor) assets.cursor = createCursorAsset(cursor);

  for (const kind of AUDIO_ASSET_KINDS) {
    const audioAsset = assets[kind];
    if (!audioAsset?.blob) continue;
    try {
      const waveform = await decodeRecordedWaveform(audioAsset.blob);
      audioAsset.waveformPeaks = waveform.peaks;
    } catch (cause) {
      errors.push(`${kind} waveform: ${(cause as Error).message}`);
    }
  }

  if (!assets.composite?.blob) {
    throw new Error('The composite encoder did not produce a usable file.');
  }
  return assets;
}
