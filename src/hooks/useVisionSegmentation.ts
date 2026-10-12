'use client';

import { useEffect, useRef, useState } from 'react';
import { startVisibilityAwareFrameLoop } from '@/lib/frameScheduler';
import type { BackgroundRemovalMode } from '@/types/media';

const INFERENCE_SIZE = 256;
const NORMAL_INTERVAL_MS = 100;
const DEGRADED_INTERVAL_MS = 160;
const MAX_FAILURES = 3;

export interface UseVisionSegmentationResult {
  effectCanvas: HTMLCanvasElement | null;
  state: 'disabled' | 'loading' | 'running' | 'error';
  error: string | null;
  inferenceFps: number;
}

function createVideo(stream: MediaStream) {
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  return video;
}

export function useVisionSegmentation(
  cameraStream: MediaStream | null,
  mode: BackgroundRemovalMode,
): UseVisionSegmentationResult {
  const [effectCanvas, setEffectCanvas] = useState<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<UseVisionSegmentationResult['state']>('disabled');
  const [error, setError] = useState<string | null>(null);
  const [inferenceFps, setInferenceFps] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!cameraStream || mode === 'original') {
      const resetState = window.setTimeout(() => {
        setEffectCanvas(null);
        setState('disabled');
        setError(null);
        setInferenceFps(0);
      }, 0);
      return () => window.clearTimeout(resetState);
    }

    let cancelled = false;
    let failures = 0;
    let interval = NORMAL_INTERVAL_MS;
    let inferenceRunning = false;
    let inferenceDisabled = false;
    let lastInferenceAt = 0;
    let frameCount = 0;
    let fpsWindowStart = performance.now();
    const video = createVideo(cameraStream);
    const inputCanvas = document.createElement('canvas');
    inputCanvas.width = INFERENCE_SIZE;
    inputCanvas.height = INFERENCE_SIZE;
    const inputContext = inputCanvas.getContext('2d');
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = INFERENCE_SIZE;
    outputCanvas.height = INFERENCE_SIZE;
    const outputContext = outputCanvas.getContext('2d');
    const subjectCanvas = document.createElement('canvas');
    subjectCanvas.width = INFERENCE_SIZE;
    subjectCanvas.height = INFERENCE_SIZE;
    const subjectContext = subjectCanvas.getContext('2d');
    const publishCanvas = window.setTimeout(() => {
      setEffectCanvas(outputCanvas);
      setState('loading');
      setError(null);
    }, 0);

    let segmenter: import('@mediapipe/selfie_segmentation').SelfieSegmentation | null = null;

    const runInference = async (timestamp: number) => {
      if (
        cancelled
        || inferenceDisabled
        || inferenceRunning
        || timestamp - lastInferenceAt < interval
        || !segmenter
        || !inputContext
        || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) return;

      inferenceRunning = true;
      lastInferenceAt = timestamp;
      const startedAt = performance.now();
      try {
        inputContext.drawImage(video, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
        await segmenter.send({ image: inputCanvas });
        failures = 0;
        const elapsed = performance.now() - startedAt;
        interval = elapsed > 65 ? DEGRADED_INTERVAL_MS : NORMAL_INTERVAL_MS;
      } catch (cause) {
        failures += 1;
        if (failures >= MAX_FAILURES) {
          inferenceDisabled = true;
          setState('error');
          setError(`Background effect disabled: ${(cause as Error).message || 'segmentation failed'}`);
        }
      } finally {
        inferenceRunning = false;
      }
    };

    const stopInferenceLoop = startVisibilityAwareFrameLoop(
      (timestamp) => void runInference(timestamp),
      1000 / NORMAL_INTERVAL_MS,
    );

    void (async () => {
      try {
        const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
        if (cancelled || generationRef.current !== generation) return;
        segmenter = new SelfieSegmentation({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });
        segmenter.setOptions({ modelSelection: 1, selfieMode: true });
        segmenter.onResults((results) => {
          if (cancelled || !outputContext) return;
          outputContext.save();
          outputContext.clearRect(0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
          if (mode === 'blur' && subjectContext) {
            outputContext.filter = 'blur(12px)';
            outputContext.drawImage(results.image, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
            outputContext.filter = 'none';
            subjectContext.save();
            subjectContext.clearRect(0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
            subjectContext.filter = 'blur(1.5px)';
            subjectContext.drawImage(results.segmentationMask, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
            subjectContext.filter = 'none';
            subjectContext.globalCompositeOperation = 'source-in';
            subjectContext.drawImage(results.image, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
            subjectContext.restore();
            outputContext.drawImage(subjectCanvas, 0, 0);
          } else {
            outputContext.filter = 'blur(1.5px)';
            outputContext.drawImage(results.segmentationMask, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
            outputContext.filter = 'none';
            outputContext.globalCompositeOperation = 'source-in';
            outputContext.drawImage(results.image, 0, 0, INFERENCE_SIZE, INFERENCE_SIZE);
          }
          outputContext.restore();
          frameCount += 1;
          const now = performance.now();
          if (now - fpsWindowStart >= 1000) {
            setInferenceFps(Math.round(frameCount * 1000 / (now - fpsWindowStart)));
            frameCount = 0;
            fpsWindowStart = now;
          }
          setState('running');
        });
        await segmenter.initialize();
      } catch (cause) {
        if (!cancelled) {
          setState('error');
          setError(`Background effect unavailable: ${(cause as Error).message}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(publishCanvas);
      stopInferenceLoop();
      video.pause();
      video.srcObject = null;
      void segmenter?.close().catch(() => undefined);
    };
  }, [cameraStream, mode]);

  return { effectCanvas, state, error, inferenceFps };
}
