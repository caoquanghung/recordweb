(() => {
  if (globalThis.__recordWebCursorTrackerInstalled) return;
  globalThis.__recordWebCursorTrackerInstalled = true;

  const { MESSAGE, PORT } = globalThis.RecordWebExtensionProtocol;
  const SAMPLE_RATE_HZ = 24;
  const CONTROLS_AUTO_HIDE_MS = 3200;
  const CAPTURE_HANDLE_ATTRIBUTE = 'data-recordweb-capture-handle';
  const FRAME_POINTER_EVENT = 'recordweb:cursor-frame-pointer';
  const PREPARE_CAPTURE_HANDLE_EVENT = 'recordweb:prepare-capture-handle';
  const ENABLE_PRESESSION_READY_CONTROLS = true;
  const CAPTURE_HANDLE_MAX_ATTEMPTS = 100;
  const CAPTURE_HANDLE_RETRY_MS = 50;

  let captureHandleRetryTimer = null;
  let framePointerLogged = false;
  let portClient;

  const controls = globalThis.RecordWebTrackerControls.create({
    autoHideMs: CONTROLS_AUTO_HIDE_MS,
    getParent: () => document.fullscreenElement || document.body || document.documentElement,
    sendCommand: (command) => portClient.send({ type: MESSAGE.PRESENTATION_COMMAND, command }),
  });

  const sampler = globalThis.RecordWebCursorSampler.create({
    sampleRateHz: SAMPLE_RATE_HZ,
    controls,
    sendSample: ({ sessionId, viewport, sample }) => {
      portClient.send({ type: MESSAGE.CURSOR_SAMPLE, sessionId, viewport, sample });
    },
  });

  function registerCaptureHandle(attempt = 0) {
    const handle = document.documentElement?.getAttribute(CAPTURE_HANDLE_ATTRIBUTE);
    if (handle) {
      captureHandleRetryTimer = null;
      portClient.send({ type: MESSAGE.CAPTURE_HANDLE_READY, handle });
      return;
    }
    if (attempt < CAPTURE_HANDLE_MAX_ATTEMPTS) {
      captureHandleRetryTimer = window.setTimeout(
        () => registerCaptureHandle(attempt + 1),
        CAPTURE_HANDLE_RETRY_MS,
      );
    }
  }

  function restartCaptureHandleRegistration() {
    if (captureHandleRetryTimer !== null) window.clearTimeout(captureHandleRetryTimer);
    captureHandleRetryTimer = null;
    registerCaptureHandle();
  }

  function handleExtensionMessage(message) {
    switch (message.type) {
      case MESSAGE.TRACKER_READY:
        restartCaptureHandleRegistration();
        portClient.send({ type: MESSAGE.TRACKER_STATE, ...sampler.getState() });
        break;
      case MESSAGE.PRESENTATION_READY:
        if (ENABLE_PRESESSION_READY_CONTROLS && !sampler.getState().sessionId) controls.show('ready');
        break;
      case MESSAGE.CURSOR_START:
        if (!message.sessionId) break;
        sampler.start(message.sessionId, message.offsetMs, message.startIndex);
        if (message.requestId) {
          portClient.send({
            type: MESSAGE.CURSOR_STARTED,
            requestId: message.requestId,
            sessionId: message.sessionId,
          });
        }
        break;
      case MESSAGE.CURSOR_PAUSE:
        if (message.sessionId === sampler.getState().sessionId) sampler.pause();
        break;
      case MESSAGE.CURSOR_RESUME:
        if (message.sessionId === sampler.getState().sessionId) sampler.resume();
        break;
      case MESSAGE.CURSOR_STOP: {
        const activeSessionId = sampler.getState().sessionId;
        if (message.sessionId && message.sessionId !== activeSessionId) break;
        const { stoppedSessionId, lastSampleIndex } = sampler.stop({
          showReadyControls: ENABLE_PRESESSION_READY_CONTROLS,
        });
        if (message.requestId && stoppedSessionId) {
          portClient.send({
            type: MESSAGE.CURSOR_STOPPED,
            requestId: message.requestId,
            sessionId: stoppedSessionId,
            lastSampleIndex,
          });
        }
        break;
      }
      case MESSAGE.CURSOR_RESET:
        if (!message.sessionId || message.sessionId === sampler.getState().sessionId) sampler.reset();
        break;
      case MESSAGE.DISCONNECT:
        sampler.reset();
        break;
      default:
        break;
    }
  }

  portClient = globalThis.RecordWebResilientPort.create({
    portName: PORT.TRACKER,
    onMessage: handleExtensionMessage,
  });

  function hideCursor() {
    sampler.updateCursor({ x: null, y: null, visible: false });
  }

  function handleFramePointer(event) {
    const pointer = event.detail;
    if (!pointer || typeof pointer.visible !== 'boolean') return;
    if (!pointer.visible) {
      hideCursor();
      return;
    }
    if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return;
    sampler.updateCursor({ x: pointer.x, y: pointer.y, visible: true });
    if (!framePointerLogged) {
      framePointerLogged = true;
      console.info('[RecordWeb][CursorTracker] receiving pointer events from a presentation frame');
    }
  }

  function handleShortcut(event) {
    if (!sampler.getState().sessionId || !event.altKey || event.repeat) return;
    const command = ({
      p: 'toggle-pause',
      s: 'stop',
      m: 'toggle-microphone',
      c: 'toggle-camera',
    })[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    event.stopPropagation();
    if (command === 'toggle-pause') controls.togglePaused();
    portClient.send({ type: MESSAGE.PRESENTATION_COMMAND, command });
  }

  document.addEventListener('pointermove', (event) => {
    sampler.updateCursor({ x: event.clientX, y: event.clientY, visible: true });
  }, { capture: true, passive: true });
  document.addEventListener(FRAME_POINTER_EVENT, handleFramePointer);
  document.addEventListener('pointerleave', hideCursor, { capture: true, passive: true });
  window.addEventListener('blur', hideCursor, { passive: true });
  document.addEventListener('keydown', handleShortcut, { capture: true });
  document.addEventListener('fullscreenchange', controls.moveToCurrentParent);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== MESSAGE.PREPARE_CAPTURE_HANDLE) return;
    document.dispatchEvent(new Event(PREPARE_CAPTURE_HANDLE_EVENT));
    restartCaptureHandleRegistration();
  });

  portClient.connect();
})();
