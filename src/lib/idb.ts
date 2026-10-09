import { get, set, del, keys } from 'idb-keyval';
import { RecordingMetadata } from '@/types/recording';

const RECORDINGS_KEY_PREFIX = 'recordweb_rec_';

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
