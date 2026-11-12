/** A cell of the 3x3 calibration grid. Both axes are 1-based; (1,1) is top-left. */
export interface CalibrationCell {
  row: 1 | 2 | 3;
  col: 1 | 2 | 3;
}

export interface CalibrationBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadata describing one stored posture image (client-computed fields). */
export interface CalibrationPostureInput {
  cellRow: number;
  cellCol: number;
  pathname: string;
  widthPx: number;
  heightPx: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceBbox: CalibrationBbox;
  scaleFactor: number;
  mirrored: false;
  bodyCoverage: CalibrationBodyCoverage;
  /** Source-frame pixels from the estimated head top to the hip midpoint. */
  headToHipPx: number;
  poseModel: string;
  capturedAt: string;
}

/** 'full' = feet visible and frame not cut below them; 'hips' = at least head to just past the hips. */
export type CalibrationBodyCoverage = 'full' | 'hips';

export type CalibrationSaveMode = 'replace-all' | 'replace-cells';

export interface CalibrationCommitBody {
  mode: CalibrationSaveMode;
  captureSessionId: string;
  postures: CalibrationPostureInput[];
}

/** API representation of a stored posture. */
export interface CalibrationPosture {
  id: string;
  cellRow: number;
  cellCol: number;
  url: string;
  mimeType: string;
  fileSizeBytes: number;
  widthPx: number;
  heightPx: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceBbox: CalibrationBbox;
  scaleFactor: number;
  mirrored: boolean;
  bodyCoverage: CalibrationBodyCoverage;
  /** Null for images saved before head-to-hip length was recorded. */
  headToHipPx: number | null;
  poseModel: string;
  captureSessionId: string;
  capturedAt: string;
}

export interface CalibrationProfile {
  consentVersion: string;
  consentAcceptedAt: string;
  updatedAt: string;
  /** Number of stored cells, 0-9. */
  completeness: number;
  postures: CalibrationPosture[];
}

export interface AdminCalibrationUser {
  id: string;
  email: string;
  display_name: string | null;
  completeness: number;
  updated_at: string | null;
  consent_version: string | null;
  postures: Array<{ cellRow: number; cellCol: number; url: string }>;
}
