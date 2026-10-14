'use client';

import { useEffect, useState } from 'react';
import { createMutedVideo, disposeVideo } from '@/hooks/mediaHookUtils';
import { startVisibilityAwareFrameLoop } from '@/lib/frameScheduler';

const DEFAULT_FPS = 30;

function drawContainedFrame(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
) {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) return;

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.fillStyle = '#05070c';
  context.fillRect(0, 0, width, height);
  context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
}

/**
 * Produces a single-track canvas stream at a stable size and frame rate without
 * mutating the constraints of the shared camera or display capture track.
 */
export function useNormalizedVideoStream(
  sourceStream: MediaStream | null,
  width: number,
  height: number,
  enabled: boolean,
  fps = DEFAULT_FPS,
): MediaStream | null {
  const [outputStream, setOutputStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!enabled || !sourceStream?.getVideoTracks().length) {
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || !('captureStream' in canvas)) {
      return;
    }

    const video = createMutedVideo(sourceStream, { autoplay: false, startPlayback: false });

    const generatedStream = canvas.captureStream(fps);
    let disposed = false;
    const publishTimer = window.setTimeout(() => {
      if (!disposed) setOutputStream(generatedStream);
    }, 0);
    let lastFrameTime = performance.now();
    const frameInterval = 1000 / fps;

    const render = (now: number) => {
      if (disposed) return;
      const delta = now - lastFrameTime;
      if (delta >= frameInterval) {
        lastFrameTime = now - (delta % frameInterval);
        drawContainedFrame(context, video, width, height);
      }
    };

    void video.play().catch(() => {
      // The next user gesture that starts recording also satisfies autoplay
      // policies; the render loop remains ready in the meantime.
    });
    const stopFrameLoop = startVisibilityAwareFrameLoop(render, fps);

    return () => {
      disposed = true;
      window.clearTimeout(publishTimer);
      stopFrameLoop();
      disposeVideo(video);
      generatedStream.getTracks().forEach((track) => track.stop());
      setOutputStream((current) => current === generatedStream ? null : current);
    };
  }, [enabled, fps, height, sourceStream, width]);

  return outputStream;
}
