/**
 * Runs visual work with requestAnimationFrame while visible and switches to a
 * worker clock while the document is hidden. Browsers pause RAF for background
 * tabs, while media capture still needs fresh canvas frames.
 */
export function startVisibilityAwareFrameLoop(
  callback: (timestamp: number) => void,
  fps: number,
): () => void {
  const intervalMs = 1000 / fps;
  let stopped = false;
  let animationFrame: number | null = null;
  let fallbackTimer: number | null = null;
  let worker: Worker | null = null;

  const stopForeground = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const stopBackground = () => {
    worker?.postMessage({ type: 'stop' });
    if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
    fallbackTimer = null;
  };

  const foregroundFrame = (timestamp: number) => {
    if (stopped || document.hidden) return;
    callback(timestamp);
    animationFrame = requestAnimationFrame(foregroundFrame);
  };

  const backgroundFrame = () => {
    if (!stopped && document.hidden) callback(performance.now());
  };

  const startForeground = () => {
    stopBackground();
    if (animationFrame === null) animationFrame = requestAnimationFrame(foregroundFrame);
  };

  const startBackground = () => {
    stopForeground();
    if (typeof Worker === 'function') {
      try {
        if (!worker) {
          worker = new Worker('/frame-ticker-worker.js', { name: 'recordweb-frame-clock' });
          worker.onmessage = backgroundFrame;
          worker.onerror = () => {
            worker?.terminate();
            worker = null;
            if (!stopped && document.hidden && fallbackTimer === null) {
              fallbackTimer = window.setInterval(backgroundFrame, intervalMs);
            }
          };
        }
        worker.postMessage({ type: 'start', intervalMs });
        return;
      } catch {
        worker?.terminate();
        worker = null;
      }
    }
    fallbackTimer = window.setInterval(backgroundFrame, intervalMs);
  };

  const handleVisibilityChange = () => {
    if (document.hidden) startBackground();
    else startForeground();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  handleVisibilityChange();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    stopForeground();
    stopBackground();
    worker?.terminate();
    worker = null;
  };
}
