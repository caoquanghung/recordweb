import type { PipPosition, PipShape, PipSize, RecordingMode } from '@/types/media';

export const CANVAS_TARGET_FPS = 30;
export const CANVAS_FRAME_INTERVAL = 1000 / CANVAS_TARGET_FPS;

const PIP_MARGIN_AT_1080P = 48;

export interface Point {
  x: number;
  y: number;
}

export interface PipRect extends Point {
  width: number;
  height: number;
}

export const EMPTY_PIP_RECT: PipRect = { x: 0, y: 0, width: 0, height: 0 };

interface DrawCompositeFrameOptions {
  context: CanvasRenderingContext2D;
  screenVideo: HTMLVideoElement | null;
  cameraVideo: HTMLVideoElement | null;
  cameraEffectCanvas: HTMLCanvasElement | null;
  mode: RecordingMode;
  cameraVisible: boolean;
  pipShape: PipShape;
  pipSize: PipSize;
  pipPosition: PipPosition;
  customPosition: Point;
}

export function clampCanvasCoordinate(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function getPipDimensions(shape: PipShape, size: PipSize, canvasHeight: number) {
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
    x: clampCanvasCoordinate(x, 0, canvasWidth - dimensions.width),
    y: clampCanvasCoordinate(y, 0, canvasHeight - dimensions.height),
    width: dimensions.width,
    height: dimensions.height,
  };
}

function drawContainedSource(
  context: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement,
  targetWidth: number,
  targetHeight: number,
) {
  if (source instanceof HTMLVideoElement && source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  context.drawImage(source, (targetWidth - width) / 2, (targetHeight - height) / 2, width, height);
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

function drawPip(
  context: CanvasRenderingContext2D,
  cameraVideo: HTMLVideoElement,
  cameraEffectCanvas: HTMLCanvasElement | null,
  rect: PipRect,
  pipShape: PipShape,
) {
  const canvasScale = context.canvas.height / 1080;
  context.save();
  context.shadowColor = 'rgba(0, 0, 0, 0.45)';
  context.shadowBlur = 24 * canvasScale;
  context.shadowOffsetY = 8 * canvasScale;
  if (pipShape === 'rounded') {
    addRoundedRectPath(context, rect, 24 * canvasScale);
    context.clip();
  } else if (pipShape === 'circle' || !cameraEffectCanvas) {
    addCirclePath(context, rect);
    context.clip();
  }
  if (cameraEffectCanvas) {
    context.drawImage(cameraEffectCanvas, rect.x, rect.y, rect.width, rect.height);
  } else {
    drawCoveredVideo(context, cameraVideo, rect);
  }
  context.restore();

  if (pipShape === 'cutout') return;
  context.save();
  context.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  context.lineWidth = 3 * canvasScale;
  if (pipShape === 'rounded') addRoundedRectPath(context, rect, 24 * canvasScale);
  else addCirclePath(context, rect);
  context.stroke();
  context.restore();
}

export function drawCompositeFrame({
  context,
  screenVideo,
  cameraVideo,
  cameraEffectCanvas,
  mode,
  cameraVisible,
  pipShape,
  pipSize,
  pipPosition,
  customPosition,
}: DrawCompositeFrameOptions): PipRect | null {
  const { canvas } = context;
  context.fillStyle = '#0d1117';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (mode === 'webcam-only' && cameraVideo) {
    drawContainedSource(context, cameraEffectCanvas ?? cameraVideo, canvas.width, canvas.height);
  } else if (screenVideo) {
    drawContainedSource(context, screenVideo, canvas.width, canvas.height);
  }

  if (mode !== 'screen-pip' || !cameraVisible || !cameraVideo) return null;
  const rect = calculatePipRect(
    canvas.width,
    canvas.height,
    pipShape,
    pipSize,
    pipPosition,
    customPosition,
  );
  drawPip(context, cameraVideo, cameraEffectCanvas, rect, pipShape);
  return rect;
}

export function drawDevelopmentFps(
  context: CanvasRenderingContext2D,
  framesInWindow: number,
  elapsedMs: number,
) {
  const { canvas } = context;
  context.save();
  context.fillStyle = 'rgba(4, 8, 13, 0.7)';
  context.fillRect(14, canvas.height - 42, 104, 28);
  context.fillStyle = '#65e0af';
  context.font = `600 ${14 * (canvas.height / 1080)}px ui-monospace, monospace`;
  context.fillText(
    `${Math.round(framesInWindow * 1000 / Math.max(1, elapsedMs))} FPS`,
    24,
    canvas.height - 23,
  );
  context.restore();
}
