(() => {
  if (globalThis.__recordWebCursorTrackerInstalled) return;
  globalThis.__recordWebCursorTrackerInstalled = true;

  const SAMPLE_RATE_HZ = 24;
  const CONTROLS_AUTO_HIDE_MS = 3200;
  const CAPTURE_HANDLE_ATTRIBUTE = 'data-recordweb-capture-handle';
  const FRAME_POINTER_EVENT = 'recordweb:cursor-frame-pointer';
  const PREPARE_CAPTURE_HANDLE_EVENT = 'recordweb:prepare-capture-handle';
  const TRACKER_PORT_NAME = 'recordweb-tracker';
  const RECONNECT_DELAYS_MS = [0, 100, 250, 500, 1000, 2500, 5000];
  // Retain the pre-session handoff module for future experiments without
  // showing a redundant Ready pill while target tabs prepare in background.
  const ENABLE_PRESESSION_READY_CONTROLS = true;
  let port = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let captureHandleRetryTimer = null;
  let sessionId = null;
  let timer = null;
  let activeStartedAt = 0;
  let accumulatedMs = 0;
  let sampleIndex = 0;
  let cursor = { x: null, y: null, visible: false };
  let controls = null;
  let framePointerLogged = false;

  function registerCaptureHandle(attempt = 0) {
    const handle = document.documentElement?.getAttribute(CAPTURE_HANDLE_ATTRIBUTE);
    if (handle) {
      captureHandleRetryTimer = null;
      postToExtension({ type: 'CAPTURE_HANDLE_READY', handle });
      return;
    }
    if (attempt < 100) {
      captureHandleRetryTimer = window.setTimeout(() => registerCaptureHandle(attempt + 1), 50);
    }
  }

  function restartCaptureHandleRegistration() {
    if (captureHandleRetryTimer !== null) window.clearTimeout(captureHandleRetryTimer);
    captureHandleRetryTimer = null;
    registerCaptureHandle();
  }

  function scheduleReconnect() {
    if (reconnectTimer !== null || !chrome.runtime?.id) return;
    const delayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectPort();
    }, delayMs);
  }

  function connectPort() {
    if (port || !chrome.runtime?.id) return port;
    let connectedPort;
    try {
      connectedPort = chrome.runtime.connect({ name: TRACKER_PORT_NAME });
    } catch {
      scheduleReconnect();
      return null;
    }

    port = connectedPort;
    connectedPort.onMessage.addListener((message) => {
      if (port !== connectedPort) return;
      reconnectAttempt = 0;
      handleExtensionMessage(message);
    });
    connectedPort.onDisconnect.addListener(() => {
      if (port !== connectedPort) return;
      port = null;
      scheduleReconnect();
    });
    restartCaptureHandleRegistration();
    postToExtension({
      type: 'TRACKER_STATE',
      sessionId,
      paused: Boolean(sessionId && !activeStartedAt),
      timestampMs: Math.round(activeTimestamp()),
      nextSampleIndex: sampleIndex,
    });
    return connectedPort;
  }

  function controlsParent() {
    return document.fullscreenElement || document.body || document.documentElement;
  }

  function createControls(mode = 'recording') {
    if (controls?.host.isConnected) {
      controls.state.mode = mode;
      controls.render();
      return controls;
    }
    if (controls) destroyControls();

    const host = document.createElement('div');
    host.id = 'recordweb-presentation-controls';
    host.setAttribute('data-recordweb-extension-ui', 'true');
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          right: max(18px, env(safe-area-inset-right));
          bottom: max(18px, env(safe-area-inset-bottom));
          z-index: 2147483647;
          color-scheme: dark;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          pointer-events: auto;
        }
        .dock {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          min-height: 42px;
          border: 1px solid rgba(255,255,255,.16);
          border-radius: 15px;
          background: rgba(13, 17, 23, .88);
          box-shadow: 0 12px 36px rgba(0,0,0,.34), inset 0 1px 0 rgba(255,255,255,.06);
          backdrop-filter: blur(16px) saturate(1.2);
          -webkit-backdrop-filter: blur(16px) saturate(1.2);
          overflow: hidden;
          user-select: none;
          transition: border-color 160ms ease, box-shadow 160ms ease;
        }
        .dock[data-expanded="true"] {
          border-color: rgba(120, 141, 255, .42);
          box-shadow: 0 16px 44px rgba(0,0,0,.4), 0 0 0 1px rgba(120,141,255,.08);
        }
        .dock[data-mode="ready"] .recording-dot {
          background: #35d6aa;
          box-shadow: 0 0 0 4px rgba(53,214,170,.14);
          animation: none;
        }
        button {
          appearance: none;
          border: 0;
          color: #f7f8fb;
          background: transparent;
          font: inherit;
          cursor: pointer;
        }
        button:focus-visible {
          outline: 2px solid #8ea0ff;
          outline-offset: -3px;
        }
        .launcher {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 42px;
          padding: 0 13px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .01em;
          white-space: nowrap;
        }
        .recording-dot {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ff5263;
          box-shadow: 0 0 0 4px rgba(255,82,99,.14);
          animation: pulse 1.8s ease-in-out infinite;
        }
        .controls {
          display: flex;
          align-items: center;
          width: 0;
          opacity: 0;
          visibility: hidden;
          transform: translateX(8px);
          transition: width 180ms ease, opacity 140ms ease, transform 180ms ease, visibility 0s linear 180ms;
        }
        .dock[data-expanded="true"] .controls {
          width: 306px;
          opacity: 1;
          visibility: visible;
          transform: translateX(0);
          transition-delay: 0s;
        }
        .dock[data-mode="ready"][data-expanded="true"] .controls { width: 174px; }
        .separator {
          width: 1px;
          height: 22px;
          flex: 0 0 auto;
          background: rgba(255,255,255,.12);
        }
        .control {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 42px;
          padding: 0 10px;
          font-size: 11px;
          font-weight: 650;
          white-space: nowrap;
          border-radius: 10px;
        }
        .control:hover { background: rgba(255,255,255,.09); }
        .control[data-active="false"] { color: #aeb5c4; }
        .control.end {
          margin: 5px;
          height: 32px;
          padding: 0 11px;
          color: #fff;
          background: #d83d50;
        }
        .control.end:hover { background: #ed4a5e; }
        .ready-action {
          display: none;
          align-items: center;
          justify-content: center;
          height: 32px;
          margin: 5px;
          padding: 0 12px;
          border-radius: 10px;
          color: #071712;
          background: linear-gradient(135deg, #5be0ba, #38cfa7);
          font-size: 11px;
          font-weight: 750;
          white-space: nowrap;
        }
        .ready-action:hover { background: linear-gradient(135deg, #72ebc9, #48dab2); }
        .dock[data-mode="ready"] .ready-action { display: inline-flex; }
        .dock[data-mode="ready"] .separator,
        .dock[data-mode="ready"] .control { display: none; }
        .icon { font-size: 14px; line-height: 1; }
        @keyframes pulse { 50% { opacity: .62; transform: scale(.88); } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation: none !important; transition-duration: 0s !important; }
        }
      </style>
      <div class="dock" data-expanded="false" data-mode="recording" role="toolbar" aria-label="RecordWeb recording controls">
        <button class="launcher" type="button" aria-expanded="false" title="Show RecordWeb controls">
          <span class="recording-dot" aria-hidden="true"></span>
          <span class="status-label">Recording</span>
        </button>
        <div class="controls">
          <button class="ready-action" type="button" title="Start recording with the connected RecordWeb Studio">Start recording</button>
          <span class="separator" aria-hidden="true"></span>
          <button class="control pause" type="button" title="Pause or resume recording"><span class="icon" aria-hidden="true">Ⅱ</span><span class="label">Pause</span></button>
          <button class="control microphone" type="button" data-active="true" title="Mute or unmute microphone"><span class="icon" aria-hidden="true">●</span><span class="label">Mic</span></button>
          <button class="control camera" type="button" data-active="true" title="Show or hide camera"><span class="icon" aria-hidden="true">◆</span><span class="label">Camera</span></button>
          <button class="control end" type="button" title="End recording and disconnect all sources">End session</button>
        </div>
      </div>
    `;

    const dock = shadow.querySelector('.dock');
    const launcher = shadow.querySelector('.launcher');
    const statusLabel = shadow.querySelector('.status-label');
    const readyButton = shadow.querySelector('.ready-action');
    const pauseButton = shadow.querySelector('.pause');
    const microphoneButton = shadow.querySelector('.microphone');
    const cameraButton = shadow.querySelector('.camera');
    const endButton = shadow.querySelector('.end');
    const state = { mode, expanded: false, paused: false, microphoneActive: true, cameraActive: true };
    let autoHideTimer = null;

    const render = () => {
      dock.dataset.expanded = String(state.expanded);
      dock.dataset.mode = state.mode;
      dock.setAttribute('aria-label', state.mode === 'ready' ? 'RecordWeb start recording control' : 'RecordWeb recording controls');
      launcher.setAttribute('aria-expanded', String(state.expanded));
      launcher.title = state.mode === 'ready' ? 'Start recording from this presentation tab' : 'Show RecordWeb controls';
      statusLabel.textContent = state.mode === 'ready' ? 'Ready to record' : 'Recording';
      pauseButton.querySelector('.icon').textContent = state.paused ? '▶' : 'Ⅱ';
      pauseButton.querySelector('.label').textContent = state.paused ? 'Resume' : 'Pause';
      microphoneButton.dataset.active = String(state.microphoneActive);
      microphoneButton.querySelector('.label').textContent = state.microphoneActive ? 'Mic' : 'Muted';
      cameraButton.dataset.active = String(state.cameraActive);
      cameraButton.querySelector('.label').textContent = state.cameraActive ? 'Camera' : 'Hidden';
    };
    const clearAutoHide = () => {
      if (autoHideTimer !== null) window.clearTimeout(autoHideTimer);
      autoHideTimer = null;
    };
    const collapse = () => {
      clearAutoHide();
      state.expanded = false;
      render();
    };
    const scheduleAutoHide = () => {
      clearAutoHide();
      autoHideTimer = window.setTimeout(collapse, CONTROLS_AUTO_HIDE_MS);
    };
    const expand = () => {
      state.expanded = true;
      render();
      scheduleAutoHide();
    };
    const relay = (command) => {
      postToExtension({ type: 'PRESENTATION_COMMAND', command });
      scheduleAutoHide();
    };
    const stopSlidesInteraction = (event) => event.stopPropagation();

    launcher.addEventListener('click', () => state.expanded ? collapse() : expand());
    dock.addEventListener('pointerenter', expand);
    dock.addEventListener('pointermove', () => state.expanded ? scheduleAutoHide() : expand());
    dock.addEventListener('pointerdown', stopSlidesInteraction);
    dock.addEventListener('click', stopSlidesInteraction);
    readyButton.addEventListener('click', () => {
      collapse();
      postToExtension({ type: 'PRESENTATION_COMMAND', command: 'start' });
    });
    pauseButton.addEventListener('click', () => {
      state.paused = !state.paused;
      render();
      relay('toggle-pause');
    });
    microphoneButton.addEventListener('click', () => {
      state.microphoneActive = !state.microphoneActive;
      render();
      relay('toggle-microphone');
    });
    cameraButton.addEventListener('click', () => {
      state.cameraActive = !state.cameraActive;
      render();
      relay('toggle-camera');
    });
    endButton.addEventListener('click', () => {
      destroyControls();
      postToExtension({ type: 'PRESENTATION_COMMAND', command: 'end-session' });
    });

    controlsParent().appendChild(host);
    controls = { host, state, render, clearAutoHide };
    render();
    return controls;
  }

  function destroyControls() {
    if (!controls) return;
    controls.clearAutoHide();
    controls.host.remove();
    controls = null;
  }

  function moveControlsToFullscreenSurface() {
    if (!controls?.host.isConnected) return;
    controlsParent().appendChild(controls.host);
  }

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
    postToExtension({
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

  function postToExtension(message) {
    const connectedPort = port ?? connectPort();
    if (!connectedPort) return false;
    try {
      connectedPort.postMessage(message);
      return true;
    } catch {
      if (port === connectedPort) port = null;
      scheduleReconnect();
      return false;
    }
  }

  function clearSampler() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function startSampler(nextSessionId, offsetMs = 0, startIndex = 0) {
    clearSampler();
    sessionId = nextSessionId;
    accumulatedMs = Math.max(0, offsetMs);
    activeStartedAt = performance.now();
    sampleIndex = Math.max(0, startIndex);
    createControls('recording');
    publishSample();
    timer = window.setInterval(publishSample, 1000 / SAMPLE_RATE_HZ);
  }

  function pauseSampler() {
    if (!sessionId || !activeStartedAt) return;
    accumulatedMs += performance.now() - activeStartedAt;
    activeStartedAt = 0;
    clearSampler();
    if (controls) {
      controls.state.paused = true;
      controls.render();
    }
  }

  function resumeSampler() {
    if (!sessionId || activeStartedAt) return;
    activeStartedAt = performance.now();
    if (controls) {
      controls.state.paused = false;
      controls.render();
    }
    timer = window.setInterval(publishSample, 1000 / SAMPLE_RATE_HZ);
  }

  function resetSampler(showReadyControls = false) {
    clearSampler();
    sessionId = null;
    activeStartedAt = 0;
    accumulatedMs = 0;
    sampleIndex = 0;
    if (showReadyControls) createControls('ready');
    else destroyControls();
  }

  function onPointerMove(event) {
    cursor = { x: event.clientX, y: event.clientY, visible: true };
  }

  function onFramePointer(event) {
    const pointer = event.detail;
    if (!pointer || typeof pointer.visible !== 'boolean') return;
    if (!pointer.visible) {
      cursor = { x: null, y: null, visible: false };
      return;
    }
    if (!Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return;
    cursor = { x: pointer.x, y: pointer.y, visible: true };
    if (!framePointerLogged) {
      framePointerLogged = true;
      console.info('[RecordWeb][CursorTracker] receiving pointer events from a presentation frame');
    }
  }

  function onPointerLeave() {
    cursor = { x: null, y: null, visible: false };
  }

  function onWindowBlur() {
    cursor = { x: null, y: null, visible: false };
  }

  function onKeyDown(event) {
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
    if (command === 'toggle-pause' && controls) {
      controls.state.paused = !controls.state.paused;
      controls.render();
    }
    postToExtension({ type: 'PRESENTATION_COMMAND', command });
  }

  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  document.addEventListener(FRAME_POINTER_EVENT, onFramePointer);
  document.addEventListener('pointerleave', onPointerLeave, { capture: true, passive: true });
  window.addEventListener('blur', onWindowBlur, { passive: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('fullscreenchange', moveControlsToFullscreenSurface);
  function handleExtensionMessage(message) {
    if (ENABLE_PRESESSION_READY_CONTROLS && message.type === 'PRESENTATION_READY' && !sessionId) {
      createControls('ready');
    }
    if (message.type === 'CURSOR_START' && message.sessionId) {
      startSampler(message.sessionId, message.offsetMs, message.startIndex);
      if (message.requestId) {
        postToExtension({
          type: 'CURSOR_STARTED',
          requestId: message.requestId,
          sessionId: message.sessionId,
        });
      }
    }
    if (message.type === 'CURSOR_PAUSE' && message.sessionId === sessionId) pauseSampler();
    if (message.type === 'CURSOR_RESUME' && message.sessionId === sessionId) resumeSampler();
    if (message.type === 'CURSOR_STOP' && (!message.sessionId || message.sessionId === sessionId)) {
      const stoppedSessionId = sessionId;
      if (stoppedSessionId) publishSample();
      const lastSampleIndex = sampleIndex - 1;
      resetSampler(ENABLE_PRESESSION_READY_CONTROLS);
      if (message.requestId && stoppedSessionId) {
        postToExtension({
          type: 'CURSOR_STOPPED',
          requestId: message.requestId,
          sessionId: stoppedSessionId,
          lastSampleIndex,
        });
      }
    }
    if (message.type === 'CURSOR_RESET' && (!message.sessionId || message.sessionId === sessionId)) resetSampler();
    if (message.type === 'DISCONNECT') resetSampler();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'PREPARE_CAPTURE_HANDLE') return;
    document.dispatchEvent(new Event(PREPARE_CAPTURE_HANDLE_EVENT));
    restartCaptureHandleRegistration();
  });

  connectPort();
})();
