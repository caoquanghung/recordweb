'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/hooks/mediaHookUtils';
import type {
  PresentationCaptureStatus,
  PresentationTabCapture,
} from '@/types/presentation';

const CAPTURE_HANDLE = 'recordweb-presentation-v1';

interface PresentationAudioConstraints extends MediaTrackConstraints {
  suppressLocalAudioPlayback?: boolean;
}

type ExtendedDisplayMediaOptions = Omit<DisplayMediaStreamOptions, 'audio'> & {
  audio?: boolean | PresentationAudioConstraints;
  preferCurrentTab?: boolean;
  selfBrowserSurface?: 'include' | 'exclude';
  surfaceSwitching?: 'include' | 'exclude';
  monitorTypeSurfaces?: 'include' | 'exclude';
};

interface CaptureHandle {
  handle: string;
  origin: string;
}

interface CapturedVideoTrack extends MediaStreamTrack {
  getCaptureHandle?: () => CaptureHandle | null;
  restrictTo?: (target: unknown) => Promise<void>;
}

interface ExtendedMediaDevices extends MediaDevices {
  setCaptureHandleConfig?: (configuration: {
    exposeOrigin: boolean;
    handle: string;
    permittedOrigins: string[];
  }) => void;
}

interface RestrictionTargetApi {
  fromElement: (element: Element) => Promise<unknown>;
}

declare global {
  var RestrictionTarget: RestrictionTargetApi | undefined;
}

export interface UsePresentationTabCaptureResult {
  status: PresentationCaptureStatus;
  capture: PresentationTabCapture | null;
  warning: string | null;
  error: string | null;
  start: (presentationElement?: HTMLElement | null) => Promise<PresentationTabCapture | null>;
  stop: () => void;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.onended = null;
    track.stop();
  });
}

export function usePresentationTabCapture(): UsePresentationTabCaptureResult {
  const streamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<PresentationCaptureStatus>('idle');
  const [capture, setCapture] = useState<PresentationTabCapture | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    stopStream(stream);
    if (!mountedRef.current) return;
    setCapture(null);
    setStatus('ended');
  }, []);

  const start = useCallback(async (presentationElement?: HTMLElement | null) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
      const message = 'Current-tab capture requires HTTPS or localhost in a supported browser.';
      setError(message);
      setStatus('error');
      return null;
    }

    stopStream(streamRef.current);
    streamRef.current = null;
    setCapture(null);
    setStatus('requesting');
    setWarning(null);
    setError(null);

    try {
      const mediaDevices = navigator.mediaDevices as ExtendedMediaDevices;
      mediaDevices.setCaptureHandleConfig?.({
        exposeOrigin: true,
        handle: CAPTURE_HANDLE,
        permittedOrigins: [window.location.origin],
      });

      const options: ExtendedDisplayMediaOptions = {
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 30, max: 30 },
        },
        audio: { suppressLocalAudioPlayback: false },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        monitorTypeSurfaces: 'exclude',
      };
      const stream = await mediaDevices.getDisplayMedia(options);
      const videoTrack = stream.getVideoTracks()[0] as CapturedVideoTrack | undefined;
      if (!videoTrack) {
        stopStream(stream);
        throw new Error('The selected source did not provide a video track.');
      }

      const settings = videoTrack.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'browser') {
        stopStream(stream);
        throw new Error('Select “This Tab” so RecordWeb can capture the presentation safely.');
      }

      const captureHandle = videoTrack.getCaptureHandle?.();
      if (captureHandle && captureHandle.handle !== CAPTURE_HANDLE) {
        stopStream(stream);
        throw new Error('The selected browser tab is not the active RecordWeb presentation tab.');
      }

      let scope: PresentationTabCapture['scope'] = 'tab';
      if (presentationElement && globalThis.RestrictionTarget && videoTrack.restrictTo) {
        try {
          const restrictionTarget = await globalThis.RestrictionTarget.fromElement(presentationElement);
          await videoTrack.restrictTo(restrictionTarget);
          scope = 'element';
        } catch (cause) {
          stopStream(stream);
          const detail = getErrorMessage(cause, 'Unknown restriction error.');
          throw new Error(`Could not isolate the presentation area. Confirm that “This Tab” was selected. ${detail}`);
        }
      } else {
        setWarning('Element Capture is unavailable; the full tab will be recorded in clean presenter mode.');
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setWarning('The presentation tab has no captured audio. Microphone audio can still be recorded.');
      }

      const nextCapture: PresentationTabCapture = {
        stream,
        videoStream: new MediaStream([videoTrack]),
        audioStream: audioTracks.length > 0 ? new MediaStream(audioTracks) : null,
        scope,
        width: settings.width ?? null,
        height: settings.height ?? null,
      };
      streamRef.current = stream;
      videoTrack.onended = () => {
        if (streamRef.current !== stream) return;
        streamRef.current = null;
        stream.getAudioTracks().forEach((track) => track.stop());
        if (!mountedRef.current) return;
        setCapture(null);
        setStatus('ended');
      };
      if (!mountedRef.current) {
        stopStream(stream);
        return null;
      }
      setCapture(nextCapture);
      setStatus('capturing');
      return nextCapture;
    } catch (cause) {
      if (!mountedRef.current) return null;
      setCapture(null);
      setStatus('error');
      setError(getErrorMessage(cause, 'Could not capture the current presentation tab.'));
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const stream = streamRef.current;
      streamRef.current = null;
      stopStream(stream);
    };
  }, []);

  return { status, capture, warning, error, start, stop };
}

