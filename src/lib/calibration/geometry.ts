import {
  CALIBRATION_IMAGE_HEIGHT,
  CALIBRATION_MAX_WIDTH,
  CALIBRATION_MIN_WIDTH,
} from './policy';

/**
 * Pure geometry for the calibration page: no DOM, MediaPipe or React imports, so it
 * can be unit tested directly. Coordinates are pixels of the frame they refer to
 * unless a name says "normalized".
 */

export interface Rect { x: number; y: number; width: number; height: number }

export interface PoseLandmark { x: number; y: number; visibility?: number }

/** MediaPipe Pose landmark indices used by the checks. */
export const POSE = {
  nose: 0, leftEye: 2, rightEye: 5,
  leftShoulder: 11, rightShoulder: 12, leftHip: 23, rightHip: 24,
  leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30, leftFootIndex: 31, rightFootIndex: 32,
} as const;

export const MASK_THRESHOLD = 0.5;
export const VISIBILITY_THRESHOLD = 0.5;
/** Frame margin (fraction of height/width) the person must stay clear of at top and bottom. */
export const EDGE_MARGIN = 0.01;
export const MIN_BODY_HEIGHT_RATIO = 0.4;
export const CROP_PADDING = 0.02;
/** Nose sits at about 93.5% of standing height; used to infer the top of the head. */
const NOSE_HEIGHT_FRACTION = 0.935;

export type QualityIssue =
  | 'no-person' | 'multiple-people' | 'head-hidden' | 'feet-hidden'
  | 'clipped-top' | 'clipped-bottom' | 'too-small';

export const QUALITY_MESSAGES: Record<QualityIssue, string> = {
  'no-person': 'Không thấy người trong khung hình.',
  'multiple-people': 'Chỉ một người được đứng trong khung hình.',
  'head-hidden': 'Chưa thấy đầu. Hãy lùi ra để thấy cả đầu và chân.',
  'feet-hidden': 'Chưa thấy chân. Hãy lùi ra để thấy cả đầu và chân.',
  'clipped-top': 'Đầu hoặc tay bị cắt ở mép trên. Hãy lùi ra để thấy cả đầu và chân.',
  'clipped-bottom': 'Chân bị cắt ở mép dưới. Hãy lùi ra để thấy cả đầu và chân.',
  'too-small': 'Bạn đứng quá xa. Hãy tiến lại gần hơn một chút.',
};

/** Bounding box of mask values above the threshold, or null when nothing exceeds it. */
export function maskBounds(mask: ArrayLike<number>, width: number, height: number, threshold = MASK_THRESHOLD): Rect | null {
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function visible(landmark: PoseLandmark | undefined): boolean {
  return Boolean(landmark)
    && (landmark!.visibility ?? 1) >= VISIBILITY_THRESHOLD
    && landmark!.x >= 0 && landmark!.x <= 1 && landmark!.y >= 0 && landmark!.y <= 1;
}

const PRESENCE_POINTS = [POSE.nose, POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip];

/** A pose counts as a person when most torso/head landmarks are confidently visible. */
export function isPersonPose(landmarks: readonly PoseLandmark[]): boolean {
  const scores = PRESENCE_POINTS.map((index) => landmarks[index]?.visibility ?? 0);
  return scores.reduce((sum, score) => sum + score, 0) / scores.length >= VISIBILITY_THRESHOLD;
}

export interface QualityInput {
  poses: ReadonlyArray<readonly PoseLandmark[]>;
  /** Mask bounds of the single person, in pixels of the frame the mask was computed on. */
  bounds: Rect | null;
  frameWidth: number;
  frameHeight: number;
}

export interface QualityResult {
  ok: boolean;
  issues: QualityIssue[];
  personIndex: number;
}

/** Evaluates the "whole body visible" rule: head and feet seen, not clipped, one person, big enough. */
export function evaluateFullBody({ poses, bounds, frameHeight }: QualityInput): QualityResult {
  const people = poses.map((pose, index) => ({ pose, index })).filter(({ pose }) => isPersonPose(pose));
  if (people.length === 0 || !bounds) return { ok: false, issues: ['no-person'], personIndex: -1 };
  if (people.length > 1) return { ok: false, issues: ['multiple-people'], personIndex: -1 };

  const { pose, index } = people[0];
  const issues: QualityIssue[] = [];
  const head = [POSE.nose, POSE.leftEye, POSE.rightEye].every((i) => visible(pose[i]));
  if (!head) issues.push('head-hidden');
  const footSide = (ankle: number, heel: number, toe: number) =>
    visible(pose[ankle]) && (visible(pose[heel]) || visible(pose[toe]));
  const feet = footSide(POSE.leftAnkle, POSE.leftHeel, POSE.leftFootIndex)
    && footSide(POSE.rightAnkle, POSE.rightHeel, POSE.rightFootIndex);
  if (!feet) issues.push('feet-hidden');

  const margin = EDGE_MARGIN * frameHeight;
  if (bounds.y <= margin) issues.push('clipped-top');
  if (bounds.y + bounds.height >= frameHeight - margin) issues.push('clipped-bottom');
  if (bounds.height / frameHeight < MIN_BODY_HEIGHT_RATIO) issues.push('too-small');
  return { ok: issues.length === 0, issues, personIndex: index };
}

/**
 * Top of the head from the nose and feet, so a raised pointing arm does not
 * change the body height used for scaling. Never lower than the mask top.
 */
export function estimateHeadTop(noseY: number, feetY: number, boundsTop: number): number {
  const bodyHeight = (feetY - noseY) / NOSE_HEIGHT_FRACTION;
  const derived = feetY - bodyHeight;
  return Math.max(derived, boundsTop);
}

/** Horizontal body axis (shoulders and hips) in pixels; falls back to the mask centre. */
export function bodyAxisX(pose: readonly PoseLandmark[], frameWidth: number, bounds: Rect): number {
  const points = [POSE.leftShoulder, POSE.rightShoulder, POSE.leftHip, POSE.rightHip]
    .map((i) => pose[i]).filter((p): p is PoseLandmark => visible(p));
  if (points.length < 2) return bounds.x + bounds.width / 2;
  return (points.reduce((sum, p) => sum + p.x, 0) / points.length) * frameWidth;
}

/** The bounding box grown by `padding` on every side and clamped to the frame. */
export function paddedCrop(bounds: Rect, frameWidth: number, frameHeight: number, padding = CROP_PADDING): Rect {
  const padX = bounds.width * padding;
  const padY = bounds.height * padding;
  const x = Math.max(0, Math.floor(bounds.x - padX));
  const y = Math.max(0, Math.floor(bounds.y - padY));
  const right = Math.min(frameWidth, Math.ceil(bounds.x + bounds.width + padX));
  const bottom = Math.min(frameHeight, Math.ceil(bounds.y + bounds.height + padY));
  return { x, y, width: right - x, height: bottom - y };
}

export interface NormalizedSize { scale: number; width: number; height: number; withinLimits: boolean }

/** Uniform scale so the crop becomes exactly 1080 px tall. */
export function normalizedImageSize(crop: Rect): NormalizedSize {
  const scale = CALIBRATION_IMAGE_HEIGHT / crop.height;
  const width = Math.round(crop.width * scale);
  return {
    scale, width, height: CALIBRATION_IMAGE_HEIGHT,
    withinLimits: width >= CALIBRATION_MIN_WIDTH && width <= CALIBRATION_MAX_WIDTH,
  };
}

/** Exponential moving average; seeds with the first sample. */
export function smooth(previous: number | null, next: number, alpha = 0.2): number {
  return previous === null ? next : previous + (next - previous) * alpha;
}

/** Alpha 0-255 from a segmentation confidence, with a soft ramp for feathered edges. */
export function maskToAlpha(confidence: number): number {
  const t = (confidence - 0.35) / 0.4;
  return Math.round(255 * Math.min(1, Math.max(0, t)));
}

/** Stage reference frame (matches image.png) in 1920x1080 units. */
export const STAGE = {
  width: 1920,
  height: 1080,
  panel: { x: 52, y: 88, width: 1465, height: 835 },
  zone: { x: 1517, width: 403 },
} as const;

/**
 * Where the cutout goes on the stage: body height (head top to feet) equals the white
 * panel height, feet on the panel's bottom edge, body axis centred in the blue zone.
 * Width is intentionally unconstrained so an outstretched arm may overlap the panel.
 */
export function placeBody(headTopY: number, feetY: number): { scale: number; destX: number; destY: number } {
  const bodyHeight = Math.max(1, feetY - headTopY);
  return {
    scale: STAGE.panel.height / bodyHeight,
    destX: STAGE.zone.x + STAGE.zone.width / 2,
    destY: STAGE.panel.y + STAGE.panel.height,
  };
}
