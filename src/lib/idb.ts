import { get, set, del, keys } from 'idb-keyval';
import { RecordingMetadata } from '@/types/recording';

const RECORDINGS_KEY_PREFIX = 'recordweb_rec_';
const DRAFTS_KEY_PREFIX = 'recordweb_draft_';

export interface RecordingDraft {
  id: string;
  startedAt: string;
  durationMs: number;
  mimeType: string;
  chunks: Blob[];
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

export async function deleteLocalRecording(id: string): Promise<void> {
  const key = `${RECORDINGS_KEY_PREFIX}${id}`;
  await del(key);
}

export async function saveRecordingDraft(draft: RecordingDraft): Promise<void> {
  await set(`${DRAFTS_KEY_PREFIX}${draft.id}`, draft);
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
  await del(`${DRAFTS_KEY_PREFIX}${id}`);
}
