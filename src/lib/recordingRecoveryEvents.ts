export const RECORDING_RECOVERY_CHANGED = 'recordweb-recovery-changed';

export function notifyRecordingRecoveryChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(RECORDING_RECOVERY_CHANGED));
  try {
    // Also invalidate summaries in other tabs on this origin; never store media here.
    localStorage.setItem(RECORDING_RECOVERY_CHANGED, crypto.randomUUID());
  } catch {
    // Same-tab updates still work when localStorage is unavailable.
  }
}
