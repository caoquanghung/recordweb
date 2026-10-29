import type { SessionState, UploadState } from './studioConfig';

export function getRecordingLeaveWarning({
  session,
  uploadState,
  titleRequired,
  titleSaving,
}: {
  session: SessionState;
  uploadState: UploadState;
  titleRequired: boolean;
  titleSaving: boolean;
}): string | null {
  if (session === 'processing') {
    return 'Your recording is still being prepared. Leaving now can interrupt processing and lose files that have not been backed up.';
  }
  if (uploadState === 'uploading' || uploadState === 'saving' || (session === 'review' && uploadState === 'idle')) {
    return 'Your recording is still being saved. Leaving now can interrupt the upload or prevent it from appearing in your Library. Keep this page open until saving finishes.';
  }
  if (uploadState === 'error') {
    return 'Your recording has not finished saving. Stay on this page and try saving again. If you leave, recovery may be incomplete and the upload will not resume automatically.';
  }
  if (titleSaving) {
    return 'Your recording title and local backup are still being saved. Please wait for saving to finish before leaving.';
  }
  if (titleRequired) {
    return 'Your recording still needs a title. Stay on this page to name it and finish saving your local backup.';
  }
  return null;
}
