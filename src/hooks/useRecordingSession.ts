'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteRecordingDraft, saveLocalRecording, saveRecordingDraft } from '@/lib/idb';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import { decodeRecordedWaveform } from '@/lib/audioWaveform';
import type {
  CursorCaptureController,
  CursorTrajectory,
  RecordingAssetKind,
  RecordingAssetMetadata,
  RecordingMetadata,
  RecordingStatus,
} from '@/types/recording';

const MAX_ACTIVE_MS = 30 * 60 * 1000;
const WARNING_ACTIVE_MS = 15 * 60 * 1000;
const FINAL_WARNING_ACTIVE_MS = 29 * 60 * 1000;
const ASSET_ORDER: RecordingAssetKind[] = ['composite', 'webcam', 'screen', 'audio'];

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
  return kind === 'audio' ? 'audio/webm' : 'video/webm';
}

export function useRecordingSession({
  videoStream,
  webcamStream = null,
  screenStream = null,
  audioStream,
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
  const finalizingRef = useRef(false);
  const stoppedAssetsRef = useRef<Set<RecordingAssetKind>>(new Set());
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cursorStopRef = useRef<Promise<CursorTrajectory | null>>(Promise.resolve(null));
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

  const checkpointDraft = useCallback(() => {
    const id = recordingIdRef.current;
    const startedAt = startedAtRef.current;
    if (!id || !startedAt) return;

    draftWriteRef.current = draftWriteRef.current
      .catch(() => undefined)
      .then(async () => {
        const assets = Object.fromEntries(
          ASSET_ORDER.flatMap((kind) => {
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
      const id = recordingIdRef.current;
      const startedAt = startedAtRef.current;
      const durationMs = Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS);
      const assets: Partial<Record<RecordingAssetKind, RecordingAssetMetadata>> = {};

      for (const kind of ASSET_ORDER) {
        const chunks = chunksRef.current[kind];
        const spec = assetSpecsRef.current[kind];
        if (!chunks?.length || !spec) continue;

        const rawBlob = new Blob(chunks, { type: spec.mimeType || defaultMimeType(kind) });
        const blob = rawBlob.type.includes('webm')
          ? await repairWebmDuration(rawBlob, durationMs)
          : rawBlob;
        assets[kind] = {
          kind,
          fileSizeBytes: blob.size,
          mimeType: blob.type || spec.mimeType,
          resolution: spec.resolution,
          fps: spec.fps,
          sampleRateHz: spec.sampleRateHz,
          blob,
        };
      }

      const cursorTrajectory = await cursorStopRef.current.catch((cause) => {
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

      const audioAsset = assets.audio;
      if (audioAsset?.blob) {
        try {
          const waveform = await decodeRecordedWaveform(audioAsset.blob);
          audioAsset.waveformPeaks = waveform.peaks;
        } catch (cause) {
          assetErrorsRef.current.push(`audio waveform: ${(cause as Error).message}`);
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
  }, [fps, resolution]);

  const markAssetStopped = useCallback((kind: RecordingAssetKind) => {
    stoppedAssetsRef.current.add(kind);
    const recorderCount = Object.keys(recordersRef.current).length;
    if (recorderCount > 0 && stoppedAssetsRef.current.size >= recorderCount) {
      void finalizeSession();
    }
  }, [finalizeSession]);

  const stop = useCallback(() => {
    const recorders = Object.values(recordersRef.current).filter(Boolean) as MediaRecorder[];
    if (recorders.length === 0 || recorders.every((recorder) => recorder.state === 'inactive')) return;

    if (recordingActiveRef.current) {
      accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    }
    recordingActiveRef.current = false;
    clearTimer();
    const durationMs = Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS);
    setElapsedMs(durationMs);
    setStatus('processing');
    cursorStopRef.current = cursorCapture?.stop(durationMs) ?? Promise.resolve(null);

    recorders.forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
  }, [clearTimer, cursorCapture]);

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
    const recorderInputs: Array<{
      kind: RecordingAssetKind;
      stream: MediaStream;
      candidates: string[];
      spec: Omit<AssetSpec, 'mimeType'>;
    }> = [];

    const compositeTracks = [
      videoStream.getVideoTracks()[0],
      ...(audioStream?.getAudioTracks().slice(0, 1) ?? []),
    ];
    recorderInputs.push({
      kind: 'composite',
      stream: new MediaStream(compositeTracks),
      candidates: COMPOSITE_MIME_CANDIDATES,
      spec: { resolution, fps },
    });

    const webcamTrack = webcamStream?.getVideoTracks()[0];
    if (webcamTrack) {
      recorderInputs.push({
        kind: 'webcam',
        stream: new MediaStream([webcamTrack]),
        candidates: VIDEO_MIME_CANDIDATES,
        spec: { resolution: '1280x720', fps },
      });
    }

    const screenTrack = screenStream?.getVideoTracks()[0];
    if (screenTrack) {
      recorderInputs.push({
        kind: 'screen',
        stream: new MediaStream([screenTrack]),
        candidates: VIDEO_MIME_CANDIDATES,
        spec: { resolution: '1920x1080', fps },
      });
    }

    const audioTrack = audioStream?.getAudioTracks()[0];
    if (audioTrack) {
      recorderInputs.push({
        kind: 'audio',
        stream: new MediaStream([audioTrack]),
        candidates: AUDIO_MIME_CANDIDATES,
        spec: { sampleRateHz: audioTrack.getSettings().sampleRate ?? 48_000 },
      });
    }

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
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setRecording(null);

    try {
      if (cursorCapture) {
        try {
          const cursorResult = await cursorCapture.start(id);
          if (!cursorResult.started && cursorResult.warning) assetErrorsRef.current.push(cursorResult.warning);
        } catch (cause) {
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

      ASSET_ORDER.forEach((kind) => recordersRef.current[kind]?.start(1000));
      setStatus('recording');
      startClock();

      const missingSources = [
        !webcamTrack ? 'webcam' : null,
        !screenTrack ? 'screen' : null,
        !audioTrack ? 'audio' : null,
      ].filter(Boolean);
      if (missingSources.length > 0) {
        setWarning(`This session will not include separate ${missingSources.join(', ')} output.`);
      }
    } catch (cause) {
      recordingActiveRef.current = false;
      void cursorCapture?.reset();
      Object.values(recordersRef.current).forEach((recorder) => {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      });
      setError(`Could not start all recording encoders: ${(cause as Error).message}`);
      setStatus('error');
    }
  }, [audioStream, checkpointDraft, cursorCapture, fps, markAssetStopped, resolution, screenStream, startClock, stop, videoStream, webcamStream]);

  const pause = useCallback(() => {
    const recorders = Object.values(recordersRef.current).filter(Boolean) as MediaRecorder[];
    if (!recordingActiveRef.current || recorders.length === 0) return;

    accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    recordingActiveRef.current = false;
    recorders.forEach((recorder) => {
      if (recorder.state === 'recording') recorder.pause();
    });
    clearTimer();
    void cursorCapture?.pause().catch((cause) => {
      setWarning(`Cursor helper pause failed: ${(cause as Error).message}`);
    });
    setElapsedMs(accumulatedMsRef.current);
    setStatus('paused');
  }, [clearTimer, cursorCapture]);

  const resume = useCallback(() => {
    const recorders = Object.values(recordersRef.current).filter(Boolean) as MediaRecorder[];
    if (recorders.length === 0 || !recorders.some((recorder) => recorder.state === 'paused')) return;

    recorders.forEach((recorder) => {
      if (recorder.state === 'paused') recorder.resume();
    });
    activeStartedAtRef.current = performance.now();
    recordingActiveRef.current = true;
    void cursorCapture?.resume().catch((cause) => {
      setWarning(`Cursor helper resume failed: ${(cause as Error).message}`);
    });
    setStatus('recording');
    startClock();
  }, [cursorCapture, startClock]);

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
    void cursorCapture?.reset();
    setRecording(null);
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setStatus('idle');
  }, [cursorCapture]);

  useEffect(() => () => {
    clearTimer();
    recordingActiveRef.current = false;
    Object.values(recordersRef.current).forEach((recorder) => {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
    });
    void cursorCapture?.reset();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [clearTimer, cursorCapture]);

  return { status, elapsedMs, warning, error, recording, start, pause, resume, stop, reset };
}
