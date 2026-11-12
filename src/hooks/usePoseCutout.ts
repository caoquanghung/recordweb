'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { getErrorMessage } from '@/hooks/mediaHookUtils';
import {
  STAGE,
  ZONE_PADDING,
  coverSource,
  estimateHeadTop,
  evaluateBodyInFrame,
  hipMidY,
  isPersonPose,
  maskBounds,
  maskToAlpha,
  normalizedImageSize,
  paddedCrop,
  placeBody,
  smooth,
  type BodyCoverage,
  type QualityIssue,
  type Rect,
} from '@/lib/calibration/geometry';
import { CALIBRATION_POSE_MODEL } from '@/lib/calibration/policy';
import { createPoseLandmarker, type PoseDelegate } from '@/lib/calibration/poseLandmarker';
import type { CalibrationBbox } from '@/types/calibration';

const GPU_INPUT_HEIGHT = 480;
const CPU_INPUT_HEIGHT = 360;
const FRAME_INTERVAL_MS = 66; // about 15 inferences per second is plenty for a preview
/** Without a person this long, the blue zone falls back to the raw (mirrored) webcam. */
const PERSON_GRACE_MS = 500;
/** A person-like pose whose mask stays empty this many frames means the GPU mask readback is broken. */
const EMPTY_MASK_FRAMES = 4;
const CPU_PREFERENCE_KEY = 'recordweb-calibration-cpu-delegate';

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
  bodyCoverage: BodyCoverage;
  headToHipPx: number;
  poseModel: string;
}

export type CaptureOutcome =
  | { ok: true; posture: CapturedPosture }
  | { ok: false; issues: QualityIssue[] };

interface Analysis {
  quality: ReturnType<typeof evaluateBodyInFrame>;
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
  const quality = evaluateBodyInFrame({ poses, bounds: frameBounds, frameWidth, frameHeight });
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

function readCpuPreference(): boolean {
  try { return window.sessionStorage.getItem(CPU_PREFERENCE_KEY) === '1'; } catch { return false; }
}

/**
 * Sizes the overlay to its CSS box, clears it, and returns a context whose units are the
 * 1920x1080 stage reference frame, so everything is drawn in the same units as STAGE.
 */
function prepareOverlay(overlay: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.min(STAGE.width, Math.round(overlay.clientWidth * dpr));
  const height = Math.round(width * STAGE.height / STAGE.width);
  if (width < 2) return null;
  if (overlay.width !== width || overlay.height !== height) { overlay.width = width; overlay.height = height; }
  const context = overlay.getContext('2d');
  if (!context) return null;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, overlay.width, overlay.height);
  context.setTransform(width / STAGE.width, 0, 0, height / STAGE.height, 0, 0);
  return context;
}

/**
 * Pose detection and background removal for the calibration page. While the camera is on it
 * draws a live, mirrored preview onto `overlayRef` in stage reference units: the raw webcam
 * until a person is detected, then the cutout. `capture()` re-detects on a full-resolution
 * still and returns a normalised, unmirrored PNG. Runs entirely in the browser and never
 * touches the Studio vision hooks.
 */
export function usePoseCutout({ video, enabled, overlayRef }: {
  video: HTMLVideoElement | null;
  /** True while the camera is starting or running; the model loads only then. */
  enabled: boolean;
  overlayRef: RefObject<HTMLCanvasElement | null>;
}) {
  const [modelState, setModelState] = useState<PoseModelState>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<PoseDelegate | null>(null);
  const [live, setLive] = useState<LiveQuality>({ ok: false, issues: ['no-person'] });
  const [attempt, setAttempt] = useState(0);
  const [preferCpu, setPreferCpu] = useState(false);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const delegateRef = useRef<PoseDelegate | null>(null);
  const busyRef = useRef(false);
  const lastTimestampRef = useRef(0);
  const liveKeyRef = useRef('');

  const nextTimestamp = useCallback(() => {
    lastTimestampRef.current = Math.max(lastTimestampRef.current + 1, Math.round(performance.now()));
    return lastTimestampRef.current;
  }, []);

  // Load the model only while the camera is on; release it as soon as the camera stops.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let created: PoseLandmarker | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- model status must reflect the load that starts here
    setModelState('loading');
    setModelError(null);
    createPoseLandmarker(preferCpu || readCpuPreference() ? 'CPU' : 'GPU').then(({ landmarker, delegate: loaded }) => {
      if (cancelled) { landmarker.close(); return; }
      created = landmarker;
      landmarkerRef.current = landmarker;
      delegateRef.current = loaded;
      setDelegate(loaded);
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
      delegateRef.current = null;
      setDelegate(null);
      setModelState('idle');
    };
  }, [enabled, attempt, preferCpu]);

  // Live preview loop: raw webcam until the model is ready and sees a person, then the cutout.
  useEffect(() => {
    if (!enabled || !video) return undefined;
    const overlayAtStart = overlayRef.current;
    const input = document.createElement('canvas');
    const cut = document.createElement('canvas');
    let inputContext: CanvasRenderingContext2D | null = null;
    let cutContext: CanvasRenderingContext2D | null = null;
    let frame = 0;
    let last = 0;
    let lastPersonAt = 0;
    let emptyMaskFrames = 0;
    let requestedCpu = false;
    // Smoothed head top and bottom steady the preview scale while the person moves.
    const smoothed = { headTop: null as number | null, bottomY: null as number | null };
    const resetSmoothing = () => { smoothed.headTop = null; smoothed.bottomY = null; };

    const publish = (ok: boolean, issues: QualityIssue[]) => {
      const key = `${ok}:${issues.join(',')}`;
      if (key === liveKeyRef.current) return;
      liveKeyRef.current = key;
      setLive({ ok, issues });
    };

    const drawRaw = () => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const context = prepareOverlay(overlay);
      if (!context || !video.videoWidth) return;
      const zone = {
        x: STAGE.zone.x + ZONE_PADDING, y: STAGE.panel.y,
        width: STAGE.zone.width - 2 * ZONE_PADDING, height: STAGE.panel.height,
      };
      const source = coverSource(video.videoWidth, video.videoHeight, zone.width, zone.height);
      context.save();
      context.beginPath();
      if (typeof context.roundRect === 'function') context.roundRect(zone.x, zone.y, zone.width, zone.height, 28);
      else context.rect(zone.x, zone.y, zone.width, zone.height);
      context.clip();
      // Mirror horizontally around the zone: the preview acts like a mirror, stored images do not.
      context.translate(zone.x + zone.width, zone.y);
      context.scale(-1, 1);
      context.drawImage(video, source.x, source.y, source.width, source.height, 0, 0, zone.width, zone.height);
      context.restore();
    };

    const drawCutout = (analysis: Analysis, inputWidth: number, inputHeight: number) => {
      const overlay = overlayRef.current;
      const { bounds, mask, index, result } = analysis;
      if (!overlay || !bounds || !mask || !inputContext || !cutContext) return;

      const pixels = inputContext.getImageData(0, 0, inputWidth, inputHeight);
      const count = Math.min(mask.length, inputWidth * inputHeight);
      for (let i = 0; i < count; i += 1) pixels.data[i * 4 + 3] = maskToAlpha(mask[i]);
      cutContext.putImageData(pixels, 0, 0);

      // The visible body (head top to the lowest mask pixel) is scaled to the slide's height; the
      // head top comes from the nose and hips so a raised pointing arm does not shrink the body.
      const pose = result.landmarks[index];
      const noseY = (pose[0]?.y ?? 0) * inputHeight;
      const hipY = hipMidY(pose, inputHeight) ?? bounds.y + bounds.height * 0.55;
      smoothed.headTop = smooth(smoothed.headTop, estimateHeadTop(noseY, hipY, bounds.y), 0.3);
      smoothed.bottomY = smooth(smoothed.bottomY, bounds.y + bounds.height, 0.3);
      const place = placeBody(bounds, smoothed.headTop, smoothed.bottomY);

      const context = prepareOverlay(overlay);
      if (!context) return;
      context.imageSmoothingQuality = 'high';
      context.translate(place.destX, place.destY);
      // A negative x scale mirrors the preview only; stored images are never mirrored.
      context.scale(-place.scale, place.scale);
      context.drawImage(cut, -place.sourceCenterX, -place.sourceBottomY);
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (busyRef.current || now - last < FRAME_INTERVAL_MS) return;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      last = now;
      const landmarker = landmarkerRef.current;
      if (!landmarker) {
        drawRaw();
        return;
      }
      const inputHeight = delegateRef.current === 'CPU' ? CPU_INPUT_HEIGHT : GPU_INPUT_HEIGHT;
      const inputWidth = Math.round(video.videoWidth * inputHeight / video.videoHeight);
      if (input.width !== inputWidth || input.height !== inputHeight) {
        input.width = inputWidth; input.height = inputHeight;
        cut.width = inputWidth; cut.height = inputHeight;
        inputContext = context2d(input, true);
        cutContext = context2d(cut);
      }
      inputContext?.drawImage(video, 0, 0, inputWidth, inputHeight);
      try {
        landmarker.detectForVideo(input, nextTimestamp(), (result) => {
          const analysis = analyse(result, inputWidth, inputHeight);
          publish(analysis.quality.ok, analysis.quality.issues);
          const time = performance.now();
          if (analysis.bounds) {
            emptyMaskFrames = 0;
            lastPersonAt = time;
            drawCutout(analysis, inputWidth, inputHeight);
            return;
          }
          // A confident pose with an empty mask is a broken GPU mask readback, not an empty room.
          if (analysis.index >= 0) emptyMaskFrames += 1; else emptyMaskFrames = 0;
          if (emptyMaskFrames >= EMPTY_MASK_FRAMES && !requestedCpu) {
            if (delegateRef.current === 'GPU') {
              requestedCpu = true;
              try { window.sessionStorage.setItem(CPU_PREFERENCE_KEY, '1'); } catch { /* optional */ }
              setPreferCpu(true);
            } else if (emptyMaskFrames === EMPTY_MASK_FRAMES * 8) {
              setModelError('Model nhận ra bạn nhưng không tạo được ảnh đã xoá nền. Hãy thử trình duyệt hoặc thiết bị khác.');
            }
          }
          if (time - lastPersonAt > PERSON_GRACE_MS) {
            resetSmoothing();
            drawRaw();
          }
        });
      } catch (cause) {
        console.error('Pose preview frame failed', cause);
      }
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      overlayAtStart?.getContext('2d')?.clearRect(0, 0, overlayAtStart.width, overlayAtStart.height);
    };
  }, [enabled, modelState, video, overlayRef, nextTimestamp]);

  /** Re-detects on a native-resolution still, enforces the "head to past the hips" rule, and builds the PNG. */
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

      type StillOutcome =
        | { ok: false; issues: QualityIssue[] }
        | { ok: true; crop: Rect; cropCanvas: HTMLCanvasElement; coverage: BodyCoverage; headToHipPx: number };
      // The callback runs synchronously inside detectForVideo; a holder keeps its result typed.
      const holder: { value: StillOutcome | null } = { value: null };
      landmarker.detectForVideo(still, nextTimestamp(), (result) => {
        const analysis = analyse(result, frameWidth, frameHeight);
        const { quality } = analysis;
        if (!quality.ok || !analysis.bounds || !analysis.mask || !quality.coverage || quality.headToHipPx === undefined) {
          holder.value = { ok: false, issues: quality.issues.length ? quality.issues : ['no-person'] };
          return;
        }
        // Everything the mask recognises is kept (feet included); nothing is cropped at the hips.
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
        holder.value = { ok: true, crop, cropCanvas, coverage: quality.coverage, headToHipPx: quality.headToHipPx };
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
          sourceBbox: { ...done.crop }, scaleFactor: size.scale,
          bodyCoverage: done.coverage, headToHipPx: done.headToHipPx, poseModel: CALIBRATION_POSE_MODEL,
        },
      };
    } finally {
      busyRef.current = false;
    }
  }, [video, nextTimestamp]);

  const retryModel = useCallback(() => setAttempt((value) => value + 1), []);

  return { modelState, modelError, delegate, live, capture, retryModel };
}
