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
  adoptScreenStream: (stream: MediaStream) => void;
  acquireScreen: () => Promise<MediaStream | null>;
  acquireCamera: (deviceId?: string) => Promise<MediaStream | null>;
  acquireMicrophone: (deviceId?: string) => Promise<MediaStream | null>;
  stopScreen: () => void;
  stopCamera: () => void;
  stopMicrophone: () => void;
  stopAll: () => void;
  clearError: () => void;
}

type MediaDevicesErrorSource = MediaSource | 'devices';
type StreamRef = MutableRefObject<MediaStream | null>;
type StreamSetter = Dispatch<SetStateAction<MediaStream | null>>;
type CaptureStream = () => Promise<MediaStream>;

const INITIAL_STATUSES: MediaSourceState = {
  screen: 'idle',
  camera: 'idle',
  microphone: 'idle',
};

function createStandardVideoConstraints(): MediaTrackConstraints {
  return {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function createScreenCaptureOptions(): DisplayMediaStreamOptions {
  return {
    video: createStandardVideoConstraints(),
    audio: true,
  };
}

function createCameraCaptureOptions(deviceId?: string): MediaStreamConstraints {
  return {
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      ...createStandardVideoConstraints(),
    },
    audio: false,
  };
}

function createMicrophoneCaptureOptions(deviceId?: string): MediaStreamConstraints {
  return {
    video: false,
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
    },
  };
}

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

function toMediaDevicesError(source: MediaDevicesErrorSource, cause: unknown): MediaDevicesError {
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

function getMediaDevices(): MediaDevices | undefined {
  return navigator.mediaDevices;
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
    streamRef: StreamRef,
    setStream: StreamSetter,
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
    streamRef: StreamRef,
    setStream: StreamSetter,
  ) => {
    const stream = streamRef.current;
    streamRef.current = null;
    stopMediaStream(stream);
    if (mountedRef.current) {
      setStream(null);
      updateStatus(source, 'idle');
    }
  }, [updateStatus]);

  const acquireStream = useCallback(async (
    source: MediaSource,
    capture: CaptureStream | null,
    streamRef: StreamRef,
    setStream: StreamSetter,
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
      replaceStream(source, stream, streamRef, setStream);
      return stream;
    } catch (cause) {
      const captureError = toMediaDevicesError(source, cause);
      if (mountedRef.current) {
        setError(captureError);
        updateStatus(source, streamRef.current ? 'ready' : statusFromError(captureError));
      }
      return null;
    }
  }, [replaceStream, updateStatus]);

  const acquireScreen = useCallback(async () => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getDisplayMedia
      ? () => mediaDevices.getDisplayMedia(createScreenCaptureOptions())
      : null;

    return acquireStream('screen', capture, screenRef, setScreenStream);
  }, [acquireStream]);

  const adoptScreenStream = useCallback((stream: MediaStream) => {
    replaceStream('screen', stream, screenRef, setScreenStream);
  }, [replaceStream]);

  const acquireCamera = useCallback(async (deviceId?: string) => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getUserMedia
      ? () => mediaDevices.getUserMedia(createCameraCaptureOptions(deviceId))
      : null;

    return acquireStream('camera', capture, cameraRef, setCameraStream);
  }, [acquireStream]);

  const acquireMicrophone = useCallback(async (deviceId?: string) => {
    const mediaDevices = getMediaDevices();
    const capture = mediaDevices?.getUserMedia
      ? () => mediaDevices.getUserMedia(createMicrophoneCaptureOptions(deviceId))
      : null;

    return acquireStream('microphone', capture, microphoneRef, setMicrophoneStream);
  }, [acquireStream]);

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

  const clearError = useCallback(() => {
    setError(null);
  }, []);

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
    adoptScreenStream,
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
