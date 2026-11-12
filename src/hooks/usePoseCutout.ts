'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { getErrorMessage } from '@/hooks/mediaHookUtils';
import {
  STAGE,
  bodyAxisX,
  estimateHeadTop,
  evaluateFullBody,
  isPersonPose,
  maskBounds,
  maskToAlpha,
  normalizedImageSize,
  paddedCrop,
  placeBody,
  smooth,
  type QualityIssue,
  type Rect,
} from '@/lib/calibration/geometry';
import { CALIBRATION_POSE_MODEL } from '@/lib/calibration/policy';
import { createPoseLandmarker } from '@/lib/calibration/poseLandmarker';
import type { CalibrationBbox } from '@/types/calibration';

const INPUT_HEIGHT = 480;
const FRAME_INTERVAL_MS = 66; // about 15 inferences per second is plenty for a preview

export type PoseModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface LiveQuality {
  ok: boolean;
  issues: QualityIssue[];
}

export interface CapturedPosture {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceBbox: CalibrationBbox;
  scaleFactor: number;
  poseModel: string;
}

export type CaptureOutcome =
  | { ok: true; posture: CapturedPosture }
  | { ok: false; issues: QualityIssue[] };

interface Analysis {
  quality: { ok: boolean; issues: QualityIssue[] };
  index: number;
  bounds: Rect | null;
  mask: Float32Array | null;
  maskWidth: number;
  maskHeight: number;
  result: PoseLandmarkerResult;
}

function analyse(result: PoseLandmarkerResult, frameWidth: number, frameHeight: number): Analysis {
  const poses = result.landmarks ?? [];
  const masks = result.segmentationMasks ?? [];
  // The mask of the first person-like pose; "more than one person" is judged separately.
  const index = poses.findIndex((pose) => isPersonPose(pose));
  const mask = index >= 0 ? masks[index] : undefined;
  const values = mask?.getAsFloat32Array() ?? null;
  const bounds = values && mask ? maskBounds(values, mask.width, mask.height) : null;
  // Normalise mask-space bounds to the frame the caller reasons about.
  const sx = mask ? frameWidth / mask.width : 1;
  const sy = mask ? frameHeight / mask.height : 1;
  const frameBounds = bounds
    ? { x: bounds.x * sx, y: bounds.y * sy, width: bounds.width * sx, height: bounds.height * sy }
    : null;
  const quality = evaluateFullBody({ poses, bounds: frameBounds, frameWidth, frameHeight });
  return {
    quality, index, bounds: frameBounds, mask: values,
    maskWidth: mask?.width ?? 0, maskHeight: mask?.height ?? 0, result,
  };
}

function context2d(canvas: HTMLCanvasElement, readback = false): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', readback ? { willReadFrequently: true } : undefined);
  if (!context) throw new Error('Canvas 2D is not available.');
  return context;
}

/**
 * Pose detection and background removal for the calibration page. Draws the live
 * (mirrored) cutout onto `overlayRef` in stage reference units and exposes `capture()`,
 * which re-detects on a full-resolution still and returns a normalised, unmirrored PNG.
 * Runs entirely in the browser and never touches the Studio vision hooks.
 */
export function usePoseCutout({ video, active, overlayRef }: {
  video: HTMLVideoElement | null;
  active: boolean;
  overlayRef: RefObject<HTMLCanvasElement | null>;
}) {
  const [modelState, setModelState] = useState<PoseModelState>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [live, setLive] = useState<LiveQuality>({ ok: false, issues: ['no-person'] });
  const [attempt, setAttempt] = useState(0);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const busyRef = useRef(false);
  const lastTimestampRef = useRef(0);
  const liveKeyRef = useRef('');

  const nextTimestamp = useCallback(() => {
    lastTimestampRef.current = Math.max(lastTimestampRef.current + 1, Math.round(performance.now()));
    return lastTimestampRef.current;
  }, []);

  // Load the model only while a session is active; release it as soon as it ends.
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let created: PoseLandmarker | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- model status must reflect the load that starts here
    setModelState('loading');
    setModelError(null);
    createPoseLandmarker().then((landmarker) => {
      if (cancelled) { landmarker.close(); return; }
      created = landmarker;
      landmarkerRef.current = landmarker;
      setModelState('ready');
    }).catch((cause) => {
      if (cancelled) return;
      setModelState('error');
      setModelError(`${getErrorMessage(cause, 'Không tải được model nhận diện dáng người.')} Kiểm tra kết nối mạng tới CDN rồi thử lại.`);
    });
    return () => {
      cancelled = true;
      created?.close();
      if (landmarkerRef.current === created) landmarkerRef.current = null;
      setModelState('idle');
    };
  }, [active, attempt]);

  // Live preview loop.
  useEffect(() => {
    if (!active || modelState !== 'ready' || !video) return undefined;
    const input = document.createElement('canvas');
    const cut = document.createElement('canvas');
    let inputContext: CanvasRenderingContext2D | null = null;
    let cutContext: CanvasRenderingContext2D | null = null;
    let frame = 0;
    let last = 0;
    const smoothed = { axisX: null as number | null, feetY: null as number | null, headTop: null as number | null };

    const publish = (ok: boolean, issues: QualityIssue[]) => {
      const key = `${ok}:${issues.join(',')}`;
      if (key === liveKeyRef.current) return;
      liveKeyRef.current = key;
      setLive({ ok, issues });
    };

    const clearOverlay = () => {
      const overlay = overlayRef.current;
      overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    };

    const draw = (analysis: Analysis, inputWidth: number, inputHeight: number) => {
      const overlay = overlayRef.current;
      const { bounds, mask, index, result } = analysis;
      if (!overlay || !bounds || !mask || !inputContext || !cutContext) { clearOverlay(); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.min(STAGE.width, Math.round(overlay.clientWidth * dpr));
      const height = Math.round(width * STAGE.height / STAGE.width);
      if (width < 2) return;
      if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }

      const pixels = inputContext.getImageData(0, 0, inputWidth, inputHeight);
      const count = Math.min(mask.length, inputWidth * inputHeight);
      for (let i = 0; i < count; i += 1) pixels.data[i * 4 + 3] = maskToAlpha(mask[i]);
      cutContext.putImageData(pixels, 0, 0);

      const pose = result.landmarks[index];
      const feetY = bounds.y + bounds.height;
      const noseY = (pose[0]?.y ?? 0) * inputHeight;
      smoothed.axisX = smooth(smoothed.axisX, bodyAxisX(pose, inputWidth, bounds));
      smoothed.feetY = smooth(smoothed.feetY, feetY);
      smoothed.headTop = smooth(smoothed.headTop, estimateHeadTop(noseY, feetY, bounds.y));
      const place = placeBody(smoothed.headTop, smoothed.feetY);

      const context = overlay.getContext('2d');
      if (!context) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, overlay.width, overlay.height);
      context.setTransform(width / STAGE.width, 0, 0, height / STAGE.height, 0, 0);
      context.imageSmoothingQuality = 'high';
      context.translate(place.destX, place.destY);
      // A negative x scale mirrors the preview only; stored images are never mirrored.
      context.scale(-place.scale, place.scale);
      context.drawImage(cut, -smoothed.axisX, -smoothed.feetY);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const landmarker = landmarkerRef.current;
      if (!landmarker || busyRef.current || now - last < FRAME_INTERVAL_MS) return;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      last = now;
      const inputWidth = Math.round(video.videoWidth * INPUT_HEIGHT / video.videoHeight);
      if (input.width !== inputWidth || input.height !== INPUT_HEIGHT) {
        input.width = inputWidth; input.height = INPUT_HEIGHT;
        cut.width = inputWidth; cut.height = INPUT_HEIGHT;
        inputContext = context2d(input, true);
        cutContext = context2d(cut);
      }
      inputContext?.drawImage(video, 0, 0, inputWidth, INPUT_HEIGHT);
      try {
        landmarker.detectForVideo(input, nextTimestamp(), (result) => {
          const analysis = analyse(result, inputWidth, INPUT_HEIGHT);
          publish(analysis.quality.ok, analysis.quality.issues);
          if (analysis.bounds) draw(analysis, inputWidth, INPUT_HEIGHT);
          else {
            smoothed.axisX = null; smoothed.feetY = null; smoothed.headTop = null;
            clearOverlay();
          }
        });
      } catch (cause) {
        console.error('Pose preview frame failed', cause);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      clearOverlay();
    };
  }, [active, modelState, video, overlayRef, nextTimestamp]);

  /** Re-detects on a native-resolution still, enforces the full-body rule, and builds the PNG. */
  const capture = useCallback(async (): Promise<CaptureOutcome> => {
    const landmarker = landmarkerRef.current;
    if (!landmarker || !video || !video.videoWidth || !video.videoHeight) {
      return { ok: false, issues: ['no-person'] };
    }
    busyRef.current = true;
    try {
      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      const still = document.createElement('canvas');
      still.width = frameWidth;
      still.height = frameHeight;
      context2d(still, true).drawImage(video, 0, 0, frameWidth, frameHeight);

      type StillOutcome = { ok: false; issues: QualityIssue[] } | { ok: true; crop: Rect; cropCanvas: HTMLCanvasElement };
      // The callback runs synchronously inside detectForVideo; a holder keeps its result typed.
      const holder: { value: StillOutcome | null } = { value: null };
      landmarker.detectForVideo(still, nextTimestamp(), (result) => {
        const analysis = analyse(result, frameWidth, frameHeight);
        if (!analysis.quality.ok || !analysis.bounds || !analysis.mask) {
          holder.value = { ok: false, issues: analysis.quality.issues.length ? analysis.quality.issues : ['no-person'] };
          return;
        }
        const crop = paddedCrop(analysis.bounds, frameWidth, frameHeight);
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = crop.width;
        cropCanvas.height = crop.height;
        const cropContext = context2d(cropCanvas, true);
        cropContext.drawImage(still, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        const pixels = cropContext.getImageData(0, 0, crop.width, crop.height);
        const sx = analysis.maskWidth / frameWidth;
        const sy = analysis.maskHeight / frameHeight;
        for (let y = 0; y < crop.height; y += 1) {
          const maskRow = Math.min(analysis.maskHeight - 1, Math.floor((crop.y + y) * sy)) * analysis.maskWidth;
          for (let x = 0; x < crop.width; x += 1) {
            const maskColumn = Math.min(analysis.maskWidth - 1, Math.floor((crop.x + x) * sx));
            pixels.data[(y * crop.width + x) * 4 + 3] = maskToAlpha(analysis.mask[maskRow + maskColumn]);
          }
        }
        cropContext.putImageData(pixels, 0, 0);
        holder.value = { ok: true, crop, cropCanvas };
      });

      const done = holder.value;
      if (!done) return { ok: false, issues: ['no-person'] };
      if (!done.ok) return done;

      const size = normalizedImageSize(done.crop);
      if (!size.withinLimits) return { ok: false, issues: ['too-small'] };
      const output = document.createElement('canvas');
      output.width = size.width;
      output.height = size.height;
      const outputContext = context2d(output);
      outputContext.imageSmoothingQuality = 'high';
      outputContext.drawImage(done.cropCanvas, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Không thể tạo ảnh PNG.');
      return {
        ok: true,
        posture: {
          blob, widthPx: size.width, heightPx: size.height, sourceWidth: frameWidth, sourceHeight: frameHeight,
          sourceBbox: { ...done.crop }, scaleFactor: size.scale, poseModel: CALIBRATION_POSE_MODEL,
        },
      };
    } finally {
      busyRef.current = false;
    }
  }, [video, nextTimestamp]);

  const retryModel = useCallback(() => setAttempt((value) => value + 1), []);

  return { modelState, modelError, live, capture, retryModel };
}
