import type {
  MediaDevicesError,
  MediaSource,
  MediaSourceStatus,
} from '@/types/mediaDevices';

type MediaDevicesErrorSource = MediaSource | 'devices';

interface RecordWebDisplayMediaOptions extends DisplayMediaStreamOptions {
  controller?: RecordWebCaptureController;
  monitorTypeSurfaces?: 'include' | 'exclude';
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
}

interface RecordWebCaptureController {
  setFocusBehavior: (behavior: 'focus-capturing-application' | 'no-focus-change') => void;
}

interface RecordWebCaptureControllerConstructor {
  new(): RecordWebCaptureController;
}

function createStandardVideoConstraints(): MediaTrackConstraints {
  return {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 },
  };
}

function createCaptureController(): RecordWebCaptureController | null {
  const CaptureControllerConstructor = (globalThis as typeof globalThis & {
    CaptureController?: RecordWebCaptureControllerConstructor;
  }).CaptureController;
  if (!CaptureControllerConstructor) return null;

  try {
    const controller = new CaptureControllerConstructor();
    try {
      controller.setFocusBehavior('focus-capturing-application');
    } catch {
      controller.setFocusBehavior('no-focus-change');
    }
    return controller;
  } catch {
    return null;
  }
}

export function createScreenCaptureOptions(): RecordWebDisplayMediaOptions {
  const controller = createCaptureController();
  return {
    video: {
      ...createStandardVideoConstraints(),
      displaySurface: 'browser',
    },
    audio: true,
    monitorTypeSurfaces: 'exclude',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'exclude',
    ...(controller ? { controller } : {}),
  };
}

export function createCameraCaptureOptions(deviceId?: string): MediaStreamConstraints {
  return {
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      ...createStandardVideoConstraints(),
    },
    audio: false,
  };
}

export function createMicrophoneCaptureOptions(deviceId?: string): MediaStreamConstraints {
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

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

export function toMediaDevicesError(
  source: MediaDevicesErrorSource,
  cause: unknown,
): MediaDevicesError {
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

export function statusFromMediaError(error: MediaDevicesError): MediaSourceStatus {
  if (error.code === 'permission-denied') return 'denied';
  if (error.code === 'unsupported') return 'unsupported';
  return 'error';
}
