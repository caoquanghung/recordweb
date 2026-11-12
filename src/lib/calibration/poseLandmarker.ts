import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Keep in sync with the exact `@mediapipe/tasks-vision` version in package.json: the
 * WASM runtime loaded from the CDN must match the JavaScript bundle.
 */
export const TASKS_VISION_VERSION = '0.10.21';
export const POSE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
export const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

/** Loads the full-body pose model with segmentation masks; GPU first, CPU as a fallback. */
export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(POSE_WASM_URL);
  const create = (delegate: 'GPU' | 'CPU') => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 2,
    outputSegmentationMasks: true,
  });
  try {
    return await create('GPU');
  } catch {
    return create('CPU');
  }
}
