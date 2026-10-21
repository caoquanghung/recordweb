(() => {
  if (globalThis.__recordWebCursorTrackerInstalled) return;
  globalThis.__recordWebCursorTrackerInstalled = true;

  const SAMPLE_RATE_HZ = 24;
  const port = chrome.runtime.connect({ name: 'recordweb-tracker' });
  let sessionId = null;
  let timer = null;
  let activeStartedAt = 0;
  let accumulatedMs = 0;
  let sampleIndex = 0;
  let cursor = { x: null, y: null, visible: false };

  function viewport() {
    return {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    };
  }

  function activeTimestamp() {
    return accumulatedMs + (activeStartedAt ? performance.now() - activeStartedAt : 0);
  }

  function publishSample() {
    if (!sessionId) return;
    const size = viewport();
    port.postMessage({
      type: 'CURSOR_SAMPLE',
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
  }

  function clearSampler() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function startSampler(nextSessionId) {
    clearSampler();
    sessionId = nextSessionId;
    accumulatedMs = 0;
    activeStartedAt = performance.now();
    sampleIndex = 0;
    publishSample();
    timer = window.setInterval(publishSample, 1000 / SAMPLE_RATE_HZ);
  }

  function pauseSampler() {
    if (!sessionId || !activeStartedAt) return;
    accumulatedMs += performance.now() - activeStartedAt;
    activeStartedAt = 0;
    clearSampler();
  }

  function resumeSampler() {
    if (!sessionId || activeStartedAt) return;
    activeStartedAt = performance.now();
    timer = window.setInterval(publishSample, 1000 / SAMPLE_RATE_HZ);
  }

  function resetSampler() {
    clearSampler();
    sessionId = null;
    activeStartedAt = 0;
    accumulatedMs = 0;
    sampleIndex = 0;
  }

  document.addEventListener('pointermove', (event) => {
    cursor = { x: event.clientX, y: event.clientY, visible: true };
  }, { capture: true, passive: true });
  document.addEventListener('pointerleave', () => {
    cursor = { x: null, y: null, visible: false };
  }, { capture: true, passive: true });
  window.addEventListener('blur', () => {
    cursor = { x: null, y: null, visible: false };
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (!sessionId || !event.altKey || event.repeat) return;
    const commandByKey = {
      p: 'toggle-pause',
      s: 'stop',
      m: 'toggle-microphone',
      c: 'toggle-camera',
    };
    const command = commandByKey[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    port.postMessage({ type: 'PRESENTATION_COMMAND', command });
  }, { capture: true });

  port.onMessage.addListener((message) => {
    if (message.type === 'CURSOR_START' && message.sessionId) startSampler(message.sessionId);
    if (message.type === 'CURSOR_PAUSE' && message.sessionId === sessionId) pauseSampler();
    if (message.type === 'CURSOR_RESUME' && message.sessionId === sessionId) resumeSampler();
    if ((message.type === 'CURSOR_STOP' || message.type === 'CURSOR_RESET') && (!message.sessionId || message.sessionId === sessionId)) resetSampler();
    if (message.type === 'DISCONNECT') resetSampler();
  });
  port.onDisconnect.addListener(resetSampler);
})();
