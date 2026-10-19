import type { RecordingAssetKind } from '@/types/recording';

export interface RecordingArchiveAsset {
  kind: RecordingAssetKind;
  mimeType: string;
  blob?: Blob;
  storageUrl?: string;
}

export const RECORDING_ARCHIVE_KINDS: RecordingAssetKind[] = [
  'composite',
  'webcam',
  'screen',
  'audio',
  'microphone-audio',
  'system-audio',
  'cursor',
];

const COMPONENT_FILE_NAMES: Record<RecordingAssetKind, string> = {
  composite: 'composite',
  webcam: 'webcam',
  screen: 'screen',
  audio: 'mixed-audio',
  'microphone-audio': 'microphone-audio',
  'system-audio': 'system-audio',
  cursor: 'cursor',
};

function fileExtension(mimeType: string) {
  const baseType = mimeType.split(';', 1)[0].trim().toLowerCase();
  if (baseType === 'application/json') return 'json';
  if (baseType === 'audio/mp4') return 'm4a';
  if (baseType.endsWith('/mp4')) return 'mp4';
  return 'webm';
}

function safeFileStem(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 120) || 'recording';
}

async function* archiveEntries(recordingName: string, assets: RecordingArchiveAsset[]) {
  const fileStem = safeFileStem(recordingName);
  for (const asset of assets) {
    const name = `${fileStem}-${COMPONENT_FILE_NAMES[asset.kind]}.${fileExtension(asset.mimeType)}`;
    if (asset.blob) {
      yield { name, input: asset.blob };
      continue;
    }
    if (!asset.storageUrl) continue;
    const response = await fetch(asset.storageUrl);
    if (!response.ok) {
      throw new Error(`Could not download ${COMPONENT_FILE_NAMES[asset.kind]} (${response.status}).`);
    }
    yield { name, input: response };
  }
}

export async function downloadRecordingArchive(
  recordingName: string,
  assets: RecordingArchiveAsset[],
) {
  if (assets.length === 0) throw new Error('This recording does not have downloadable files.');
  const { downloadZip } = await import('client-zip');
  const archive = await downloadZip(archiveEntries(recordingName, assets)).blob();
  const url = URL.createObjectURL(archive);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileStem(recordingName)}-assets.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
