'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createMutedVideo, disposeVideo, getErrorMessage } from '@/hooks/mediaHookUtils';

export type CalibrationCameraStatus = 'idle' | 'starting' | 'ready' | 'error';

function describeCameraError(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Trình duyệt chưa cho phép dùng camera. Hãy cấp quyền camera rồi thử lại.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'Không tìm thấy camera nào.';
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Không mở được camera vì đang được app hoặc tab khác sử dụng. Hãy ngắt camera ở nơi đó (ví dụ Studio) rồi thử lại.';
  }
  return getErrorMessage(cause, 'Không thể mở camera.');
}

/**
 * Page-owned webcam (video only). Deliberately independent of MediaSessionProvider so the
 * calibration page never changes the shared Studio stream. Every track is stopped on
 * stop(), on device change and on unmount.
 */
export function useCalibrationCamera() {
  const [status, setStatus] = useState<CalibrationCameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const generationRef = useRef(0);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    disposeVideo(videoRef.current);
    videoRef.current = null;
    setVideo(null);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((device) => device.kind === 'videoinput'));
    } catch {
      setDevices([]);
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    release();
    setStatus('idle');
    setError(null);
  }, [release]);

  const start = useCallback(async (preferredDeviceId?: string) => {
    const generation = ++generationRef.current;
    release();
    setStatus('starting');
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('Trình duyệt này không hỗ trợ truy cập camera.');
      return;
    }
    const constraints = (exact?: string): MediaStreamConstraints => ({
      audio: false,
      video: {
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 },
        ...(exact ? { deviceId: { exact } } : {}),
      },
    });
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints(preferredDeviceId));
      } catch (cause) {
        // A remembered device may be gone; fall back to the default camera once.
        if (preferredDeviceId && cause instanceof DOMException && cause.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia(constraints());
        } else {
          throw cause;
        }
      }
      if (generation !== generationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const element = createMutedVideo(stream);
      videoRef.current = element;
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (generation !== generationRef.current) return;
        release();
        setStatus('error');
        setError('Camera đã bị ngắt kết nối. Hãy kết nối lại.');
      });
      setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? preferredDeviceId ?? '');
      setVideo(element);
      setStatus('ready');
      void refreshDevices();
    } catch (cause) {
      if (generation !== generationRef.current) return;
      release();
      setStatus('error');
      setError(describeCameraError(cause));
    }
  }, [refreshDevices, release]);

  useEffect(() => {
    const media = navigator.mediaDevices;
    if (!media) return undefined;
    const onChange = () => { void refreshDevices(); };
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [refreshDevices]);

  useEffect(() => () => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    disposeVideo(videoRef.current);
    videoRef.current = null;
  }, []);

  return { status, error, video, devices, deviceId, start, stop };
}
