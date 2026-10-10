'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteRecordingDraft, saveLocalRecording, saveRecordingDraft } from '@/lib/idb';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import type { RecordingMetadata, RecordingStatus } from '@/types/recording';

const MAX_ACTIVE_MS = 30 * 60 * 1000;
const WARNING_ACTIVE_MS = 15 * 60 * 1000;
const FINAL_WARNING_ACTIVE_MS = 29 * 60 * 1000;
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

interface Options {
  videoStream: MediaStream | null;
  audioStream: MediaStream | null;
  resolution: string;
  fps?: number;
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

function chooseMimeType() {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function useRecordingSession({ videoStream, audioStream, resolution, fps = 30 }: Options): RecordingSessionResult {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingIdRef = useRef('');
  const startedAtRef = useRef('');
  const activeStartedAtRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<RecordingSessionResult['status']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingMetadata | null>(null);

  const currentElapsed = useCallback(() => accumulatedMsRef.current + (
    recorderRef.current?.state === 'recording' ? performance.now() - activeStartedAtRef.current : 0
  ), []);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (recorder.state === 'recording') {
      accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    }
    clearTimer();
    setElapsedMs(Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS));
    setStatus('processing');
    recorder.stop();
  }, [clearTimer]);

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
    const tracks = [videoStream.getVideoTracks()[0], ...(audioStream?.getAudioTracks().slice(0, 1) ?? [])];
    const combinedStream = new MediaStream(tracks);
    const mimeType = chooseMimeType();
    const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    recorderRef.current = recorder;
    chunksRef.current = [];
    recordingIdRef.current = id;
    startedAtRef.current = startedAt;
    accumulatedMsRef.current = 0;
    activeStartedAtRef.current = performance.now();
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setRecording(null);

    recorder.ondataavailable = (event) => {
      if (event.data.size <= 0) return;
      chunksRef.current.push(event.data);
      void saveRecordingDraft({
        id,
        startedAt,
        durationMs: currentElapsed(),
        mimeType: recorder.mimeType || mimeType || 'video/webm',
        chunks: [...chunksRef.current],
      }).catch((cause) => setWarning(`Recovery checkpoint unavailable: ${(cause as Error).message}`));
    };
    recorder.onerror = (event) => {
      setError((event as Event & { error?: DOMException }).error?.message ?? 'The encoder stopped unexpectedly.');
      stop();
    };
    recorder.onstop = () => {
      void (async () => {
        try {
          const durationMs = Math.min(accumulatedMsRef.current, MAX_ACTIVE_MS);
          const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || 'video/webm' });
          const fixedBlob = rawBlob.type.includes('webm') ? await repairWebmDuration(rawBlob, durationMs) : rawBlob;
          if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
          const previewUrl = URL.createObjectURL(fixedBlob);
          previewUrlRef.current = previewUrl;
          const result: RecordingMetadata = {
            id,
            localId: id,
            title: `Recording ${new Date(startedAt).toLocaleString()}`,
            durationSeconds: durationMs / 1000,
            fileSizeBytes: fixedBlob.size,
            resolution,
            fps,
            mimeType: fixedBlob.type,
            createdAt: startedAt,
            blob: fixedBlob,
            previewUrl,
          };
          await saveLocalRecording(result);
          await deleteRecordingDraft(id);
          setRecording(result);
          setStatus('ready');
        } catch (cause) {
          setError(`Could not finalize recording: ${(cause as Error).message}`);
          setStatus('error');
        }
      })();
    };
    recorder.start(1000);
    setStatus('recording');
    startClock();
  }, [audioStream, currentElapsed, fps, resolution, startClock, stop, videoStream]);

  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    accumulatedMsRef.current += performance.now() - activeStartedAtRef.current;
    recorder.pause();
    clearTimer();
    setElapsedMs(accumulatedMsRef.current);
    setStatus('paused');
  }, [clearTimer]);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    activeStartedAtRef.current = performance.now();
    setStatus('recording');
    startClock();
  }, [startClock]);

  const reset = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(null);
    setElapsedMs(0);
    setWarning(null);
    setError(null);
    setStatus('idle');
  }, []);

  useEffect(() => () => {
    clearTimer();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, [clearTimer]);

  useEffect(() => {
    const videoTrack = videoStream?.getVideoTracks()[0];
    if (!videoTrack) return;
    const handleEnded = () => {
      if (recorderRef.current?.state !== 'inactive') {
        setWarning('The visual source ended. Finalizing available footage.');
        stop();
      }
    };
    videoTrack.addEventListener('ended', handleEnded);
    return () => videoTrack.removeEventListener('ended', handleEnded);
  }, [stop, videoStream]);

  return { status, elapsedMs, warning, error, recording, start, pause, resume, stop, reset };
}
