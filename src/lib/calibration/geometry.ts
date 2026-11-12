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
/** Frame margin (fraction of height) the head/arms must stay clear of at the top edge. */
export const EDGE_MARGIN = 0.01;
/** The frame must extend at least this fraction of its height below the hip line ("past the hips"). */
export const HIP_BOTTOM_MARGIN = 0.03;
/** Head-to-hip length must be at least this fraction of the frame height. */
export const MIN_HEAD_HIP_RATIO = 0.15;
export const CROP_PADDING = 0.02;
/**
 * Nose to head top is about 0.065 of standing height and nose to hip about 0.415, so the
 * head top sits 0.157 x (nose to hip) above the nose. Anthropometric approximation.
 */
export const HEAD_TOP_PER_NOSE_HIP = 0.157;

export type QualityIssue =
  | 'no-person' | 'multiple-people' | 'head-hidden' | 'hips-hidden' | 'clipped-top' | 'too-small';

export const QUALITY_MESSAGES: Record<QualityIssue, string> = {
  'no-person': 'Không thấy người trong khung hình.',
  'multiple-people': 'Chỉ một người được đứng trong khung hình.',
  'head-hidden': 'Chưa thấy đầu. Hãy lùi ra để thấy ít nhất từ đầu đến hông.',
  'hips-hidden': 'Chưa thấy hông. Hãy lùi ra để thấy ít nhất từ đầu đến hông.',
  'clipped-top': 'Đầu hoặc tay bị cắt ở mép trên. Hãy lùi ra để thấy ít nhất từ đầu đến hông.',
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

/**
 * Top of the head from the nose and the hip line, so a raised pointing arm and the
 * (possibly out-of-frame) feet do not matter. Never above the mask top.
 */
export function estimateHeadTop(noseY: number, hipMidY: number, boundsTop: number): number {
  return Math.max(noseY - HEAD_TOP_PER_NOSE_HIP * (hipMidY - noseY), boundsTop);
}

/** Vertical hip-line position in pixels, or null when neither hip landmark is usable. */
export function hipMidY(pose: readonly PoseLandmark[], frameHeight: number): number | null {
  const hips = [pose[POSE.leftHip], pose[POSE.rightHip]].filter((p): p is PoseLandmark => Boolean(p));
  if (!hips.length) return null;
  return (hips.reduce((sum, p) => sum + p.y, 0) / hips.length) * frameHeight;
}

export type BodyCoverage = 'full' | 'hips';

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
  /** Only when `ok`: whether the feet are in the picture too. */
  coverage?: BodyCoverage;
  /** Only when `ok`: pixels from the estimated head top to the hip midpoint. */
  headToHipPx?: number;
}

/**
 * The minimum is head to just past the hips. Anything the camera sees below that is kept
 * (nothing is ever cropped at the hips); `coverage` only records whether the feet are in view.
 */
export function evaluateBodyInFrame({ poses, bounds, frameHeight }: QualityInput): QualityResult {
  const people = poses.map((pose, index) => ({ pose, index })).filter(({ pose }) => isPersonPose(pose));
  if (people.length === 0 || !bounds) return { ok: false, issues: ['no-person'], personIndex: -1 };
  if (people.length > 1) return { ok: false, issues: ['multiple-people'], personIndex: -1 };

  const { pose, index } = people[0];
  const issues: QualityIssue[] = [];
  if (![POSE.nose, POSE.leftEye, POSE.rightEye].every((i) => visible(pose[i]))) issues.push('head-hidden');

  const hipY = hipMidY(pose, frameHeight);
  const hipsInFrame = visible(pose[POSE.leftHip]) && visible(pose[POSE.rightHip])
    && hipY !== null && hipY <= frameHeight * (1 - HIP_BOTTOM_MARGIN);
  if (!hipsInFrame) issues.push('hips-hidden');
  if (bounds.y <= EDGE_MARGIN * frameHeight) issues.push('clipped-top');

  let headToHipPx: number | undefined;
  if (hipY !== null && visible(pose[POSE.nose])) {
    const headTop = estimateHeadTop(pose[POSE.nose].y * frameHeight, hipY, bounds.y);
    headToHipPx = hipY - headTop;
    if (headToHipPx / frameHeight < MIN_HEAD_HIP_RATIO) issues.push('too-small');
  }
  if (issues.length || headToHipPx === undefined) return { ok: false, issues, personIndex: index };

  const footSide = (ankle: number, heel: number, toe: number) =>
    visible(pose[ankle]) && (visible(pose[heel]) || visible(pose[toe]));
  const feet = footSide(POSE.leftAnkle, POSE.leftHeel, POSE.leftFootIndex)
    && footSide(POSE.rightAnkle, POSE.rightHeel, POSE.rightFootIndex);
  const bottomClipped = bounds.y + bounds.height >= frameHeight - EDGE_MARGIN * frameHeight;
  return {
    ok: true, issues, personIndex: index, headToHipPx,
    coverage: feet && !bottomClipped ? 'full' : 'hips',
  };
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

/** Inner padding (stage units) between the blue zone edge and the raw-webcam fallback. */
export const ZONE_PADDING = 24;
/** The cutout never gets closer than this to the stage edges, so no part of the body is clipped. */
export const STAGE_EDGE_MARGIN = 16;

/**
 * Where the cutout goes on the stage. The visible body (estimated head top down to the lowest
 * mask pixel, feet included when they are in view) is scaled to be exactly as tall as the
 * white panel, i.e. what the camera captured vertically covers the slide vertically, with its
 * lowest point on the panel's bottom edge.
 *
 * Horizontally the body is centred in the blue zone, but its width is not constrained by the
 * zone: it is shifted sideways just enough that neither side leaves the stage, so a spread arm
 * overlaps the white panel instead of being cut off at the right edge. Two safety caps keep
 * the whole mask on the stage (arms raised above the head, extremely wide poses).
 *
 * `headTopY`/`bottomY` may be smoothed values; the caps and clamp use the current `bounds`.
 */
export function placeBody(
  bounds: Rect,
  headTopY: number,
  bottomY = bounds.y + bounds.height,
): { scale: number; destX: number; destY: number; sourceCenterX: number; sourceBottomY: number } {
  const destY = STAGE.panel.y + STAGE.panel.height;
  const scale = Math.min(
    STAGE.panel.height / Math.max(1, bottomY - headTopY),
    (destY - STAGE_EDGE_MARGIN) / Math.max(1, bounds.height),
    (STAGE.width - 2 * STAGE_EDGE_MARGIN) / Math.max(1, bounds.width),
  );
  const half = (scale * bounds.width) / 2;
  const zoneCenter = STAGE.zone.x + STAGE.zone.width / 2;
  const destX = Math.min(Math.max(zoneCenter, STAGE_EDGE_MARGIN + half), STAGE.width - STAGE_EDGE_MARGIN - half);
  return { scale, destX, destY, sourceCenterX: bounds.x + bounds.width / 2, sourceBottomY: bounds.y + bounds.height };
}

/**
 * Source rectangle of a "cover" crop: the largest centred region of a source frame that has
 * the destination's aspect ratio. Used for the raw-webcam fallback in the blue zone.
 */
export function coverSource(sourceWidth: number, sourceHeight: number, destWidth: number, destHeight: number): Rect {
  const destAspect = destWidth / destHeight;
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > destAspect) {
    const width = sourceHeight * destAspect;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / destAspect;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}
