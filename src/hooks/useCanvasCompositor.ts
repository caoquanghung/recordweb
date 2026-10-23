'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { createMutedVideo, disposeVideo } from '@/hooks/mediaHookUtils';
import { usePipPlacement } from '@/hooks/usePipPlacement';
import {
  CANVAS_FRAME_INTERVAL,
  CANVAS_TARGET_FPS,
  drawCompositeFrame,
  drawDevelopmentFps,
  type PipRect,
} from '@/lib/canvasCompositorRenderer';
import { startVisibilityAwareFrameLoop } from '@/lib/frameScheduler';
import type { PipPosition, PipShape, PipSize, RecordingMode } from '@/types/media';

export { calculatePipRect } from '@/lib/canvasCompositorRenderer';
export type { PipRect } from '@/lib/canvasCompositorRenderer';

export interface CanvasResolution {
  width: number;
  height: number;
}

export interface UseCanvasCompositorOptions {
  screenStream: MediaStream | null;
  cameraStream: MediaStream | null;
  mode: RecordingMode;
  resolution: CanvasResolution;
  pipShape: PipShape;
  pipSize: PipSize;
  cameraVisible: boolean;
  cameraEffectCanvas?: HTMLCanvasElement | null;
  paused?: boolean;
  initialPipPosition?: PipPosition;
}

export interface UseCanvasCompositorResult {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  outputStream: MediaStream | null;
  fps: number;
  isRendering: boolean;
  pipPosition: PipPosition;
  pipRect: PipRect;
  warning: string | null;
  setPipPosition: (position: Exclude<PipPosition, 'custom'>) => void;
  nudgePip: (deltaX: number, deltaY: number) => void;
  canvasPointerHandlers: {
    onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => void;
    onPointerCancel: (event: PointerEvent<HTMLCanvasElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLCanvasElement>) => void;
  };
}

function createSourceVideo(stream: MediaStream | null): HTMLVideoElement | null {
  return stream ? createMutedVideo(stream) : null;
}

function releaseSourceVideo(video: HTMLVideoElement | null) {
  disposeVideo(video);
}

export function useCanvasCompositor({
  screenStream,
  cameraStream,
  mode,
  resolution,
  pipShape,
  pipSize,
  cameraVisible,
  cameraEffectCanvas = null,
  paused = false,
  initialPipPosition = 'bottom-right',
}: UseCanvasCompositorOptions): UseCanvasCompositorResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [fps, setFps] = useState(0);

  const hasScreen = Boolean(screenStream?.getVideoTracks().length);
  const hasCamera = Boolean(cameraStream?.getVideoTracks().length);
  const needsScreen = mode !== 'webcam-only';
  const needsCamera = mode !== 'screen-only' && cameraVisible;
  const isRendering = !paused && ((needsScreen && hasScreen) || (needsCamera && hasCamera));
  const warning = pipShape === 'cutout' && needsCamera && hasCamera && !cameraEffectCanvas
    ? 'Cutout is loading; using the camera fallback.'
    : null;
  const {
    pipPosition,
    pipRect,
    customPositionRef,
    publishRenderedRect,
    setPipPosition,
    nudgePip,
    canvasPointerHandlers,
  } = usePipPlacement({
    canvasRef,
    mode,
    cameraVisible,
    hasCamera,
    pipShape,
    pipSize,
    initialPosition: initialPipPosition,
  });

  useEffect(() => {
    const video = createSourceVideo(screenStream);
    screenVideoRef.current = video;
    return () => {
      releaseSourceVideo(video);
      if (screenVideoRef.current === video) screenVideoRef.current = null;
    };
  }, [screenStream]);

  useEffect(() => {
    const video = createSourceVideo(cameraStream);
    cameraVideoRef.current = video;
    return () => {
      releaseSourceVideo(video);
      if (cameraVideoRef.current === video) cameraVideoRef.current = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    const initializeCanvas = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas || !('captureStream' in canvas)) return;
      canvas.width = resolution.width;
      canvas.height = resolution.height;
      const stream = canvas.captureStream(CANVAS_TARGET_FPS);
      outputStreamRef.current = stream;
      setOutputStream(stream);
    }, 0);

    return () => {
      window.clearTimeout(initializeCanvas);
      outputStreamRef.current?.getTracks().forEach((track) => track.stop());
      outputStreamRef.current = null;
    };
  }, [hasCamera, hasScreen, resolution.height, resolution.width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !context) return;

    canvas.width = resolution.width;
    canvas.height = resolution.height;
    context.fillStyle = '#0d1117';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!isRendering) {
      return;
    }

    let lastFrameTime = performance.now();
    let fpsWindowStart = lastFrameTime;
    let framesInWindow = 0;
    let lastPublishedRect = '';

    const renderFrame = (currentTime: number) => {
      const delta = currentTime - lastFrameTime;
      if (delta >= CANVAS_FRAME_INTERVAL) {
        lastFrameTime = currentTime - (delta % CANVAS_FRAME_INTERVAL);
        const rect = drawCompositeFrame({
          context,
          screenVideo: screenVideoRef.current,
          cameraVideo: cameraVideoRef.current,
          cameraEffectCanvas,
          mode,
          cameraVisible,
          pipShape,
          pipSize,
          pipPosition,
          customPosition: customPositionRef.current,
        });
        if (rect) {
          const rectKey = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
          if (rectKey !== lastPublishedRect) {
            lastPublishedRect = rectKey;
            publishRenderedRect(rect);
          }
        }

        framesInWindow += 1;
        if (currentTime - fpsWindowStart >= 1000) {
          const measuredFps = framesInWindow * 1000 / (currentTime - fpsWindowStart);
          setFps(Math.round(measuredFps));
          fpsWindowStart = currentTime;
          framesInWindow = 0;
        }

        if (process.env.NODE_ENV === 'development') {
          drawDevelopmentFps(context, framesInWindow, currentTime - fpsWindowStart);
        }
      }
    };

    return startVisibilityAwareFrameLoop(renderFrame, CANVAS_TARGET_FPS);
  }, [cameraEffectCanvas, cameraVisible, customPositionRef, isRendering, mode, paused, pipPosition, pipShape, pipSize, publishRenderedRect, resolution.height, resolution.width]);

  return {
    canvasRef,
    outputStream,
    fps,
    isRendering,
    pipPosition,
    pipRect,
    warning,
    setPipPosition,
    nudgePip,
    canvasPointerHandlers,
  };
}
