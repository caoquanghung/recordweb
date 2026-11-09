import type { AdminDownloadManifest, AdminRecording } from '../types/adminLibrary';

export const ADMIN_PAGE_SIZE = 6;
export const ADMIN_DOWNLOAD_PAGE_SIZE = 100;
export const ADMIN_ASSET_KINDS = ['composite', 'webcam', 'screen', 'audio', 'microphone-audio', 'system-audio', 'cursor'] as const;

export function isAdminUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function canAdminDeleteUser(actorId: string, targetId: string, targetRole: string) {
  return actorId !== targetId && targetRole === 'user';
}

export function adminFileStem(value: string) {
  return value.normalize('NFKC').trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^[.\s-]+|[.\s-]+$/g, '').slice(0, 100) || 'recording';
}

export function buildAdminDownloadManifest(recordings: AdminRecording[], name: string): AdminDownloadManifest {
  return {
    name: `${adminFileStem(name)}.zip`,
    files: recordings.flatMap((recording) => {
      const folder = `${adminFileStem(recording.owner_email)}/${recording.id}-${adminFileStem(recording.title)}`;
      const assets = (recording.assets ?? []).map(({ kind, storage_url, mime_type, file_size_bytes }) => ({
        kind, storage_url, mime_type, file_size_bytes,
      }));
      if (recording.storage_url && !assets.some((asset) => asset.kind === 'composite')) {
        assets.unshift({
          kind: 'composite', storage_url: recording.storage_url, mime_type: recording.mime_type,
          file_size_bytes: recording.file_size_bytes,
        });
      }
      const text = JSON.stringify(recording, null, 2);
      return [
        { name: `${folder}/metadata.json`, text, size: new TextEncoder().encode(text).length },
        ...assets.map((asset) => {
          const mime = asset.mime_type.split(';')[0].trim();
          const extension = mime === 'application/json' ? 'json' : mime === 'audio/mp4' ? 'm4a' : mime.endsWith('/mp4') ? 'mp4' : 'webm';
          return { name: `${folder}/${asset.kind}.${extension}`, url: asset.storage_url, size: Number(asset.file_size_bytes) };
        }),
      ];
    }),
  };
}
