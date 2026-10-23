'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  createCameraCaptureOptions,
  createMicrophoneCaptureOptions,
  createScreenCaptureOptions,
  statusFromMediaError,
  stopMediaStream,
  toMediaDevicesError,
} from '@/lib/mediaCapture';
import type {
  MediaDevicesError,
  MediaSource,
  MediaSourceState,
  MediaSourceStatus,
  UseMediaDevicesResult,
} from '@/types/mediaDevices';

export type {
  MediaDevicesError,
  MediaSource,
  MediaSourceState,
  MediaSourceStatus,
  UseMediaDevicesResult,
} from '@/types/mediaDevices';
export { stopMediaStream } from '@/lib/mediaCapture';

type CaptureStream = () => Promise<MediaStream>;

interface StreamBinding {
  ref: MutableRefObject<MediaStream | null>;
  set: Dispatch<SetStateAction<MediaStream | null>>;
}

const INITIAL_STATUSES: MediaSourceState = {
  screen: 'idle',
  camera: 'idle',
  microphone: 'idle',
};

function getMediaDevices(): MediaDevices | undefined {
  return navigator.mediaDevices;
}

export function useMediaDevices(): UseMediaDevicesResult {
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [statuses, setStatuses] = useState<MediaSourceState>(INITIAL_STATUSES);
  const [error, setError] = useState<MediaDevicesError | null>(null);

  const screenRef = useRef<MediaStream | null>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);

  const updateStatus = useCallback((source: MediaSource, status: MediaSourceStatus) => {
    if (!mountedRef.current) return;
    setStatuses((current) => ({ ...current, [source]: status }));
  }, []);

  const refreshDevices = useCallback(async () => {
    const mediaDevices = getMediaDevices();
    if (!mediaDevices?.enumerateDevices) {
      if (mountedRef.current) {
        setError({
          source: 'devices',
          code: 'unsupported',
          message: 'This browser cannot enumerate cameras and microphones.',
        });
      }
      return;
    }

    try {
      const devices = await mediaDevices.enumerateDevices();
      if (!mountedRef.current) return;
      setCameras(devices.filter((device) => device.kind === 'videoinput'));
      setMicrophones(devices.filter((device) => device.kind === 'audioinput'));
    } catch (cause) {
      if (mountedRef.current) setError(toMediaDevicesError('devices', cause));
    }
  }, []);

  const replaceStream = useCallback((
    source: MediaSource,
    nextStream: MediaStream,
    binding: StreamBinding,
  ) => {
    if (!mountedRef.current) {
      stopMediaStream(nextStream);
      return;
    }

    const previousStream = binding.ref.current;
    binding.ref.current = nextStream;

    nextStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (binding.ref.current !== nextStream) return;
        binding.ref.current = null;
        stopMediaStream(nextStream);
        if (!mountedRef.current) return;
        binding.set(null);
        updateStatus(source, 'ended');
      };
    });

    binding.set(nextStream);
    updateStatus(source, 'ready');
    setError(null);
    stopMediaStream(previousStream);
    void refreshDevices();
  }, [refreshDevices, updateStatus]);

  const stopOwnedStream = useCallback((source: MediaSource, binding: StreamBinding) => {
    const stream = binding.ref.current;
    binding.ref.current = null;
    stopMediaStream(stream);
    if (!mountedRef.current) return;
    binding.set(null);
    updateStatus(source, 'idle');
  }, [updateStatus]);

  const acquireStream = useCallback(async (
    source: MediaSource,
    capture: CaptureStream | null,
    binding: StreamBinding,
  ) => {
    if (!capture) {
      const unsupportedError = toMediaDevicesError(source, new DOMException('', 'TypeError'));
      if (mountedRef.current) {
        setError(unsupportedError);
        updateStatus(source, 'unsupported');
      }
      return null;
    }

    updateStatus(source, 'requesting');
    try {
      const stream = await capture();
      replaceStream(source, stream, binding);
      return stream;
    } catch (cause) {
      const captureError = toMediaDevicesError(source, cause);
      if (mountedRef.current) {
        setError(captureError);
        updateStatus(source, binding.ref.current ? 'ready' : statusFromMediaError(captureError));
      }
      return null;
    }
  }, [replaceStream, updateStatus]);

  const acquireScreen = useCallback(() => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getDisplayMedia
      ? () => mediaDevices.getDisplayMedia(createScreenCaptureOptions())
      : null;
    return acquireStream('screen', capture, { ref: screenRef, set: setScreenStream });
  }, [acquireStream]);

  const acquireCamera = useCallback((deviceId?: string) => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getUserMedia
      ? () => mediaDevices.getUserMedia(createCameraCaptureOptions(deviceId))
      : null;
    return acquireStream('camera', capture, { ref: cameraRef, set: setCameraStream });
  }, [acquireStream]);

  const acquireMicrophone = useCallback((deviceId?: string) => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getUserMedia
      ? () => mediaDevices.getUserMedia(createMicrophoneCaptureOptions(deviceId))
      : null;
    return acquireStream('microphone', capture, { ref: microphoneRef, set: setMicrophoneStream });
  }, [acquireStream]);

  const stopScreen = useCallback(() => {
    stopOwnedStream('screen', { ref: screenRef, set: setScreenStream });
  }, [stopOwnedStream]);

  const stopCamera = useCallback(() => {
    stopOwnedStream('camera', { ref: cameraRef, set: setCameraStream });
  }, [stopOwnedStream]);

  const stopMicrophone = useCallback(() => {
    stopOwnedStream('microphone', { ref: microphoneRef, set: setMicrophoneStream });
  }, [stopOwnedStream]);

  const stopAll = useCallback(() => {
    stopScreen();
    stopCamera();
    stopMicrophone();
  }, [stopCamera, stopMicrophone, stopScreen]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mountedRef.current = true;
    const mediaDevices = getMediaDevices();
    const handleDeviceChange = () => void refreshDevices();
    const initialRefresh = window.setTimeout(() => void refreshDevices(), 0);
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialRefresh);
      mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stopMediaStream(screenRef.current);
      stopMediaStream(cameraRef.current);
      stopMediaStream(microphoneRef.current);
      screenRef.current = null;
      cameraRef.current = null;
      microphoneRef.current = null;
    };
  }, [refreshDevices]);

  const systemAudioStream = useMemo(() => {
    const tracks = screenStream?.getAudioTracks() ?? [];
    return tracks.length > 0 ? new MediaStream(tracks) : null;
  }, [screenStream]);

  return {
    screenStream,
    cameraStream,
    microphoneStream,
    systemAudioStream,
    cameras,
    microphones,
    statuses,
    error,
    hasSystemAudio: Boolean(systemAudioStream),
    refreshDevices,
    acquireScreen,
    acquireCamera,
    acquireMicrophone,
    stopScreen,
    stopCamera,
    stopMicrophone,
    stopAll,
    clearError,
  };
}
