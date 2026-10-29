(() => {
  if (globalThis.RecordWebTrackerControls) return;

  const TEMPLATE = `
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
      button:focus-visible { outline: 2px solid #8ea0ff; outline-offset: -3px; }
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
      .separator { width: 1px; height: 22px; flex: 0 0 auto; background: rgba(255,255,255,.12); }
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
      .control.end { margin: 5px; height: 32px; padding: 0 11px; color: #fff; background: #d83d50; }
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
        <button class="control microphone" type="button" data-active="true" title="Mute or unmute microphone"><span class="icon" aria-hidden="true">●</span><span class="label">Mic</span></button>
        <button class="control camera" type="button" data-active="true" title="Show or hide camera"><span class="icon" aria-hidden="true">◆</span><span class="label">Camera</span></button>
        <button class="control end" type="button" title="End recording and disconnect all sources">End session</button>
      </div>
    </div>
  `;

  function create({ autoHideMs, getParent, sendCommand }) {
    let mounted = null;

    const destroy = () => {
      if (!mounted) return;
      mounted.clearAutoHide();
      mounted.host.remove();
      mounted = null;
    };

    const show = (mode = 'recording') => {
      if (mounted?.host.isConnected) {
        mounted.state.mode = mode;
        mounted.render();
        return;
      }
      if (mounted) destroy();

      const host = document.createElement('div');
      host.id = 'recordweb-presentation-controls';
      host.setAttribute('data-recordweb-extension-ui', 'true');
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = TEMPLATE;

      const dock = shadow.querySelector('.dock');
      const launcher = shadow.querySelector('.launcher');
      const statusLabel = shadow.querySelector('.status-label');
      const readyButton = shadow.querySelector('.ready-action');
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
        autoHideTimer = window.setTimeout(collapse, autoHideMs);
      };
      const expand = () => {
        state.expanded = true;
        render();
        scheduleAutoHide();
      };
      const relay = (command) => {
        sendCommand(command);
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
        sendCommand('start');
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
        destroy();
        sendCommand('end-session');
      });

      getParent().appendChild(host);
      mounted = { host, state, render, clearAutoHide };
      render();
    };

    const moveToCurrentParent = () => {
      if (mounted?.host.isConnected) getParent().appendChild(mounted.host);
    };

    const setPaused = (paused) => {
      if (!mounted) return;
      mounted.state.paused = paused;
      mounted.render();
    };

    return Object.freeze({ destroy, moveToCurrentParent, setPaused, show });
  }

  globalThis.RecordWebTrackerControls = Object.freeze({ create });
})();
