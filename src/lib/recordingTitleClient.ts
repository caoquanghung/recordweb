import { deleteRecordingDraft, saveLocalRecording, updateRecordingDraft } from '@/lib/idb';
import { getRecordingTitleError, normalizeRecordingTitle } from '@/lib/recordingTitle';
import type { DbRecording } from '@/types/database';
import type { RecordingMetadata } from '@/types/recording';
import { notifyCloudRecordingSaved } from '@/lib/cloudLibraryEvents';

/** Coordinates title writes with upload completion for one Review recording. */
export function createRecordingTitleSave(recording: RecordingMetadata) {
  let currentRecording = recording;
  let cloudRecording: DbRecording | null = null;
  let completed = false;
  let pending: Promise<unknown> = Promise.resolve();

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = pending.catch(() => undefined).then(action);
    pending = result;
    return result;
  }

  const saveLocally = (value: string) => enqueue(async () => {
    const error = getRecordingTitleError(value);
    if (error) throw new Error(error);
    const titledRecording = { ...currentRecording, title: normalizeRecordingTitle(value) };
    await updateRecordingDraft(recording.id, (draft) => ({
      recording: { ...(draft.recording ?? titledRecording), title: titledRecording.title, previewUrl: undefined },
    }));
    await saveLocalRecording({ ...titledRecording, previewUrl: undefined });
    currentRecording = titledRecording;
    completed = false;
    return titledRecording;
  });

  const syncCloud = () => enqueue(async () => {
    if (!cloudRecording || !currentRecording.title || completed) return cloudRecording;
    if (cloudRecording.title !== currentRecording.title) {
      const response = await fetch('/api/recordings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cloudRecording.id, title: currentRecording.title }),
      });
      const data = await response.json();
      if (!response.ok || !data.recording) {
        throw new Error(data.error ?? 'Could not update the recording title.');
      }
      const updated: DbRecording = { ...cloudRecording, ...data.recording };
      cloudRecording = updated;
      notifyCloudRecordingSaved(updated.user_id, updated);
    }
    // Keep recovery available until cloud title sync AND the full local save succeed.
    await saveLocalRecording({ ...currentRecording, previewUrl: undefined });
    await deleteRecordingDraft(recording.id);
    completed = true;
    return cloudRecording;
  });

  const completeUpload = (saved: DbRecording) => {
    cloudRecording = saved;
    return syncCloud();
  };

  return { saveLocally, syncCloud, completeUpload, get title() { return currentRecording.title; } };
}
