import type { DbRecording } from '@/types/database';

export const CLOUD_RECORDING_SAVED = 'recordweb-cloud-recording-saved';
export const CLOUD_LIBRARY_CHANGED = 'recordweb-cloud-library-changed';

export function notifyCloudLibraryChanged(ownerUserId: string, kind: 'recordings' | 'presets') {
  try {
    localStorage.setItem(CLOUD_LIBRARY_CHANGED, JSON.stringify({ ownerUserId, kind, nonce: crypto.randomUUID() }));
  } catch {
    // Cross-tab synchronization is optional when localStorage is unavailable.
  }
}

export function notifyCloudRecordingSaved(ownerUserId: string, recording: DbRecording) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CLOUD_RECORDING_SAVED, { detail: { ownerUserId, recording } }));
  notifyCloudLibraryChanged(ownerUserId, 'recordings');
}
