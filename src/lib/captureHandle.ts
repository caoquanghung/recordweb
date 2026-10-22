interface CaptureHandleCapableTrack extends MediaStreamTrack {
  getCaptureHandle?: () => { handle?: string } | null;
}

const CAPTURE_HANDLE_WAIT_MS = 2_500;
const CAPTURE_HANDLE_LOG_PREFIX = '[RecordWeb][CaptureHandle]';
const captureHandleReadErrors = new WeakSet<MediaStreamTrack>();

function captureHandleFromTrack(track: CaptureHandleCapableTrack) {
  if (!track.getCaptureHandle) {
    console.warn(`${CAPTURE_HANDLE_LOG_PREFIX} getCaptureHandle() is unavailable`, {
      readyState: track.readyState,
      settings: track.getSettings(),
    });
    return null;
  }

  try {
    const captureHandle = track.getCaptureHandle();
    const handle = captureHandle?.handle || null;
    if (handle) {
      console.info(`${CAPTURE_HANDLE_LOG_PREFIX} handle received`, {
        handle,
        readyState: track.readyState,
        settings: track.getSettings(),
      });
    }
    return handle;
  } catch (error) {
    if (!captureHandleReadErrors.has(track)) {
      captureHandleReadErrors.add(track);
      console.error(`${CAPTURE_HANDLE_LOG_PREFIX} getCaptureHandle() threw`, {
        error,
        readyState: track.readyState,
        settings: track.getSettings(),
      });
    }
    return null;
  }
}

export function waitForCaptureHandle(mediaTrack: MediaStreamTrack): Promise<string | null> {
  const track = mediaTrack as CaptureHandleCapableTrack;
  const startedAt = performance.now();
  const initialHandle = captureHandleFromTrack(track);
  console.info(`${CAPTURE_HANDLE_LOG_PREFIX} wait started`, {
    apiAvailable: Boolean(track.getCaptureHandle),
    initialHandle,
    readyState: track.readyState,
    settings: track.getSettings(),
    timeoutMs: CAPTURE_HANDLE_WAIT_MS,
  });
  if (initialHandle || !track.getCaptureHandle) {
    console.info(`${CAPTURE_HANDLE_LOG_PREFIX} wait completed immediately`, {
      handle: initialHandle,
      reason: initialHandle ? 'initial-handle' : 'api-unavailable',
    });
    return Promise.resolve(initialHandle);
  }

  return new Promise((resolve) => {
    let intervalId = 0;
    let timeoutId = 0;
    let pollCount = 0;
    let settled = false;
    const finish = (handle: string | null, reason: 'capturehandlechange' | 'poll' | 'track-ended' | 'timeout') => {
      if (settled) return;
      settled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      track.removeEventListener('capturehandlechange', handleCaptureHandleChange);
      track.removeEventListener('ended', handleTrackEnded);
      console.info(`${CAPTURE_HANDLE_LOG_PREFIX} wait finished`, {
        elapsedMs: Math.round(performance.now() - startedAt),
        handle,
        pollCount,
        readyState: track.readyState,
        reason,
      });
      resolve(handle);
    };
    const checkHandle = (reason: 'capturehandlechange' | 'poll') => {
      const handle = captureHandleFromTrack(track);
      if (handle) finish(handle, reason);
    };
    const handleCaptureHandleChange = () => {
      console.info(`${CAPTURE_HANDLE_LOG_PREFIX} capturehandlechange event received`);
      checkHandle('capturehandlechange');
    };
    const handleTrackEnded = () => {
      console.warn(`${CAPTURE_HANDLE_LOG_PREFIX} track ended while waiting`);
      finish(null, 'track-ended');
    };

    track.addEventListener('capturehandlechange', handleCaptureHandleChange);
    track.addEventListener('ended', handleTrackEnded, { once: true });
    intervalId = window.setInterval(() => {
      pollCount += 1;
      if (pollCount % 10 === 0) {
        console.debug(`${CAPTURE_HANDLE_LOG_PREFIX} still waiting`, {
          elapsedMs: Math.round(performance.now() - startedAt),
          pollCount,
          readyState: track.readyState,
        });
      }
      checkHandle('poll');
    }, 50);
    timeoutId = window.setTimeout(() => finish(null, 'timeout'), CAPTURE_HANDLE_WAIT_MS);
  });
}
