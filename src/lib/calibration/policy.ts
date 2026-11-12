import type { CalibrationCommitBody, CalibrationPostureInput, CalibrationSaveMode } from '../../types/calibration';

/** Shared constants and pure validation for calibration; safe for client and server. */
export const CALIBRATION_IMAGE_HEIGHT = 1080;
export const CALIBRATION_MIN_WIDTH = 120;
export const CALIBRATION_MAX_WIDTH = 4096;
export const CALIBRATION_MAX_BYTES = 8 * 1024 * 1024;
export const CALIBRATION_CONSENT_VERSION = '2026-11-11';
export const CALIBRATION_COUNTDOWN_OPTIONS = [3, 5, 8] as const;
export const CALIBRATION_DEFAULT_COUNTDOWN = 5;
export const CALIBRATION_POSE_MODEL = 'pose_landmarker_full';
export const CALIBRATION_UPLOAD_LIMIT_PER_HOUR = 60;
export const CALIBRATION_PENDING_TTL_MS = 60 * 60 * 1000;
export const CALIBRATION_PREFIX = 'calibration/';
export const CALIBRATION_CELL_COUNT = 9;

/** Fixed capture order, row-major from the top-left cell. */
export const CALIBRATION_CELL_ORDER: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [1, 2], [1, 3],
  [2, 1], [2, 2], [2, 3],
  [3, 1], [3, 2], [3, 3],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export class CalibrationValidationError extends Error {}

export function calibrationCellKey(row: number, col: number): string {
  return `${row}-${col}`;
}

export function isCalibrationCell(row: unknown, col: unknown): boolean {
  return Number.isInteger(row) && Number.isInteger(col)
    && (row as number) >= 1 && (row as number) <= 3 && (col as number) >= 1 && (col as number) <= 3;
}

export function isCalibrationUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** True only for ids that can safely be embedded in a Blob pathname segment. */
export function isCalibrationUserSegment(userId: string): boolean {
  return USER_SEGMENT.test(userId);
}

export function calibrationPathname(userId: string, imageId: string): string {
  if (!isCalibrationUserSegment(userId) || !isCalibrationUuid(imageId)) {
    throw new CalibrationValidationError('Invalid calibration upload identity.');
  }
  return `${CALIBRATION_PREFIX}${userId}/${imageId}.png`;
}

/** A pathname is valid for a user only when it is exactly calibration/<userId>/<uuid>.png. */
export function isCalibrationPathnameFor(userId: string, pathname: unknown): pathname is string {
  if (typeof pathname !== 'string' || !isCalibrationUserSegment(userId)) return false;
  const prefix = `${CALIBRATION_PREFIX}${userId}/`;
  if (!pathname.startsWith(prefix) || !pathname.endsWith('.png')) return false;
  return isCalibrationUuid(pathname.slice(prefix.length, -'.png'.length));
}

function finite(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new CalibrationValidationError('Giá trị ảnh calibration không hợp lệ.');
  }
  return value;
}

function parsePosture(userId: string, raw: unknown): CalibrationPostureInput {
  if (!raw || typeof raw !== 'object') throw new CalibrationValidationError('Posture không hợp lệ.');
  const item = raw as Record<string, unknown>;
  if (!isCalibrationCell(item.cellRow, item.cellCol)) throw new CalibrationValidationError('Toạ độ ô phải nằm trong 1-3.');
  if (!isCalibrationPathnameFor(userId, item.pathname)) throw new CalibrationValidationError('Đường dẫn ảnh không hợp lệ.');
  if (item.mirrored !== false) throw new CalibrationValidationError('Ảnh calibration không được lật gương.');
  if (item.heightPx !== CALIBRATION_IMAGE_HEIGHT) throw new CalibrationValidationError('Ảnh phải cao đúng 1080 px.');
  const bbox = item.sourceBbox as Record<string, unknown> | null;
  if (!bbox || typeof bbox !== 'object') throw new CalibrationValidationError('Thiếu bounding box nguồn.');
  const capturedAt = typeof item.capturedAt === 'string' ? Date.parse(item.capturedAt) : NaN;
  if (!Number.isFinite(capturedAt) || capturedAt > Date.now() + 5 * 60_000) {
    throw new CalibrationValidationError('Thời điểm chụp không hợp lệ.');
  }
  if (typeof item.poseModel !== 'string' || !item.poseModel || item.poseModel.length > 64) {
    throw new CalibrationValidationError('Tên model không hợp lệ.');
  }
  const sourceWidth = finite(item.sourceWidth, 1, 16384);
  const sourceHeight = finite(item.sourceHeight, 1, 16384);
  return {
    cellRow: item.cellRow as number,
    cellCol: item.cellCol as number,
    pathname: item.pathname,
    widthPx: finite(item.widthPx, CALIBRATION_MIN_WIDTH, CALIBRATION_MAX_WIDTH),
    heightPx: CALIBRATION_IMAGE_HEIGHT,
    sourceWidth,
    sourceHeight,
    sourceBbox: {
      x: finite(bbox.x, 0, sourceWidth), y: finite(bbox.y, 0, sourceHeight),
      width: finite(bbox.width, 1, sourceWidth), height: finite(bbox.height, 1, sourceHeight),
    },
    scaleFactor: finite(item.scaleFactor, 0.01, 100),
    mirrored: false,
    poseModel: item.poseModel,
    capturedAt: new Date(capturedAt).toISOString(),
  };
}

/** Validates the commit request; never trusts URLs or byte sizes from the client. */
export function parseCalibrationCommit(userId: string, raw: unknown): CalibrationCommitBody {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CalibrationValidationError('Yêu cầu không hợp lệ.');
  const body = raw as Record<string, unknown>;
  const mode = body.mode as CalibrationSaveMode;
  if (mode !== 'replace-all' && mode !== 'replace-cells') throw new CalibrationValidationError('Chế độ lưu không hợp lệ.');
  if (!isCalibrationUuid(body.captureSessionId)) throw new CalibrationValidationError('Mã phiên chụp không hợp lệ.');
  if (!Array.isArray(body.postures) || body.postures.length < 1 || body.postures.length > CALIBRATION_CELL_COUNT) {
    throw new CalibrationValidationError('Cần từ 1 đến 9 ảnh posture.');
  }
  const postures = body.postures.map((item) => parsePosture(userId, item));
  const cells = new Set(postures.map((item) => calibrationCellKey(item.cellRow, item.cellCol)));
  const paths = new Set(postures.map((item) => item.pathname));
  if (cells.size !== postures.length) throw new CalibrationValidationError('Mỗi ô chỉ được lưu một ảnh.');
  if (paths.size !== postures.length) throw new CalibrationValidationError('Mỗi ảnh chỉ được dùng cho một ô.');
  return { mode, captureSessionId: body.captureSessionId, postures };
}
