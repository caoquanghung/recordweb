'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteRecordingDraft, saveLocalRecording, saveRecordingDraft } from '@/lib/idb';
import {
  MEDIA_ASSET_ORDER,
  createMediaRecorder,
  createRecorderInputs,
  getActiveRecorders,
  resolveRecorderMimeType,
  snapshotRecordingAssets,
  type RecordingAssetSpec,
} from '@/lib/recordingAssets';
import { createRecordingClock } from '@/lib/recordingClock';
import { finalizeRecordingAssets } from '@/lib/recordingFinalization';
import type {
  CursorCaptureController,
  CursorTrajectory,
  RecordingAssetKind,
  RecordingMetadata,
  RecordingStatus,
} from '@/types/recording';

const MAX_ACTIVE_MS = 30 * 60 * 1000;
const WARNING_ACTIVE_MS = 15 * 60 * 1000;
const FINAL_WARNING_ACTIVE_MS = 29 * 60 * 1000;
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
  const assetSpecsRef = useRef<Partial<Record<RecordingAssetKind, RecordingAssetSpec>>>({});
  const assetErrorsRef = useRef<string[]>([]);
  const recordingIdRef = useRef('');
  const startedAtRef = useRef('');
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const sessionCursorCaptureRef = useRef<CursorCaptureController | null>(null);
  const finalizingRef = useRef(false);
  const stoppedAssetsRef = useRef<Set<RecordingAssetKind>>(new Set());
  const draftWriteRef = useRef<Promise<void>>(Promise.resolve());
  const cursorStopRef = useRef<Promise<CursorTrajectory | null>>(Promise.resolve(null));
  const cursorStopRequestedRef = useRef(false);
  const [clock] = useState(() => createRecordingClock());
  const [status, setStatus] = useState<RecordingSessionResult['status']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingMetadata | null>(null);

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
        await saveRecordingDraft({
          id,
          startedAt,
          durationMs: clock.elapsed(),
          assets: snapshotRecordingAssets(chunksRef.current, assetSpecsRef.current),
        });
      })
      .catch((cause) => {
        setWarning(`Recovery checkpoint unavailable: ${(cause as Error).message}`);
      });
  }, [clock]);

  const finalizeSession = useCallback(async () => {
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    try {
      clock.pause();
      clearTimer();
      const id = recordingIdRef.current;
      const startedAt = startedAtRef.current;
      const durationMs = Math.min(clock.elapsed(), MAX_ACTIVE_MS);
      setElapsedMs(durationMs);
      setStatus('processing');
      const assets = await finalizeRecordingAssets({
        chunksByKind: chunksRef.current,
        specsByKind: assetSpecsRef.current,
        durationMs,
        getCursorTrajectory: () => requestCursorStop(durationMs),
        errors: assetErrorsRef.current,
      });
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
  }, [clearTimer, clock, fps, requestCursorStop, resolution]);

  const markAssetStopped = useCallback((kind: RecordingAssetKind) => {
    stoppedAssetsRef.current.add(kind);
    const recorderCount = Object.keys(recordersRef.current).length;
    if (recorderCount > 0 && stoppedAssetsRef.current.size >= recorderCount) {
      void finalizeSession();
    }
  }, [finalizeSession]);

  const stop = useCallback(() => {
    const recorders = getActiveRecorders(recordersRef.current);
    if (recorders.length === 0) return;

    clock.pause();
    clearTimer();
    const durationMs = Math.min(clock.elapsed(), MAX_ACTIVE_MS);
    setElapsedMs(durationMs);
    setStatus('processing');
    void requestCursorStop(durationMs);

    if (recorders.every((recorder) => recorder.state === 'inactive')) {
      return;
    }

    recorders.forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
  }, [clearTimer, clock, requestCursorStop]);

  const startClock = useCallback(() => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      const elapsed = clock.elapsed();
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
  }, [clearTimer, clock, stop]);

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
    clock.reset();
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

      clock.start();

      recorderInputs.forEach(({ kind, stream, candidates, spec }) => {
        const { recorder, requestedMimeType } = createMediaRecorder(stream, candidates);
        recordersRef.current[kind] = recorder;
        chunksRef.current[kind] = [];
        assetSpecsRef.current[kind] = {
          ...spec,
          mimeType: resolveRecorderMimeType(kind, recorder, requestedMimeType),
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
      clock.pause();
      void sessionCursorCaptureRef.current?.reset();
      getActiveRecorders(recordersRef.current).forEach((recorder) => {
        if (recorder.state !== 'inactive') recorder.stop();
      });
      setError(`Could not start all recording encoders: ${(cause as Error).message}`);
      setStatus('error');
    }
  }, [audioStream, checkpointDraft, clock, cursorCapture, fps, markAssetStopped, microphoneAudioStream, resolution, screenStream, startClock, stop, systemAudioStream, videoStream, webcamStream]);

  const pause = useCallback(() => {
    const recorders = getActiveRecorders(recordersRef.current);
    if (!clock.isActive() || recorders.length === 0) return;

    const activeDurationMs = clock.pause();
    recorders.forEach((recorder) => {
      if (recorder.state === 'recording') recorder.pause();
    });
    clearTimer();
    void sessionCursorCaptureRef.current?.pause().catch((cause) => {
      setWarning(`Cursor helper pause failed: ${(cause as Error).message}`);
    });
    setElapsedMs(activeDurationMs);
    setStatus('paused');
  }, [clearTimer, clock]);

  const resume = useCallback(() => {
    const recorders = getActiveRecorders(recordersRef.current);
    if (recorders.length === 0 || !recorders.some((recorder) => recorder.state === 'paused')) return;

    recorders.forEach((recorder) => {
      if (recorder.state === 'paused') recorder.resume();
    });
    clock.start();
    void sessionCursorCaptureRef.current?.resume().catch((cause) => {
      setWarning(`Cursor helper resume failed: ${(cause as Error).message}`);
    });
    setStatus('recording');
    startClock();
  }, [clock, startClock]);

  const reset = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    recordersRef.current = {};
    chunksRef.current = {};
    assetSpecsRef.current = {};
    assetErrorsRef.current = [];
    clock.reset();
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
  }, [clock]);

  useEffect(() => () => {
    clearTimer();
    clock.pause();
    getActiveRecorders(recordersRef.current).forEach((recorder) => {
      if (recorder.state !== 'inactive') recorder.stop();
    });
    void sessionCursorCaptureRef.current?.reset();
    sessionCursorCaptureRef.current = null;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [clearTimer, clock]);

  return { status, elapsedMs, warning, error, recording, start, pause, resume, stop, reset };
}
