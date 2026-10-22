'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteRecordingDraft, saveLocalRecording, saveRecordingDraft } from '@/lib/idb';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import { decodeRecordedWaveform } from '@/lib/audioWaveform';
import type {
  CursorCaptureController,
  CursorTrajectory,
  RecordingAudioAssetKind,
  RecordingAssetKind,
  RecordingAssetMetadata,
  RecordingMetadata,
  RecordingStatus,
} from '@/types/recording';

const MAX_ACTIVE_MS = 30 * 60 * 1000;
const WARNING_ACTIVE_MS = 15 * 60 * 1000;
const FINAL_WARNING_ACTIVE_MS = 29 * 60 * 1000;
const MEDIA_ASSET_ORDER: Exclude<RecordingAssetKind, 'cursor'>[] = [
  'composite',
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
];
const AUDIO_ASSET_KINDS: RecordingAudioAssetKind[] = [
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

interface Options {
  videoStream: MediaStream | null;
  webcamStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  audioStream: MediaStream | null;
  microphoneAudioStream?: MediaStream | null;
  systemAudioStream?: MediaStream | null;
  resolution: string;
  fps?: number;
  cursorCapture?: CursorCaptureController;
}

interface AssetSpec {
  mimeType: string;
  resolution?: string;
  fps?: number;
  sampleRateHz?: number;
}

interface RecorderInput {
  kind: RecordingAssetKind;
  stream: MediaStream;
  candidates: string[];
  spec: Omit<AssetSpec, 'mimeType'>;
}

export interface RecordingSessionResult {
  status: RecordingStatus | 'error';
  elapsedMs: number;
  warning: string | null;
  error: string | null;
  recording: RecordingMetadata | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

function chooseMimeType(candidates: string[]) {
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function createRecorder(stream: MediaStream, candidates: string[]) {
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

function defaultMimeType(kind: RecordingAssetKind) {
  if (kind === 'cursor') return 'application/json';
  return AUDIO_ASSET_KINDS.includes(kind as RecordingAudioAssetKind) ? 'audio/webm' : 'video/webm';
}

function getRecorders(
  recorders: Partial<Record<RecordingAssetKind, MediaRecorder>>,
): MediaRecorder[] {
  return Object.values(recorders).filter((recorder): recorder is MediaRecorder => Boolean(recorder));
}

function createRecorderInputs({
  videoStream,
  webcamStream,
  screenStream,
  audioStream,
  microphoneAudioStream,
  systemAudioStream,
  resolution,
  fps,
}: Required<Pick<Options,
  | 'videoStream'
  | 'webcamStream'
  | 'screenStream'
  | 'audioStream'
  | 'microphoneAudioStream'
  | 'systemAudioStream'
  | 'resolution'
  | 'fps'
>>): {
  inputs: RecorderInput[];
  missingSources: string[];
} {
  const inputs: RecorderInput[] = [];
  const videoTrack = videoStream?.getVideoTracks()[0];
  if (!videoTrack) return { inputs, missingSources: [] };

  const audioTrack = audioStream?.getAudioTracks()[0];
  inputs.push({
    kind: 'composite',
    stream: new MediaStream([videoTrack, ...(audioTrack ? [audioTrack] : [])]),
    candidates: COMPOSITE_MIME_CANDIDATES,
    spec: { resolution, fps },
  });

  const webcamTrack = webcamStream?.getVideoTracks()[0];
  if (webcamTrack) {
    inputs.push({
      kind: 'webcam',
      stream: new MediaStream([webcamTrack]),
      candidates: VIDEO_MIME_CANDIDATES,
      spec: { resolution: '1280x720', fps },
    });
  }

  const screenTrack = screenStream?.getVideoTracks()[0];
  if (screenTrack) {
    inputs.push({
      kind: 'screen',
      stream: new MediaStream([screenTrack]),
      candidates: VIDEO_MIME_CANDIDATES,
      spec: { resolution: '1920x1080', fps },
    });
  }

  if (audioTrack) {
    inputs.push({
      kind: 'audio',
      stream: new MediaStream([audioTrack]),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: { sampleRateHz: audioTrack.getSettings().sampleRate ?? 48_000 },
    });
  }

  const microphoneAudioTrack = microphoneAudioStream?.getAudioTracks()[0];
  if (microphoneAudioTrack) {
    inputs.push({
      kind: 'microphone-audio',
      stream: new MediaStream([microphoneAudioTrack]),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: { sampleRateHz: microphoneAudioTrack.getSettings().sampleRate ?? 48_000 },
    });
  }

  const systemAudioTrack = systemAudioStream?.getAudioTracks()[0];
  if (systemAudioTrack) {
    inputs.push({
      kind: 'system-audio',
      stream: new MediaStream([systemAudioTrack]),
      candidates: AUDIO_MIME_CANDIDATES,
      spec: { sampleRateHz: systemAudioTrack.getSettings().sampleRate ?? 48_000 },
    });
  }

  return {
    inputs,
    missingSources: [
      !webcamTrack ? 'webcam' : null,
      !screenTrack ? 'screen' : null,
      !audioTrack ? 'audio' : null,
      !microphoneAudioTrack ? 'microphone audio' : null,
      !systemAudioTrack ? 'system audio' : null,
    ].filter((source): source is string => source !== null),
  };
}

async function createAssetMetadata(
  kind: RecordingAssetKind,
  chunks: Blob[],
  spec: AssetSpec,
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

export function useRecordingSession({
  videoStream,
  webcamStream = null,
  screenStream = null,
  audioStream,
  microphoneAudioStream = null,
  systemAudioStream = null,
  resolution,
  fps = 30,
  cursorCapture,
}: Options): RecordingSessionResult {
  const recordersRef = useRef<Partial<Record<RecordingAssetKind, MediaRecorder>>>({});
  const chunksRef = useRef<Partial<Record<RecordingAssetKind, Blob[]>>>({});
  const assetSpecsRef = useRef<Partial<Record<RecordingAssetKind, AssetSpec>>>({});
  const assetErrorsRef = useRef<string[]>([]);
  const recordingIdRef = useRef('');
  const startedAtRef = useRef('');
  const activeStartedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const recordingActiveRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const sessionCursorCaptureRef = useRef<CursorCaptureController | null>(null);
  const finalizingRef = useRef(false);
  const stoppedAssetsRef = useRef<Set<RecordingAssetKind>>(new Set());
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cursorStopRef = useRef<Promise<CursorTrajectory | null>>(Promise.resolve(null));
  const cursorStopRequestedRef = useRef(false);
  const [status, setStatus] = useState<RecordingSessionResult['status']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingMetadata | null>(null);

  const currentElapsed = useCallback(() => accumulatedMsRef.current + (
    recordingActiveRef.current ? performance.now() - activeStartedAtRef.current : 0
  ), []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const requestCursorStop = useCallback((durationMs: number) => {
    if (!cursorStopRequestedRef.current) {
      cursorStopRequestedRef.current = true;
      const controller = sessionCursorCaptureRef.current;
      cursorStopRef.current = controller
        ? Promise.resolve().then(() => controller.stop(durationMs))
        : Promise.resolve(null);
    }
    return cursorStopRef.current;
  }, []);

  const checkpointDraft = useCallback(() => {
    const id = recordingIdRef.current;
    const startedAt = startedAtRef.current;
    if (!id || !startedAt) return;

    draftWriteRef.current = draftWriteRef.current
      .catch(() => undefined)
      .then(async () => {
        const assets = Object.fromEntries(
          MEDIA_ASSET_ORDER.flatMap((kind) => {
            const chunks = chunksRef.current[kind];
            const spec = assetSpecsRef.current[kind];
            if (!chunks || !spec) return [];
            return [[kind, { ...spec, chunks: [...chunks] }]];
          }),
        );
        await saveRecordingDraft({
          id,
          startedAt,
          durationMs: currentElapsed(),
          assets,
        });
      })
      .catch((cause) => {
        setWarning(`Recovery checkpoint unavailable: ${(cause as Error).message}`);
      });
  }, [currentElapsed]);

  const finalizeSession = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    try {
      if (recordingActiveRef.current) {
        accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
      }
      recordingActiveRef.current = false;
      clearTimer();
      const id = recordingIdRef.current;
      const startedAt = startedAtRef.current;
      const durationMs = Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS);
      setElapsedMs(durationMs);
      setStatus('processing');
      const assets: Partial<Record<RecordingAssetKind, RecordingAssetMetadata>> = {};

      for (const kind of MEDIA_ASSET_ORDER) {
        const chunks = chunksRef.current[kind];
        const spec = assetSpecsRef.current[kind];
        if (!chunks?.length || !spec) continue;

        assets[kind] = await createAssetMetadata(kind, chunks, spec, durationMs);
      }

      const cursorTrajectory = await requestCursorStop(durationMs).catch((cause) => {
        assetErrorsRef.current.push(`cursor: ${(cause as Error).message}`);
        return null;
      });
      if (cursorTrajectory) {
        const blob = new Blob([JSON.stringify(cursorTrajectory, null, 2)], { type: 'application/json' });
        assets.cursor = {
          kind: 'cursor',
          fileSizeBytes: blob.size,
          mimeType: blob.type,
          sampleRateHz: cursorTrajectory.sampleRateHz,
          blob,
        };
      }

      for (const kind of AUDIO_ASSET_KINDS) {
        const audioAsset = assets[kind];
        if (!audioAsset?.blob) continue;
        try {
          const waveform = await decodeRecordedWaveform(audioAsset.blob);
          audioAsset.waveformPeaks = waveform.peaks;
        } catch (cause) {
          assetErrorsRef.current.push(`${kind} waveform: ${(cause as Error).message}`);
        }
      }

      const composite = assets.composite;
      if (!composite?.blob) throw new Error('The composite encoder did not produce a usable file.');

      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const previewUrl = URL.createObjectURL(composite.blob);
      previewUrlRef.current = previewUrl;
      const result: RecordingMetadata = {
        id,
        localId: id,
        title: `Recording ${new Date(startedAt).toLocaleString()}`,
        durationSeconds: durationMs / 1000,
        fileSizeBytes: composite.fileSizeBytes,
        resolution,
        fps,
        mimeType: composite.mimeType,
        createdAt: startedAt,
        blob: composite.blob,
        previewUrl,
        assets,
      };

      await saveLocalRecording(result);
      await draftWriteRef.current.catch(() => undefined);
      await deleteRecordingDraft(id);
      setRecording(result);
      setStatus('ready');

      if (assetErrorsRef.current.length > 0) {
        setWarning(`Recording completed with source warnings: ${assetErrorsRef.current.join(' ')}`);
      }
    } catch (cause) {
      setError(`Could not finalize recording: ${(cause as Error).message}`);
      setStatus('error');
    }
  }, [clearTimer, fps, requestCursorStop, resolution]);

  const markAssetStopped = useCallback((kind: RecordingAssetKind) => {
    stoppedAssetsRef.current.add(kind);
    const recorderCount = Object.keys(recordersRef.current).length;
    if (recorderCount > 0 && stoppedAssetsRef.current.size >= recorderCount) {
      void finalizeSession();
    }
  }, [finalizeSession]);

  const stop = useCallback(() => {
    const recorders = getRecorders(recordersRef.current);
    if (recorders.length === 0) return;

    if (recordingActiveRef.current) {
      accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    }
    recordingActiveRef.current = false;
    clearTimer();
    const durationMs = Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS);
    setElapsedMs(durationMs);
    setStatus('processing');
    void requestCursorStop(durationMs);

    if (recorders.every((recorder) => recorder.state === 'inactive')) {
      return;
    }

    recorders.forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
  }, [clearTimer, requestCursorStop]);

  const startClock = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const elapsed = currentElapsed();
      setElapsedMs(Math.min(elapsed, MAX_ACTIVE_MS));
      if (elapsed >= MAX_ACTIVE_MS) {
        setWarning('30-minute limit reached. Finalizing your recording.');
        stop();
      } else if (elapsed >= FINAL_WARNING_ACTIVE_MS) {
        setWarning('Less than one minute remains.');
      } else if (elapsed >= WARNING_ACTIVE_MS) {
        setWarning('15 minutes recorded. The session will stop at 30 minutes.');
      }
    }, 250);
  }, [clearTimer, currentElapsed, stop]);

  const start = useCallback(async () => {
    if (!videoStream?.getVideoTracks().length) {
      setError('Connect a visual source before recording.');
      setStatus('error');
      return;
    }
    if (!('MediaRecorder' in window)) {
      setError('MediaRecorder is unavailable in this browser.');
      setStatus('error');
      return;
    }

    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const { inputs: recorderInputs, missingSources } = createRecorderInputs({
      videoStream,
      webcamStream,
      screenStream,
      audioStream,
      microphoneAudioStream,
      systemAudioStream,
      resolution,
      fps,
    });

    recordersRef.current = {};
    chunksRef.current = {};
    assetSpecsRef.current = {};
    assetErrorsRef.current = [];
    recordingIdRef.current = id;
    startedAtRef.current = startedAt;
    accumulatedMsRef.current = 0;
    activeStartedAtRef.current = 0;
    recordingActiveRef.current = false;
    finalizingRef.current = false;
    stoppedAssetsRef.current = new Set();
    draftWriteRef.current = Promise.resolve();
    cursorStopRef.current = Promise.resolve(null);
    cursorStopRequestedRef.current = false;
    sessionCursorCaptureRef.current = cursorCapture ?? null;
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setRecording(null);

    try {
      if (sessionCursorCaptureRef.current) {
        try {
          const cursorResult = await sessionCursorCaptureRef.current.start(id);
          if (!cursorResult.started) {
            const message = cursorResult.warning ?? 'Cursor tracking did not start.';
            if (sessionCursorCaptureRef.current.requiredForRecording) throw new Error(message);
            assetErrorsRef.current.push(message);
          }
        } catch (cause) {
          if (sessionCursorCaptureRef.current.requiredForRecording) throw cause;
          assetErrorsRef.current.push(`cursor: ${(cause as Error).message}`);
        }
      }

      activeStartedAtRef.current = performance.now();
      recordingActiveRef.current = true;

      recorderInputs.forEach(({ kind, stream, candidates, spec }) => {
        const { recorder, requestedMimeType } = createRecorder(stream, candidates);
        recordersRef.current[kind] = recorder;
        chunksRef.current[kind] = [];
        assetSpecsRef.current[kind] = {
          ...spec,
          mimeType: recorder.mimeType || requestedMimeType || defaultMimeType(kind),
        };

        recorder.ondataavailable = (event) => {
          if (event.data.size <= 0) return;
          chunksRef.current[kind]?.push(event.data);
          checkpointDraft();
        };
        recorder.onerror = (event) => {
          const message = (event as Event & { error?: DOMException }).error?.message
            ?? `${kind} encoder stopped unexpectedly.`;
          assetErrorsRef.current.push(`${kind}: ${message}`);
          if (kind === 'composite') {
            setError(message);
            stop();
          } else {
            setWarning(`${kind} source encoder stopped; the remaining outputs are still recording.`);
          }
        };
        recorder.onstop = () => markAssetStopped(kind);
      });

      MEDIA_ASSET_ORDER.forEach((kind) => recordersRef.current[kind]?.start(1000));
      setStatus('recording');
      startClock();

      if (missingSources.length > 0) {
        setWarning(`This session will not include separate ${missingSources.join(', ')} output.`);
      }
    } catch (cause) {
      recordingActiveRef.current = false;
      void sessionCursorCaptureRef.current?.reset();
      getRecorders(recordersRef.current).forEach((recorder) => {
        if (recorder.state !== 'inactive') recorder.stop();
      });
      setError(`Could not start all recording encoders: ${(cause as Error).message}`);
      setStatus('error');
    }
  }, [audioStream, checkpointDraft, cursorCapture, fps, markAssetStopped, microphoneAudioStream, resolution, screenStream, startClock, stop, systemAudioStream, videoStream, webcamStream]);

  const pause = useCallback(() => {
    const recorders = getRecorders(recordersRef.current);
    if (!recordingActiveRef.current || recorders.length === 0) return;

    accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    recordingActiveRef.current = false;
    recorders.forEach((recorder) => {
      if (recorder.state === 'recording') recorder.pause();
    });
    clearTimer();
    void sessionCursorCaptureRef.current?.pause().catch((cause) => {
      setWarning(`Cursor helper pause failed: ${(cause as Error).message}`);
    });
    setElapsedMs(accumulatedMsRef.current);
    setStatus('paused');
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorders = getRecorders(recordersRef.current);
    if (recorders.length === 0 || !recorders.some((recorder) => recorder.state === 'paused')) return;

    recorders.forEach((recorder) => {
      if (recorder.state === 'paused') recorder.resume();
    });
    activeStartedAtRef.current = performance.now();
    recordingActiveRef.current = true;
    void sessionCursorCaptureRef.current?.resume().catch((cause) => {
      setWarning(`Cursor helper resume failed: ${(cause as Error).message}`);
    });
    setStatus('recording');
    startClock();
  }, [startClock]);

  const reset = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    recordersRef.current = {};
    chunksRef.current = {};
    assetSpecsRef.current = {};
    assetErrorsRef.current = [];
    recordingActiveRef.current = false;
    finalizingRef.current = false;
    stoppedAssetsRef.current = new Set();
    cursorStopRef.current = Promise.resolve(null);
    cursorStopRequestedRef.current = false;
    void sessionCursorCaptureRef.current?.reset();
    sessionCursorCaptureRef.current = null;
    setRecording(null);
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    clearTimer();
    recordingActiveRef.current = false;
    getRecorders(recordersRef.current).forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
    void sessionCursorCaptureRef.current?.reset();
    sessionCursorCaptureRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [clearTimer]);

  return { status, elapsedMs, warning, error, recording, start, pause, resume, stop, reset };
}
