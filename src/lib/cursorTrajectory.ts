import type { CursorTrajectory, RecordingAssetMetadata } from '@/types/recording';

export function recoverCursorTrajectory(
  cursor: CursorTrajectory | null | undefined,
  sessionId: string,
  durationMs: number,
): CursorTrajectory | null {
  if (!cursor || cursor.sessionId !== sessionId) return null;
  return {
    ...cursor,
    timeline: { ...cursor.timeline, durationMs },
    samples: cursor.samples.filter((sample) => sample.timestampMs <= durationMs),
    recovery: { incomplete: true },
  };
}

export function createCursorAsset(cursor: CursorTrajectory): RecordingAssetMetadata {
  const blob = new Blob([JSON.stringify(cursor, null, 2)], { type: 'application/json' });
  return {
    kind: 'cursor',
    fileSizeBytes: blob.size,
    mimeType: blob.type,
    sampleRateHz: cursor.sampleRateHz,
    blob,
  };
}
