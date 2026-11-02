import { deleteRecordingBackup, getRecordingDraft } from '@/lib/idb';
import { repairWebmDuration } from '@/lib/ebmlPatcher';
import { UPLOAD_KINDS } from '@/lib/recordingUploadProtocol';

async function ownedBackup(id: string, ownerUserId: string) {
  const draft = await getRecordingDraft(id);
  if (!draft || (draft.ownerUserId && draft.ownerUserId !== ownerUserId)) {
    throw new Error('Không tìm thấy bản sao lưu của tài khoản này.');
  }
  return draft;
}

export async function discardRecordingBackup(id: string, ownerUserId: string) {
  const draft = await ownedBackup(id, ownerUserId);
  if (draft.uploadAttemptId) {
    const recording = draft.recording;
    const assets = UPLOAD_KINDS.flatMap((kind) => {
      const asset = recording?.assets?.[kind];
      const blob = asset?.blob ?? (kind === 'composite' ? recording?.blob : undefined);
      return blob ? [{ kind, mimeType: asset?.mimeType || blob.type || recording?.mimeType || 'video/webm', size: blob.size }] : [];
    });
    const response = await fetch('/api/recording-uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', id: draft.uploadAttemptId, localId: recording?.localId ?? draft.id, assets }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Chưa thể huỷ phiên tải lên. Vui lòng thử lại.');
    // The existing endpoint protects completed recordings and schedules cleanup
    // only for cancelled attempts. No cloud recording DELETE is ever issued here.
  }
  await deleteRecordingBackup(id);
}

export async function loadRecordingBackupPreview(
  id: string,
  ownerUserId: string,
  { repairDuration = true }: { repairDuration?: boolean } = {},
): Promise<Blob> {
  const draft = await ownedBackup(id, ownerUserId);
  const finalized = draft.recording?.blob ?? draft.recording?.assets?.composite?.blob;
  if (finalized) return finalized;
  const composite = draft.assets?.composite;
  const chunks = composite?.chunks ?? draft.chunks;
  if (!chunks?.length) throw new Error('Bản sao lưu này không có video để xem trước.');
  const blob = new Blob(chunks, { type: composite?.mimeType ?? draft.mimeType ?? 'video/webm' });
  return repairDuration && blob.type.includes('webm') ? repairWebmDuration(blob, draft.durationMs) : blob;
}
