import type { RecordingAssetKind } from '../types/recording';

export const UPLOAD_MAX_BYTES = 300 * 1024 * 1024;
export const UPLOAD_KINDS: readonly RecordingAssetKind[] = [
  'composite', 'webcam', 'screen', 'audio', 'microphone-audio', 'system-audio', 'cursor',
];

export interface UploadManifestAsset {
  kind: RecordingAssetKind;
  pathname: string;
  contentType: string;
  size: number;
}

export function isUploadId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function buildUploadManifest(attemptId: string, assets: unknown): UploadManifestAsset[] {
  if (!isUploadId(attemptId) || !Array.isArray(assets) || !assets.length || assets.length > UPLOAD_KINDS.length) {
    throw new Error('Invalid upload manifest.');
  }
  const seen = new Set<string>();
  const manifest = assets.map((asset) => {
    const { kind, mimeType, size } = asset ?? {};
    if (!UPLOAD_KINDS.includes(kind) || seen.has(kind) || typeof mimeType !== 'string'
      || !Number.isSafeInteger(size) || size <= 0 || size > UPLOAD_MAX_BYTES) {
      throw new Error('Invalid upload asset.');
    }
    seen.add(kind);
    const contentType = mimeType.split(';')[0].trim().toLowerCase();
    const allowed = kind === 'cursor' ? ['application/json']
      : kind.includes('audio') ? ['audio/webm', 'audio/mp4'] : ['video/webm', 'video/mp4'];
    if (!allowed.includes(contentType)) throw new Error('Invalid upload content type.');
    const extension = contentType === 'application/json' ? 'json' : contentType.endsWith('webm') ? 'webm' : 'mp4';
    return { kind, pathname: `recording-uploads/${attemptId}/${kind}.${extension}`, contentType, size };
  });
  if (!seen.has('composite')) throw new Error('The composite asset is required.');
  return manifest;
}

export function uploadIdFromPath(pathname: string): string | null {
  const match = /^recording-uploads\/([^/]+)\/[^/]+$/.exec(pathname);
  return match && isUploadId(match[1]) ? match[1] : null;
}
