export function getErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

interface CreateMutedVideoOptions {
  autoplay?: boolean;
  startPlayback?: boolean;
}

export function createMutedVideo(
  stream: MediaStream,
  { autoplay = true, startPlayback = true }: CreateMutedVideoOptions = {},
): HTMLVideoElement {
  const video = document.createElement('video');
  video.autoplay = autoplay;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  if (startPlayback) void video.play().catch(() => undefined);
  return video;
}

export function disposeVideo(video: HTMLVideoElement | null): void {
  video?.pause();
  if (video) video.srcObject = null;
}

export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D | null } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext('2d') };
}
