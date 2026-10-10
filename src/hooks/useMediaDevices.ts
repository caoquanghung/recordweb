'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export type MediaSource = 'screen' | 'camera' | 'microphone';
export type MediaSourceStatus =
  | 'idle'
  | 'requesting'
  | 'ready'
  | 'denied'
  | 'ended'
  | 'unsupported'
  | 'error';

export interface MediaDevicesError {
  source: MediaSource | 'devices';
  code:
    | 'permission-denied'
    | 'device-not-found'
    | 'device-busy'
    | 'constraints-unavailable'
    | 'unsupported'
    | 'unknown';
  message: string;
  cause?: unknown;
}

export interface MediaSourceState {
  screen: MediaSourceStatus;
  camera: MediaSourceStatus;
  microphone: MediaSourceStatus;
}

export interface UseMediaDevicesResult {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  microphoneStream: MediaStream | null;
  systemAudioStream: MediaStream | null;
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  statuses: MediaSourceState;
  error: MediaDevicesError | null;
  hasSystemAudio: boolean;
  refreshDevices: () => Promise<void>;
  acquireScreen: () => Promise<MediaStream | null>;
  acquireCamera: (deviceId?: string) => Promise<MediaStream | null>;
  acquireMicrophone: (deviceId?: string) => Promise<MediaStream | null>;
  stopScreen: () => void;
  stopCamera: () => void;
  stopMicrophone: () => void;
  stopAll: () => void;
  clearError: () => void;
}

const INITIAL_STATUSES: MediaSourceState = {
  screen: 'idle',
  camera: 'idle',
  microphone: 'idle',
};

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

function toMediaDevicesError(source: MediaSource | 'devices', cause: unknown): MediaDevicesError {
  const name = cause instanceof DOMException ? cause.name : '';

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      source,
      code: 'permission-denied',
      message: source === 'screen'
        ? 'Screen sharing was cancelled or blocked.'
        : `${source === 'camera' ? 'Camera' : 'Microphone'} permission was denied. Check your browser and system privacy settings.`,
      cause,
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      source,
      code: 'device-not-found',
      message: `No available ${source === 'devices' ? 'media devices' : source} could be found.`,
      cause,
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return {
      source,
      code: 'device-busy',
      message: `The ${source} is already in use or could not be started. Close other apps using it and try again.`,
      cause,
    };
  }

  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      source,
      code: 'constraints-unavailable',
      message: `The selected ${source} does not support the requested recording settings.`,
      cause,
    };
  }

  if (name === 'TypeError') {
    return {
      source,
      code: 'unsupported',
      message: 'Media capture is unavailable. Use a supported browser over HTTPS or localhost.',
      cause,
    };
  }

  return {
    source,
    code: 'unknown',
    message: `The ${source} could not be started. Try again or choose another device.`,
    cause,
  };
}

function statusFromError(error: MediaDevicesError): MediaSourceStatus {
  if (error.code === 'permission-denied') return 'denied';
  if (error.code === 'unsupported') return 'unsupported';
  return 'error';
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
    if (!navigator.mediaDevices?.enumerateDevices) {
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
      const devices = await navigator.mediaDevices.enumerateDevices();
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
    streamRef: MutableRefObject<MediaStream | null>,
    setStream: Dispatch<SetStateAction<MediaStream | null>>,
  ) => {
    if (!mountedRef.current) {
      stopMediaStream(nextStream);
      return;
    }

    const previousStream = streamRef.current;
    streamRef.current = nextStream;

    nextStream.getTracks().forEach((track) => {
      track.onended = () => {
        if (streamRef.current !== nextStream) return;
        streamRef.current = null;
        stopMediaStream(nextStream);
        if (!mountedRef.current) return;
        setStream(null);
        updateStatus(source, 'ended');
      };
    });

    setStream(nextStream);
    updateStatus(source, 'ready');
    setError(null);
    stopMediaStream(previousStream);
    void refreshDevices();
  }, [refreshDevices, updateStatus]);

  const stopOwnedStream = useCallback((
    source: MediaSource,
    streamRef: MutableRefObject<MediaStream | null>,
    setStream: Dispatch<SetStateAction<MediaStream | null>>,
  ) => {
    const stream = streamRef.current;
    streamRef.current = null;
    stopMediaStream(stream);
    if (mountedRef.current) {
      setStream(null);
      updateStatus(source, 'idle');
    }
  }, [updateStatus]);

  const acquireScreen = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const unsupportedError = toMediaDevicesError('screen', new DOMException('', 'TypeError'));
      if (mountedRef.current) {
        setError(unsupportedError);
        updateStatus('screen', 'unsupported');
      }
      return null;
    }

    updateStatus('screen', 'requesting');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: true,
      });
      replaceStream('screen', stream, screenRef, setScreenStream);
      return stream;
    } catch (cause) {
      const captureError = toMediaDevicesError('screen', cause);
      if (mountedRef.current) {
        setError(captureError);
        updateStatus('screen', screenRef.current ? 'ready' : statusFromError(captureError));
      }
      return null;
    }
  }, [replaceStream, updateStatus]);

  const acquireCamera = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupportedError = toMediaDevicesError('camera', new DOMException('', 'TypeError'));
      if (mountedRef.current) {
        setError(unsupportedError);
        updateStatus('camera', 'unsupported');
      }
      return null;
    }

    updateStatus('camera', 'requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      replaceStream('camera', stream, cameraRef, setCameraStream);
      return stream;
    } catch (cause) {
      const captureError = toMediaDevicesError('camera', cause);
      if (mountedRef.current) {
        setError(captureError);
        updateStatus('camera', cameraRef.current ? 'ready' : statusFromError(captureError));
      }
      return null;
    }
  }, [replaceStream, updateStatus]);

  const acquireMicrophone = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupportedError = toMediaDevicesError('microphone', new DOMException('', 'TypeError'));
      if (mountedRef.current) {
        setError(unsupportedError);
        updateStatus('microphone', 'unsupported');
      }
      return null;
    }

    updateStatus('microphone', 'requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
        },
      });
      replaceStream('microphone', stream, microphoneRef, setMicrophoneStream);
      return stream;
    } catch (cause) {
      const captureError = toMediaDevicesError('microphone', cause);
      if (mountedRef.current) {
        setError(captureError);
        updateStatus('microphone', microphoneRef.current ? 'ready' : statusFromError(captureError));
      }
      return null;
    }
  }, [replaceStream, updateStatus]);

  const stopScreen = useCallback(() => {
    stopOwnedStream('screen', screenRef, setScreenStream);
  }, [stopOwnedStream]);

  const stopCamera = useCallback(() => {
    stopOwnedStream('camera', cameraRef, setCameraStream);
  }, [stopOwnedStream]);

  const stopMicrophone = useCallback(() => {
    stopOwnedStream('microphone', microphoneRef, setMicrophoneStream);
  }, [stopOwnedStream]);

  const stopAll = useCallback(() => {
    stopScreen();
    stopCamera();
    stopMicrophone();
  }, [stopCamera, stopMicrophone, stopScreen]);

  useEffect(() => {
    mountedRef.current = true;
    const mediaDevices = navigator.mediaDevices;
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
    clearError: () => setError(null),
  };
}
