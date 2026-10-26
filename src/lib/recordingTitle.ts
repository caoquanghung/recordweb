export const MAX_RECORDING_TITLE_LENGTH = 120;

export function normalizeRecordingTitle(value: string): string {
  return value.trim();
}

export function getRecordingTitleError(value: unknown): string | null {
  if (typeof value !== 'string' || normalizeRecordingTitle(value).length === 0) {
    return 'Recording title is required.';
  }
  if (normalizeRecordingTitle(value).length > MAX_RECORDING_TITLE_LENGTH) {
    return `Recording title must be ${MAX_RECORDING_TITLE_LENGTH} characters or fewer.`;
  }
  return null;
}
