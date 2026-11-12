import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Keep in sync with the exact `@mediapipe/tasks-vision` version in package.json: the
 * WASM runtime loaded from the CDN must match the JavaScript bundle.
 */
export const TASKS_VISION_VERSION = '0.10.21';
export const POSE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
export const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

export type PoseDelegate = 'GPU' | 'CPU';

export interface LoadedPoseLandmarker {
  landmarker: PoseLandmarker;
  delegate: PoseDelegate;
}

/**
 * Loads the full-body pose model with segmentation masks. GPU is tried first, but on some
 * GPU/browser combinations the GPU delegate reads the segmentation mask back as all zeros
 * (glReadPixels "Invalid format and type combination"), so the caller can ask for CPU
 * when it detects a person with an empty mask. CPU always produces a usable mask.
 */
export async function createPoseLandmarker(preferred: PoseDelegate = 'GPU'): Promise<LoadedPoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(POSE_WASM_URL);
  const create = (delegate: PoseDelegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
    runningMode: 'VIDEO',
    numPoses: 2,
    outputSegmentationMasks: true,
  });
  if (preferred === 'CPU') return { landmarker: await create('CPU'), delegate: 'CPU' };
  try {
    return { landmarker: await create('GPU'), delegate: 'GPU' };
  } catch {
    return { landmarker: await create('CPU'), delegate: 'CPU' };
  }
}
