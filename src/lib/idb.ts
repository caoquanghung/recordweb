import { get, set, del, keys, setMany, delMany, update, createStore, promisifyRequest } from 'idb-keyval';
import { CursorTrajectory, RecordingAssetKind, RecordingMetadata } from '@/types/recording';
import { notifyRecordingRecoveryChanged } from '@/lib/recordingRecoveryEvents';
import { RECORDING_THUMBNAIL_VERSION } from '@/lib/recordingThumbnailPolicy';

const RECORDINGS_KEY_PREFIX = 'recordweb_rec_';
const DRAFTS_KEY_PREFIX = 'recordweb_draft_';
const DRAFT_INDEX_PREFIX = 'recordweb_draftIndex_';
const THUMBNAIL_KEY_PREFIX = 'recordweb_thumbnail_';
const cloudThumbnailKey = (ownerUserId: string, id: string) => `recordweb_cloudThumbnail_${encodeURIComponent(ownerUserId)}_${id}`;
// Use the same database/store as idb-keyval's existing default store.
const thumbnailStore = createStore('keyval-store', 'keyval');

export interface RecordingDraft {
  id: string;
  startedAt: string;
  durationMs: number;
  /** Cursor samples persisted alongside the media checkpoint during recording. */
  cursor?: CursorTrajectory;
  ownerUserId?: string;
  /** Complete finalized files, including cursor JSON; written before cloud upload. */
  recording?: RecordingMetadata;
  uploadAttemptId?: string;
  cloudRecordingId?: string;
  uploadSettings?: Record<string, unknown>;
  assets?: Partial<Record<RecordingAssetKind, {
    mimeType: string;
    chunks: Blob[];
    resolution?: string;
    fps?: number;
    sampleRateHz?: number;
  }>>;
  /** Legacy single-output draft fields retained for recovery compatibility. */
  mimeType?: string;
  chunks?: Blob[];
}

export async function saveLocalRecording(recording: RecordingMetadata): Promise<void> {
  const key = `${RECORDINGS_KEY_PREFIX}${recording.id}`;
  await set(key, recording);
}

export async function getLocalRecording(id: string): Promise<RecordingMetadata | undefined> {
  const key = `${RECORDINGS_KEY_PREFIX}${id}`;
  return await get<RecordingMetadata>(key);
}

export async function getAllLocalRecordings(): Promise<RecordingMetadata[]> {
  const allKeys = await keys();
  const recKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(RECORDINGS_KEY_PREFIX));
  const results: RecordingMetadata[] = [];
  for (const k of recKeys) {
    const item = await get<RecordingMetadata>(k);
    if (item) {
      results.push(item);
    }
  }
  return results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getLocalRecordingCount(): Promise<number> {
  return (await keys()).filter((key) => typeof key === 'string' && key.startsWith(RECORDINGS_KEY_PREFIX)).length;
}

export async function deleteLocalRecording(id: string): Promise<void> {
  const key = `${RECORDINGS_KEY_PREFIX}${id}`;
  await del(key);
}

export async function saveRecordingDraft(draft: RecordingDraft): Promise<void> {
  const { id, startedAt, durationMs, ownerUserId } = draft;
  await setMany([
    [`${DRAFTS_KEY_PREFIX}${id}`, draft],
    [`${DRAFT_INDEX_PREFIX}${id}`, { id, startedAt, durationMs, ownerUserId, finalized: Boolean(draft.recording) }],
  ]);
  // Raw checkpoints can arrive several times per second. Refresh UI summaries
  // only for finalized backups; interrupted raw drafts are discovered on reload/focus.
  if (draft.recording) notifyRecordingRecoveryChanged();
}

export type RecordingDraftSummary = Pick<RecordingDraft, 'id' | 'startedAt' | 'durationMs' | 'ownerUserId'> & { finalized?: boolean };

export async function getRecordingDraft(id: string): Promise<RecordingDraft | undefined> {
  return get<RecordingDraft>(`${DRAFTS_KEY_PREFIX}${id}`);
}

export async function updateRecordingDraft(
  id: string,
  patch: Partial<RecordingDraft> | ((draft: RecordingDraft) => Partial<RecordingDraft>),
): Promise<void> {
  await update<RecordingDraft>(`${DRAFTS_KEY_PREFIX}${id}`, (draft) => {
    if (!draft) throw new Error('The local recording backup is unavailable.');
    return { ...draft, ...(typeof patch === 'function' ? patch(draft) : patch), id };
  });
}

export async function getRecordingDraftSummaries(ownerUserId: string): Promise<RecordingDraftSummary[]> {
  const allKeys = await keys();
  const summaries = await Promise.all(allKeys.filter((key) => typeof key === 'string' && key.startsWith(DRAFT_INDEX_PREFIX))
    .map((key) => get<RecordingDraftSummary>(key)));
  const indexed = summaries.filter((item): item is RecordingDraftSummary => Boolean(item));
  // Read legacy full drafts only when they have no lightweight index yet.
  const indexedIds = new Set(indexed.map((item) => item.id));
  for (const key of allKeys) {
    if (typeof key !== 'string' || !key.startsWith(DRAFTS_KEY_PREFIX)) continue;
    const id = key.slice(DRAFTS_KEY_PREFIX.length);
    if (indexedIds.has(id)) continue;
    const draft = await getRecordingDraft(id);
    if (draft) indexed.push({ id, startedAt: draft.startedAt, durationMs: draft.durationMs, ownerUserId: draft.ownerUserId });
  }
  return indexed.filter((item) => !item.ownerUserId || item.ownerUserId === ownerUserId)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export async function getRecordingDrafts(): Promise<RecordingDraft[]> {
  const allKeys = await keys();
  const drafts = await Promise.all(
    allKeys
      .filter((key) => typeof key === 'string' && key.startsWith(DRAFTS_KEY_PREFIX))
      .map((key) => get<RecordingDraft>(key)),
  );
  return drafts
    .filter((draft): draft is RecordingDraft => Boolean(draft))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export async function deleteRecordingDraft(id: string): Promise<void> {
  await delMany([`${DRAFTS_KEY_PREFIX}${id}`, `${DRAFT_INDEX_PREFIX}${id}`, `${THUMBNAIL_KEY_PREFIX}${id}`]);
  notifyRecordingRecoveryChanged();
}

/** Remove this backup and its titled local copy in one IndexedDB transaction. */
export async function deleteRecordingBackup(id: string): Promise<void> {
  await delMany([`${DRAFTS_KEY_PREFIX}${id}`, `${DRAFT_INDEX_PREFIX}${id}`, `${RECORDINGS_KEY_PREFIX}${id}`, `${THUMBNAIL_KEY_PREFIX}${id}`]);
  notifyRecordingRecoveryChanged();
}

export async function getRecordingBackupThumbnail(id: string, ownerUserId: string): Promise<string | undefined> {
  const cached = await get<{ ownerUserId: string; image: string; version?: number }>(`${THUMBNAIL_KEY_PREFIX}${id}`);
  return cached?.ownerUserId === ownerUserId && cached.version === RECORDING_THUMBNAIL_VERSION ? cached.image : undefined;
}

export async function cacheRecordingBackupThumbnail(id: string, ownerUserId: string, image: string): Promise<void> {
  await thumbnailStore('readwrite', (store) => {
    const request = store.getKey(`${DRAFTS_KEY_PREFIX}${id}`);
    request.onsuccess = () => {
      if (!request.result) return;
      // Check the lightweight owner index without reading all media a second time.
      const summaryRequest = store.get(`${DRAFT_INDEX_PREFIX}${id}`);
      summaryRequest.onsuccess = () => {
        const summary = summaryRequest.result as RecordingDraftSummary | undefined;
        // A late decoder must not recreate thumbnail data after backup deletion.
        if (!summary?.ownerUserId || summary.ownerUserId === ownerUserId) {
          store.put({ ownerUserId, image, version: RECORDING_THUMBNAIL_VERSION }, `${THUMBNAIL_KEY_PREFIX}${id}`);
        }
      };
    };
    return promisifyRequest(store.transaction);
  });
}

export async function getCloudRecordingThumbnail(id: string, ownerUserId: string, sourceUrl: string): Promise<string | undefined> {
  const cached = await get<{ sourceUrl: string; image: string; version?: number }>(cloudThumbnailKey(ownerUserId, id));
  return cached?.sourceUrl === sourceUrl && cached.version === RECORDING_THUMBNAIL_VERSION ? cached.image : undefined;
}

export async function cacheCloudRecordingThumbnail(id: string, ownerUserId: string, sourceUrl: string, image: string): Promise<void> {
  const key = cloudThumbnailKey(ownerUserId, id);
  await thumbnailStore('readwrite', (store) => {
    const request = store.getKey(`${key}_deleted`);
    request.onsuccess = () => { if (!request.result) store.put({ sourceUrl, image, version: RECORDING_THUMBNAIL_VERSION }, key); };
    return promisifyRequest(store.transaction);
  });
}

export async function deleteCloudRecordingThumbnail(id: string, ownerUserId: string): Promise<void> {
  const key = cloudThumbnailKey(ownerUserId, id);
  await thumbnailStore('readwrite', (store) => {
    store.put(true, `${key}_deleted`);
    store.delete(key);
    return promisifyRequest(store.transaction);
  });
}
