(() => {
  if (globalThis.RecordWebCursorSampler) return;

  function create({ sampleRateHz, sendSample, controls }) {
    let sessionId = null;
    let timer = null;
    let activeStartedAt = null;
    let accumulatedMs = 0;
    let sampleIndex = 0;
    let cursor = { x: null, y: null, visible: false };

    const viewport = () => ({
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    });

    const activeTimestamp = () => (
      accumulatedMs + (activeStartedAt !== null ? performance.now() - activeStartedAt : 0)
    );

    const publishSample = () => {
      if (!sessionId) return;
      const size = viewport();
      sendSample({
        sessionId,
        viewport: size,
        sample: {
          index: sampleIndex++,
          timestampMs: Math.round(activeTimestamp()),
          x: cursor.visible && cursor.x !== null ? Math.min(1, Math.max(0, cursor.x / size.width)) : null,
          y: cursor.visible && cursor.y !== null ? Math.min(1, Math.max(0, cursor.y / size.height)) : null,
          visible: cursor.visible,
        },
      });
    };

    const clearTimer = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };

    const start = (nextSessionId, offsetMs = 0, startIndex = 0) => {
      clearTimer();
      sessionId = nextSessionId;
      accumulatedMs = Math.max(0, offsetMs);
      activeStartedAt = performance.now();
      sampleIndex = Math.max(0, startIndex);
      controls.show('recording');
      publishSample();
      timer = window.setInterval(publishSample, 1000 / sampleRateHz);
    };

    const pause = () => {
      if (!sessionId || activeStartedAt === null) return;
      accumulatedMs += performance.now() - activeStartedAt;
      activeStartedAt = null;
      clearTimer();
      controls.setPaused(true);
    };

    const resume = () => {
      if (!sessionId || activeStartedAt !== null) return;
      activeStartedAt = performance.now();
      controls.setPaused(false);
      timer = window.setInterval(publishSample, 1000 / sampleRateHz);
    };

    const reset = ({ showReadyControls = false } = {}) => {
      clearTimer();
      sessionId = null;
      activeStartedAt = null;
      accumulatedMs = 0;
      sampleIndex = 0;
      if (showReadyControls) controls.show('ready');
      else controls.destroy();
    };

    const stop = ({ showReadyControls = false } = {}) => {
      const stoppedSessionId = sessionId;
      if (stoppedSessionId) publishSample();
      const lastSampleIndex = sampleIndex - 1;
      reset({ showReadyControls });
      return { stoppedSessionId, lastSampleIndex };
    };

    const updateCursor = (nextCursor) => {
      cursor = nextCursor;
    };

    const getState = () => ({
      sessionId,
      paused: Boolean(sessionId && activeStartedAt === null),
      timestampMs: Math.round(activeTimestamp()),
      nextSampleIndex: sampleIndex,
    });

    return Object.freeze({ getState, pause, reset, resume, start, stop, updateCursor });
  }

  globalThis.RecordWebCursorSampler = Object.freeze({ create });
})();
