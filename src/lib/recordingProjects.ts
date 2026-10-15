import type {
  RecordingMediaProfile,
  RecordingPlaylist,
  RecordingPlaylistItem,
  RecordingProjectStatus,
} from '@/types/recordingProject';

const VALID_PROJECT_STATUSES = new Set<RecordingProjectStatus>(['draft', 'completed']);
const FRAME_RATE_TOLERANCE = 0.01;

export class RecordingProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordingProjectValidationError';
  }
}

export function isRecordingProjectStatus(value: unknown): value is RecordingProjectStatus {
  return typeof value === 'string' && VALID_PROJECT_STATUSES.has(value as RecordingProjectStatus);
}

export function isRecordingMediaProfile(value: unknown): value is RecordingMediaProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<RecordingMediaProfile>;
  if (
    profile.schemaVersion !== 1
    || (profile.container !== 'mp4' && profile.container !== 'webm')
    || (profile.mimeType !== 'video/mp4' && profile.mimeType !== 'video/webm')
    || !profile.video
    || typeof profile.video !== 'object'
  ) return false;

  const video = profile.video;
  if (
    typeof video.codec !== 'string'
    || typeof video.codecParameterString !== 'string'
    || !(typeof video.decoderConfigDescription === 'string' || video.decoderConfigDescription === null)
    || !Number.isInteger(video.width)
    || video.width <= 0
    || !Number.isInteger(video.height)
    || video.height <= 0
    || ![0, 90, 180, 270].includes(video.rotation)
    || typeof video.flipped !== 'boolean'
    || !Number.isFinite(video.frameRate)
    || video.frameRate <= 0
  ) return false;

  if (profile.audio === null) return true;
  if (!profile.audio || typeof profile.audio !== 'object') return false;
  const audio = profile.audio;
  return (
    typeof audio.codec === 'string'
    && typeof audio.codecParameterString === 'string'
    && (typeof audio.decoderConfigDescription === 'string' || audio.decoderConfigDescription === null)
    && Number.isInteger(audio.sampleRate)
    && audio.sampleRate > 0
    && Number.isInteger(audio.numberOfChannels)
    && audio.numberOfChannels > 0
  );
}

export function compareRecordingMediaProfiles(
  expected: RecordingMediaProfile,
  actual: RecordingMediaProfile,
): string[] {
  const mismatches: string[] = [];
  const compare = (label: string, left: unknown, right: unknown) => {
    if (left !== right) mismatches.push(`${label}: expected ${String(left)}, received ${String(right)}`);
  };

  compare('container', expected.container, actual.container);
  compare('mimeType', expected.mimeType, actual.mimeType);
  compare('video.codec', expected.video.codec, actual.video.codec);
  compare('video.codecParameterString', expected.video.codecParameterString, actual.video.codecParameterString);
  compare(
    'video.decoderConfigDescription',
    expected.video.decoderConfigDescription,
    actual.video.decoderConfigDescription,
  );
  compare('video.width', expected.video.width, actual.video.width);
  compare('video.height', expected.video.height, actual.video.height);
  compare('video.rotation', expected.video.rotation, actual.video.rotation);
  compare('video.flipped', expected.video.flipped, actual.video.flipped);
  if (Math.abs(expected.video.frameRate - actual.video.frameRate) > FRAME_RATE_TOLERANCE) {
    mismatches.push(
      `video.frameRate: expected ${expected.video.frameRate}, received ${actual.video.frameRate}`,
    );
  }

  if ((expected.audio === null) !== (actual.audio === null)) {
    mismatches.push('audio: one segment has an audio track and the other does not');
  } else if (expected.audio && actual.audio) {
    compare('audio.codec', expected.audio.codec, actual.audio.codec);
    compare('audio.codecParameterString', expected.audio.codecParameterString, actual.audio.codecParameterString);
    compare(
      'audio.decoderConfigDescription',
      expected.audio.decoderConfigDescription,
      actual.audio.decoderConfigDescription,
    );
    compare('audio.sampleRate', expected.audio.sampleRate, actual.audio.sampleRate);
    compare('audio.numberOfChannels', expected.audio.numberOfChannels, actual.audio.numberOfChannels);
  }

  return mismatches;
}

export function assertCompatibleRecordingMediaProfiles(
  expected: RecordingMediaProfile,
  actual: RecordingMediaProfile,
): void {
  const mismatches = compareRecordingMediaProfiles(expected, actual);
  if (mismatches.length > 0) {
    throw new RecordingProjectValidationError(
      `Segment media profile is incompatible with the project: ${mismatches.join('; ')}`,
    );
  }
}

export function buildRecordingPlaylist<
  TSegment extends { id: string; durationSeconds: number; sequenceNumber?: number },
>(segments: readonly TSegment[]): RecordingPlaylist<TSegment> {
  const sorted = [...segments].sort((left, right) => (
    (left.sequenceNumber ?? 0) - (right.sequenceNumber ?? 0)
  ));
  let cursor = 0;
  const items = sorted.map((segment, index): RecordingPlaylistItem<TSegment> => {
    if (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds <= 0) {
      throw new RecordingProjectValidationError(
        `Segment ${segment.id} must have a positive finite duration.`,
      );
    }
    const item = {
      segment,
      index,
      startSeconds: cursor,
      endSeconds: cursor + segment.durationSeconds,
    };
    cursor = item.endSeconds;
    return item;
  });
  return { items, totalDurationSeconds: cursor };
}

export function findPlaylistItemAtTime<TSegment extends { id: string; durationSeconds: number }>(
  playlist: RecordingPlaylist<TSegment>,
  timeSeconds: number,
): { item: RecordingPlaylistItem<TSegment>; segmentTimeSeconds: number } | null {
  if (playlist.items.length === 0 || !Number.isFinite(timeSeconds)) return null;
  const clampedTime = Math.min(Math.max(timeSeconds, 0), playlist.totalDurationSeconds);
  const item = playlist.items.find((candidate, index) => (
    clampedTime < candidate.endSeconds || index === playlist.items.length - 1
  ));
  if (!item) return null;
  return {
    item,
    segmentTimeSeconds: Math.min(
      Math.max(clampedTime - item.startSeconds, 0),
      item.segment.durationSeconds,
    ),
  };
}

export function validateSegmentOrder(existingIds: readonly string[], requestedIds: readonly string[]): void {
  if (existingIds.length !== requestedIds.length) {
    throw new RecordingProjectValidationError('Segment order must contain every project segment exactly once.');
  }
  const expected = new Set(existingIds);
  const requested = new Set(requestedIds);
  if (requested.size !== requestedIds.length || expected.size !== requested.size) {
    throw new RecordingProjectValidationError('Segment order contains duplicate or missing segment IDs.');
  }
  for (const id of expected) {
    if (!requested.has(id)) {
      throw new RecordingProjectValidationError('Segment order contains a segment from another project.');
    }
  }
}

