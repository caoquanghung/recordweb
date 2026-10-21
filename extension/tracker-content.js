(() => {
  if (globalThis.__recordWebCursorTrackerInstalled) return;
  globalThis.__recordWebCursorTrackerInstalled = true;

  const SAMPLE_RATE_HZ = 24;
  const CONTROLS_AUTO_HIDE_MS = 3200;
  // Retain the pre-session handoff module for future experiments without
  // showing a redundant Ready pill while target tabs prepare in background.
  const ENABLE_PRESESSION_READY_CONTROLS = false;
  const port = chrome.runtime.connect({ name: 'recordweb-tracker' });
  let disconnected = false;
  let sessionId = null;
  let timer = null;
  let activeStartedAt = 0;
  let accumulatedMs = 0;
  let sampleIndex = 0;
  let cursor = { x: null, y: null, visible: false };
  let controls = null;

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
          <button class="ready-action" type="button" title="Return to RecordWeb to start recording">Continue in RecordWeb</button>
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
      launcher.title = state.mode === 'ready' ? 'Return to RecordWeb to start recording' : 'Show RecordWeb controls';
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
      postToExtension({ type: 'PRESENTATION_COMMAND', command: 'return-to-start' });
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
    if (!sessionId || disconnected) return;
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
    if (disconnected) return false;
    try {
      port.postMessage(message);
      return true;
    } catch {
      teardown(false);
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

  function teardown(disconnectPort) {
    if (disconnected) return;
    disconnected = true;
    resetSampler();
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerleave', onPointerLeave, true);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('fullscreenchange', moveControlsToFullscreenSurface);
    document.removeEventListener('keydown', onKeyDown, true);
    globalThis.__recordWebCursorTrackerInstalled = false;
    if (disconnectPort) {
      try {
        port.disconnect();
      } catch {
        // The port may already be disconnected by an extension reload.
      }
    }
  }

  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  document.addEventListener('pointerleave', onPointerLeave, { capture: true, passive: true });
  window.addEventListener('blur', onWindowBlur, { passive: true });
  document.addEventListener('keydown', onKeyDown, { capture: true });
  document.addEventListener('fullscreenchange', moveControlsToFullscreenSurface);

  port.onMessage.addListener((message) => {
    if (ENABLE_PRESESSION_READY_CONTROLS && message.type === 'PRESENTATION_READY' && !sessionId) {
      createControls('ready');
    }
    if (message.type === 'CURSOR_START' && message.sessionId) {
      startSampler(message.sessionId, message.offsetMs, message.startIndex);
    }
    if (message.type === 'CURSOR_PAUSE' && message.sessionId === sessionId) pauseSampler();
    if (message.type === 'CURSOR_RESUME' && message.sessionId === sessionId) resumeSampler();
    if (message.type === 'CURSOR_STOP' && (!message.sessionId || message.sessionId === sessionId)) {
      resetSampler(ENABLE_PRESESSION_READY_CONTROLS);
    }
    if (message.type === 'CURSOR_RESET' && (!message.sessionId || message.sessionId === sessionId)) resetSampler();
    if (message.type === 'DISCONNECT') resetSampler();
  });
  port.onDisconnect.addListener(() => teardown(false));
})();
