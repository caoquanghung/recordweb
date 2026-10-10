'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { PipPosition, PipShape, PipSize, RecordingMode } from '@/types/media';

const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
const PIP_MARGIN_AT_1080P = 48;

interface Point {
  x: number;
  y: number;
}

export interface PipRect extends Point {
  width: number;
  height: number;
}

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

const EMPTY_RECT: PipRect = { x: 0, y: 0, width: 0, height: 0 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function getPipDimensions(shape: PipShape, size: PipSize, canvasHeight: number) {
  const scale = canvasHeight / 1080;
  const width = ({ small: 160, medium: 240, large: 320 } as const)[size] * scale;
  return {
    width,
    height: shape === 'circle' || shape === 'cutout' ? width : width * 9 / 16,
  };
}

export function calculatePipRect(
  canvasWidth: number,
  canvasHeight: number,
  shape: PipShape,
  size: PipSize,
  position: PipPosition,
  customPosition: Point,
): PipRect {
  const dimensions = getPipDimensions(shape, size, canvasHeight);
  const margin = PIP_MARGIN_AT_1080P * (canvasHeight / 1080);
  let x = margin;
  let y = margin;

  if (position === 'top-right' || position === 'bottom-right') {
    x = canvasWidth - dimensions.width - margin;
  }
  if (position === 'bottom-left' || position === 'bottom-right') {
    y = canvasHeight - dimensions.height - margin;
  }
  if (position === 'custom') {
    x = customPosition.x;
    y = customPosition.y;
  }

  return {
    x: clamp(x, 0, canvasWidth - dimensions.width),
    y: clamp(y, 0, canvasHeight - dimensions.height),
    width: dimensions.width,
    height: dimensions.height,
  };
}

function drawContainedVideo(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  targetWidth: number,
  targetHeight: number,
) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
  const scale = Math.min(targetWidth / video.videoWidth, targetHeight / video.videoHeight);
  const width = video.videoWidth * scale;
  const height = video.videoHeight * scale;
  context.drawImage(video, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
}

function drawCoveredVideo(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  rect: PipRect,
) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return;
  const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
  const sourceWidth = rect.width / scale;
  const sourceHeight = rect.height / scale;
  const sourceX = (video.videoWidth - sourceWidth) / 2;
  const sourceY = (video.videoHeight - sourceHeight) / 2;
  context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, rect.x, rect.y, rect.width, rect.height);
}

function addRoundedRectPath(context: CanvasRenderingContext2D, rect: PipRect, radius: number) {
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
}

function addCirclePath(context: CanvasRenderingContext2D, rect: PipRect) {
  context.beginPath();
  context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width / 2, 0, Math.PI * 2);
}

function pointFromPointer(event: PointerEvent<HTMLCanvasElement>) {
  const canvas = event.currentTarget;
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
}

function createSourceVideo(stream: MediaStream | null) {
  if (!stream) return null;
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  return video;
}

export function useCanvasCompositor({
  screenStream,
  cameraStream,
  mode,
  resolution,
  pipShape,
  pipSize,
  cameraVisible,
  paused = false,
  initialPipPosition = 'bottom-right',
}: UseCanvasCompositorOptions): UseCanvasCompositorResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const outputStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pipRectRef = useRef<PipRect>(EMPTY_RECT);
  const customPositionRef = useRef<Point>({ x: 0, y: 0 });
  const dragOffsetRef = useRef<Point | null>(null);
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);
  const [fps, setFps] = useState(0);
  const [pipPosition, setPipPositionState] = useState<PipPosition>(initialPipPosition);
  const [pipRect, setPipRect] = useState<PipRect>(EMPTY_RECT);

  const hasScreen = Boolean(screenStream?.getVideoTracks().length);
  const hasCamera = Boolean(cameraStream?.getVideoTracks().length);
  const needsScreen = mode !== 'webcam-only';
  const needsCamera = mode !== 'screen-only' && cameraVisible;
  const isRendering = !paused && ((needsScreen && hasScreen) || (needsCamera && hasCamera));
  const warning = pipShape === 'cutout' && needsCamera && hasCamera
    ? 'Cutout masking starts in Phase 4; the compositor is using a circular fallback.'
    : null;

  useEffect(() => {
    const video = createSourceVideo(screenStream);
    screenVideoRef.current = video;
    return () => {
      video?.pause();
      if (video) video.srcObject = null;
      if (screenVideoRef.current === video) screenVideoRef.current = null;
    };
  }, [screenStream]);

  useEffect(() => {
    const video = createSourceVideo(cameraStream);
    cameraVideoRef.current = video;
    return () => {
      video?.pause();
      if (video) video.srcObject = null;
      if (cameraVideoRef.current === video) cameraVideoRef.current = null;
    };
  }, [cameraStream]);

  useEffect(() => {
    const initializeCanvas = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas || !('captureStream' in canvas)) return;
      canvas.width = resolution.width;
      canvas.height = resolution.height;
      const stream = canvas.captureStream(TARGET_FPS);
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
      if (delta >= FRAME_INTERVAL) {
        lastFrameTime = currentTime - (delta % FRAME_INTERVAL);
        context.fillStyle = '#0d1117';
        context.fillRect(0, 0, canvas.width, canvas.height);

        const screenVideo = screenVideoRef.current;
        const cameraVideo = cameraVideoRef.current;

        if (mode === 'webcam-only' && cameraVideo) {
          drawContainedVideo(context, cameraVideo, canvas.width, canvas.height);
        } else if (screenVideo) {
          drawContainedVideo(context, screenVideo, canvas.width, canvas.height);
        }

        if (mode === 'screen-pip' && cameraVisible && cameraVideo) {
          const rect = calculatePipRect(
            canvas.width,
            canvas.height,
            pipShape,
            pipSize,
            pipPosition,
            customPositionRef.current,
          );
          pipRectRef.current = rect;

          context.save();
          context.shadowColor = 'rgba(0, 0, 0, 0.45)';
          context.shadowBlur = 24 * (canvas.height / 1080);
          context.shadowOffsetY = 8 * (canvas.height / 1080);
          if (pipShape === 'rounded') addRoundedRectPath(context, rect, 24 * (canvas.height / 1080));
          else addCirclePath(context, rect);
          context.clip();
          drawCoveredVideo(context, cameraVideo, rect);
          context.restore();

          context.save();
          context.strokeStyle = 'rgba(255, 255, 255, 0.82)';
          context.lineWidth = 3 * (canvas.height / 1080);
          if (pipShape === 'rounded') addRoundedRectPath(context, rect, 24 * (canvas.height / 1080));
          else addCirclePath(context, rect);
          context.stroke();
          context.restore();

          const rectKey = `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`;
          if (rectKey !== lastPublishedRect) {
            lastPublishedRect = rectKey;
            setPipRect(rect);
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
          context.save();
          context.fillStyle = 'rgba(4, 8, 13, 0.7)';
          context.fillRect(14, canvas.height - 42, 104, 28);
          context.fillStyle = '#65e0af';
          context.font = `600 ${14 * (canvas.height / 1080)}px ui-monospace, monospace`;
          context.fillText(`${Math.round(framesInWindow * 1000 / Math.max(1, currentTime - fpsWindowStart))} FPS`, 24, canvas.height - 23);
          context.restore();
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animationFrameRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [cameraVisible, isRendering, mode, paused, pipPosition, pipShape, pipSize, resolution.height, resolution.width]);

  const setPipPosition = useCallback((position: Exclude<PipPosition, 'custom'>) => {
    setPipPositionState(position);
  }, []);

  const setCustomPosition = useCallback((point: Point) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dimensions = getPipDimensions(pipShape, pipSize, canvas.height);
    customPositionRef.current = {
      x: clamp(point.x, 0, canvas.width - dimensions.width),
      y: clamp(point.y, 0, canvas.height - dimensions.height),
    };
    setPipPositionState('custom');
  }, [pipShape, pipSize]);

  const nudgePip = useCallback((deltaX: number, deltaY: number) => {
    const current = pipRectRef.current;
    setCustomPosition({ x: current.x + deltaX, y: current.y + deltaY });
  }, [setCustomPosition]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'screen-pip' || !cameraVisible || !hasCamera) return;
    const point = pointFromPointer(event);
    const rect = pipRectRef.current;
    const inside = point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height;
    if (!inside) return;
    dragOffsetRef.current = { x: point.x - rect.x, y: point.y - rect.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [cameraVisible, hasCamera, mode]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const offset = dragOffsetRef.current;
    if (!offset) return;
    const point = pointFromPointer(event);
    setCustomPosition({ x: point.x - offset.x, y: point.y - offset.y });
  }, [setCustomPosition]);

  const finishPointerDrag = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    dragOffsetRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const movement = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    nudgePip(movement[0], movement[1]);
  }, [nudgePip]);

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
    canvasPointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointerDrag,
      onPointerCancel: finishPointerDrag,
      onKeyDown,
    },
  };
}
