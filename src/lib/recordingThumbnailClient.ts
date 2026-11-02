import { cacheRecordingBackupThumbnail, getRecordingBackupThumbnail, cacheCloudRecordingThumbnail, getCloudRecordingThumbnail } from '@/lib/idb';
import { loadRecordingBackupPreview } from '@/lib/recordingBackupClient';
import { hasVisibleThumbnailPixels, thumbnailSeekTimes } from '@/lib/recordingThumbnailPolicy';

function firstFrameImage(source: Blob | string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    if (typeof source === 'string') video.crossOrigin = 'anonymous';
    video.preload = typeof source === 'string' ? 'metadata' : 'auto';
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    let started = false;
    let finishFrameWait: (() => void) | undefined;
    let finishSeekWait: (() => void) | undefined;

    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      video.onloadeddata = null;
      video.onerror = null;
      finishFrameWait?.();
      finishSeekWait?.();
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (typeof source !== 'string') URL.revokeObjectURL(url);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const onAbort = () => fail(signal.reason);
    const timeout = window.setTimeout(() => fail(new Error('Video thumbnail decoding timed out.')), 10_000);

    const waitForFrame = () => new Promise<void>((done) => {
      let frame: number | undefined;
      const finish = () => {
        window.clearTimeout(timer);
        if (frame !== undefined) video.cancelVideoFrameCallback?.(frame);
        finishFrameWait = undefined;
        done();
      };
      finishFrameWait = finish;
      const timer = window.setTimeout(finish, 120);
      // loadeddata alone does not guarantee a useful, nonblank preview frame.
      if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(finish);
    });
    const seek = (time: number) => new Promise<void>((done, failSeek) => {
      const finish = () => {
        video.onseeked = null;
        finishSeekWait = undefined;
        done();
      };
      finishSeekWait = finish;
      video.onseeked = finish;
      try { video.currentTime = time; } catch (cause) {
        video.onseeked = null;
        finishSeekWait = undefined;
        failSeek(cause);
      }
    });

    video.onloadeddata = () => {
      if (started || settled) return;
      started = true;
      void (async () => {
        if (!video.videoWidth || !video.videoHeight) throw new Error('No video frame is available.');
        const scale = Math.min(1, 480 / video.videoWidth, 270 / video.videoHeight);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Thumbnail rendering is unavailable.');
        const times = Number.isFinite(video.duration) || video.seekable.length > 0
          ? thumbnailSeekTimes(video.duration) : [];
        for (const time of [null, ...times]) {
          if (time !== null) await seek(time);
          if (settled) return;
          await waitForFrame();
          if (settled) return;
          signal.throwIfAborted();
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!hasVisibleThumbnailPixels(pixels)) continue;
          const image = canvas.toDataURL('image/jpeg', 0.75);
          settled = true;
          cleanup();
          resolve(image);
          return;
        }
        throw new Error('No visible thumbnail frame was found near the start of the video.');
      })().catch(fail);
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

function enqueueThumbnail(action: () => Promise<string>): Promise<string> {
  const task = thumbnailQueue.catch(() => undefined).then(action);
  thumbnailQueue = task;
  return task;
}

export function loadRecordingBackupThumbnail(id: string, ownerUserId: string, signal: AbortSignal): Promise<string> {
  return enqueueThumbnail(async () => {
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
}

export function loadCloudRecordingThumbnail(id: string, ownerUserId: string, sourceUrl: string, signal: AbortSignal): Promise<string> {
  return enqueueThumbnail(async () => {
    signal.throwIfAborted();
    const cached = await getCloudRecordingThumbnail(id, ownerUserId, sourceUrl);
    signal.throwIfAborted();
    if (cached) return cached;
    const image = await firstFrameImage(sourceUrl, signal);
    signal.throwIfAborted();
    try {
      await cacheCloudRecordingThumbnail(id, ownerUserId, sourceUrl, image);
    } catch {
      // The frame remains usable when the optional browser cache is full.
    }
    return image;
  });
}
