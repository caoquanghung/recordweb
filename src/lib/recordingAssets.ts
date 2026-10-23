import { repairWebmDuration } from '@/lib/ebmlPatcher';
import type { RecordingDraft } from '@/lib/idb';
import type {
  RecordingAudioAssetKind,
  RecordingAssetKind,
  RecordingAssetMetadata,
} from '@/types/recording';

export interface RecordingAssetSpec {
  mimeType: string;
  resolution?: string;
  fps?: number;
  sampleRateHz?: number;
}

export interface RecorderSources {
  videoStream: MediaStream | null;
  webcamStream: MediaStream | null;
  screenStream: MediaStream | null;
  audioStream: MediaStream | null;
  microphoneAudioStream: MediaStream | null;
  systemAudioStream: MediaStream | null;
  resolution: string;
  fps: number;
}

export interface RecorderInput {
  kind: RecordingAssetKind;
  stream: MediaStream;
  candidates: string[];
  spec: Omit<RecordingAssetSpec, 'mimeType'>;
}

export const MEDIA_ASSET_ORDER: Exclude<RecordingAssetKind, 'cursor'>[] = [
  'composite',
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
];

export const AUDIO_ASSET_KINDS: RecordingAudioAssetKind[] = [
  'audio',
  'microphone-audio',
  'system-audio',
];

const COMPOSITE_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const VIDEO_MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const AUDIO_MIME_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
];

function chooseMimeType(candidates: string[]): string {
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function defaultMimeType(kind: RecordingAssetKind): string {
  if (kind === 'cursor') return 'application/json';
  return AUDIO_ASSET_KINDS.includes(kind as RecordingAudioAssetKind) ? 'audio/webm' : 'video/webm';
}

export function resolveRecorderMimeType(
  kind: RecordingAssetKind,
  recorder: MediaRecorder,
  requestedMimeType: string,
): string {
  return recorder.mimeType || requestedMimeType || defaultMimeType(kind);
}

function singleTrackStream(track: MediaStreamTrack): MediaStream {
  return new MediaStream([track]);
}

function audioSpec(track: MediaStreamTrack): Omit<RecordingAssetSpec, 'mimeType'> {
  return { sampleRateHz: track.getSettings().sampleRate ?? 48_000 };
}

export function createMediaRecorder(stream: MediaStream, candidates: string[]) {
  const mimeType = chooseMimeType(candidates);
  try {
    return {
      recorder: new MediaRecorder(stream, mimeType ? { mimeType } : undefined),
      requestedMimeType: mimeType,
    };
  } catch {
    return { recorder: new MediaRecorder(stream), requestedMimeType: '' };
  }
}

export function getActiveRecorders(
  recorders: Partial<Record<RecordingAssetKind, MediaRecorder>>,
): MediaRecorder[] {
  return Object.values(recorders).filter((recorder): recorder is MediaRecorder => Boolean(recorder));
}

export function createRecorderInputs(sources: RecorderSources): {
  inputs: RecorderInput[];
  missingSources: string[];
} {
  const inputs: RecorderInput[] = [];
  const videoTrack = sources.videoStream?.getVideoTracks()[0];
  if (!videoTrack) return { inputs, missingSources: [] };

  const audioTrack = sources.audioStream?.getAudioTracks()[0];
  inputs.push({
    kind: 'composite',
    stream: new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]),
    candidates: COMPOSITE_MIME_CANDIDATES,
    spec: { resolution: sources.resolution, fps: sources.fps },
  });

  const webcamTrack = sources.webcamStream?.getVideoTracks()[0];
  if (webcamTrack) {
    inputs.push({
      kind: 'webcam',
      stream: singleTrackStream(webcamTrack),
      candidates: VIDEO_MIME_CANDIDATES,
      spec: { resolution: '1280x720', fps: sources.fps },
    });
  }

  const screenTrack = sources.screenStream?.getVideoTracks()[0];
  if (screenTrack) {
    inputs.push({
      kind: 'screen',
      stream: singleTrackStream(screenTrack),
      candidates: VIDEO_MIME_CANDIDATES,
      spec: { resolution: '1920x1080', fps: sources.fps },
    });
  }

  if (audioTrack) {
    inputs.push({
      kind: 'audio',
      stream: singleTrackStream(audioTrack),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: audioSpec(audioTrack),
    });
  }

  const microphoneTrack = sources.microphoneAudioStream?.getAudioTracks()[0];
  if (microphoneTrack) {
    inputs.push({
      kind: 'microphone-audio',
      stream: singleTrackStream(microphoneTrack),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: audioSpec(microphoneTrack),
    });
  }

  const systemTrack = sources.systemAudioStream?.getAudioTracks()[0];
  if (systemTrack) {
    inputs.push({
      kind: 'system-audio',
      stream: singleTrackStream(systemTrack),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: audioSpec(systemTrack),
    });
  }

  return {
    inputs,
    missingSources: [
      !webcamTrack ? 'webcam' : null,
      !screenTrack ? 'screen' : null,
      !audioTrack ? 'audio' : null,
      !microphoneTrack ? 'microphone audio' : null,
      !systemTrack ? 'system audio' : null,
    ].filter((source): source is string => source !== null),
  };
}

export async function createRecordingAsset(
  kind: RecordingAssetKind,
  chunks: Blob[],
  spec: RecordingAssetSpec,
  durationMs: number,
): Promise<RecordingAssetMetadata> {
  const rawBlob = new Blob(chunks, { type: spec.mimeType || defaultMimeType(kind) });
  const blob = rawBlob.type.includes('webm')
    ? await repairWebmDuration(rawBlob, durationMs)
    : rawBlob;

  return {
    kind,
    fileSizeBytes: blob.size,
    mimeType: blob.type || spec.mimeType,
    resolution: spec.resolution,
    fps: spec.fps,
    sampleRateHz: spec.sampleRateHz,
    blob,
  };
}

export function snapshotRecordingAssets(
  chunksByKind: Partial<Record<RecordingAssetKind, Blob[]>>,
  specsByKind: Partial<Record<RecordingAssetKind, RecordingAssetSpec>>,
): NonNullable<RecordingDraft['assets']> {
  return Object.fromEntries(
    MEDIA_ASSET_ORDER.flatMap((kind) => {
      const chunks = chunksByKind[kind];
      const spec = specsByKind[kind];
      if (!chunks || !spec) return [];
      return [[kind, { ...spec, chunks: [...chunks] }]];
    }),
  );
}
