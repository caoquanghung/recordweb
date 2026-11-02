import { cacheRecordingBackupThumbnail, getRecordingBackupThumbnail } from '@/lib/idb';
import { loadRecordingBackupPreview } from '@/lib/recordingBackupClient';

function firstFrameImage(blob: Blob, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      video.onloadeddata = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
    };
    const fail = (reason: unknown) => { cleanup(); reject(reason); };
    const onAbort = () => fail(signal.reason);
    const timeout = window.setTimeout(() => fail(new Error('Video thumbnail decoding timed out.')), 10_000);

    video.onloadeddata = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) throw new Error('No video frame is available.');
        const scale = Math.min(1, 480 / video.videoWidth, 270 / video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Thumbnail rendering is unavailable.');
        // loadeddata supplies the initial decoded frame at time zero; no playback or seek.
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = canvas.toDataURL('image/jpeg', 0.75);
        cleanup();
        resolve(image);
      } catch (cause) {
        fail(cause);
      }
    };
    video.onerror = () => fail(new Error('Could not decode the recording thumbnail.'));
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      video.src = url;
      video.load();
    } catch (cause) {
      fail(cause);
    }
  });
}

// Only one full backup and one decoder are active at a time, even across cards.
let thumbnailQueue: Promise<unknown> = Promise.resolve();

export function loadRecordingBackupThumbnail(id: string, ownerUserId: string, signal: AbortSignal): Promise<string> {
  const task = thumbnailQueue.catch(() => undefined).then(async () => {
    signal.throwIfAborted();
    const cached = await getRecordingBackupThumbnail(id, ownerUserId);
    signal.throwIfAborted();
    if (cached) return cached;
    // Raw checkpoints need only their initial frame, not a full WebM duration rewrite.
    const blob = await loadRecordingBackupPreview(id, ownerUserId, { repairDuration: false });
    signal.throwIfAborted();
    const image = await firstFrameImage(blob, signal);
    signal.throwIfAborted();
    try {
      await cacheRecordingBackupThumbnail(id, ownerUserId, image);
    } catch {
      // An optional thumbnail cache must not prevent display when storage is full.
    }
    return image;
  });
  thumbnailQueue = task;
  return task;
}
