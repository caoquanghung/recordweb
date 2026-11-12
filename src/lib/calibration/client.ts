import { upload, uploadPresigned } from '@vercel/blob/client';
import type { CalibrationCommitBody, CalibrationProfile } from '@/types/calibration';

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Không thể hoàn tất yêu cầu.');
  return data as T;
}

export async function fetchCalibrationProfile(signal?: AbortSignal): Promise<CalibrationProfile | null> {
  const data = await json<{ profile: CalibrationProfile | null }>(
    await fetch('/api/calibration', { cache: 'no-store', signal }),
  );
  return data.profile;
}

export async function acceptCalibrationConsent(): Promise<CalibrationProfile | null> {
  const data = await json<{ profile: CalibrationProfile | null }>(
    await fetch('/api/calibration/consent', { method: 'POST' }),
  );
  return data.profile;
}

export async function deleteCalibrationProfile(): Promise<void> {
  await json<unknown>(await fetch('/api/calibration', { method: 'DELETE' }));
}

export interface CalibrationUploadConfig {
  uploadMethod: 'client-token' | 'presigned';
  /** Pathname prefix the server will accept for this user: `calibration/<userId>/`. */
  prefix: string;
}

export async function fetchCalibrationUploadConfig(signal?: AbortSignal): Promise<CalibrationUploadConfig> {
  const config = await json<CalibrationUploadConfig>(
    await fetch('/api/calibration/upload', { cache: 'no-store', signal }),
  );
  if (!['client-token', 'presigned'].includes(config.uploadMethod) || !config.prefix) {
    throw new Error('Không xác định được cách upload ảnh.');
  }
  return config;
}

/** Uploads straight from the browser to Vercel Blob; the image never passes through a Route Handler. */
export async function uploadCalibrationImage(
  config: CalibrationUploadConfig,
  pathname: string,
  blob: Blob,
  signal: AbortSignal,
): Promise<void> {
  const uploadToBlob = config.uploadMethod === 'presigned' ? uploadPresigned : upload;
  await uploadToBlob(pathname, blob, {
    access: 'public',
    handleUploadUrl: '/api/calibration/upload',
    contentType: 'image/png',
    abortSignal: signal,
  });
}

export async function commitCalibrationPostures(body: CalibrationCommitBody): Promise<CalibrationProfile> {
  const data = await json<{ profile: CalibrationProfile }>(await fetch('/api/calibration/postures', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
  return data.profile;
}
