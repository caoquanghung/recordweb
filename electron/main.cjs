/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } = require('electron');
const path = require('node:path');

const SAMPLE_RATE_HZ = 24;
const SAMPLE_INTERVAL_MS = 1000 / SAMPLE_RATE_HZ;
const DEFAULT_APP_URL = 'http://localhost:3000';

let selectedDisplayId = null;
let captureSession = null;
let mainWindow = null;

function appUrl() {
  const parsed = new URL(process.env.RECORDWEB_URL || DEFAULT_APP_URL);
  const localDevelopment = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !localDevelopment) {
    throw new Error('RECORDWEB_URL must use HTTPS, except for localhost development.');
  }
  return parsed;
}

function senderIsTrusted(event) {
  try {
    return new URL(event.senderFrame.url).origin === appUrl().origin;
  } catch {
    return false;
  }
}

function requireTrustedSender(event) {
  if (!senderIsTrusted(event)) throw new Error('Untrusted cursor helper IPC sender.');
}

function displays() {
  if (process.platform === 'linux' && process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland') {
    throw new Error('Global cursor coordinates are unavailable on Linux Wayland. Use an X11/XWayland session.');
  }
  const primaryId = String(screen.getPrimaryDisplay().id);
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: display.label || `Display ${index + 1}`,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    primary: String(display.id) === primaryId,
  }));
}

function activeElapsedMs(state) {
  return state.accumulatedMs + (state.activeStartedAt === null ? 0 : performance.now() - state.activeStartedAt);
}

function cursorSample(state, timestampMs) {
  const point = screen.getCursorScreenPoint();
  const { x: left, y: top, width, height } = state.display.bounds;
  const normalizedX = (point.x - left) / width;
  const normalizedY = (point.y - top) / height;
  const visible = normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1;
  if (!visible) return null;
  return {
    index: state.samples.length,
    timestampMs: Number(timestampMs.toFixed(3)),
    x: Number(normalizedX.toFixed(6)),
    y: Number(normalizedY.toFixed(6)),
  };
}

function sampleThrough(state, elapsedMs) {
  while (state.nextSampleAtMs <= elapsedMs + 0.25) {
    const sample = cursorSample(state, state.nextSampleAtMs);
    if (sample) state.samples.push(sample);
    state.nextSampleAtMs += SAMPLE_INTERVAL_MS;
  }
}

function startTimer(state) {
  if (state.timer !== null) clearInterval(state.timer);
  sampleThrough(state, activeElapsedMs(state));
  state.timer = setInterval(() => sampleThrough(state, activeElapsedMs(state)), SAMPLE_INTERVAL_MS);
}

function pauseCapture(state) {
  if (state.activeStartedAt === null) return;
  const elapsed = activeElapsedMs(state);
  sampleThrough(state, elapsed);
  state.accumulatedMs = elapsed;
  state.activeStartedAt = null;
  if (state.timer !== null) clearInterval(state.timer);
  state.timer = null;
}

function resetCapture() {
  if (captureSession?.timer != null) clearInterval(captureSession.timer);
  captureSession = null;
}

function registerCursorIpc() {
  ipcMain.handle('cursor:get-displays', (event) => {
    requireTrustedSender(event);
    return displays();
  });
  ipcMain.handle('cursor:select-display', (event, displayId) => {
    requireTrustedSender(event);
    if (typeof displayId !== 'string' || !displays().some((display) => display.id === displayId)) return false;
    selectedDisplayId = displayId;
    return true;
  });
  ipcMain.handle('cursor:start', (event, options) => {
    requireTrustedSender(event);
    if (!options || typeof options.sessionId !== 'string' || typeof options.displayId !== 'string') {
      throw new Error('Invalid cursor capture options.');
    }
    const display = displays().find((item) => item.id === options.displayId);
    if (!display) throw new Error('The selected display is no longer available.');
    resetCapture();
    selectedDisplayId = display.id;
    captureSession = {
      sessionId: options.sessionId,
      display,
      sourceWidth: Math.max(1, Number(options.sourceWidth) || display.bounds.width),
      sourceHeight: Math.max(1, Number(options.sourceHeight) || display.bounds.height),
      cursorBakedIntoScreenVideo: Boolean(options.cursorBakedIntoScreenVideo),
      accumulatedMs: 0,
      activeStartedAt: performance.now(),
      nextSampleAtMs: 0,
      samples: [],
      timer: null,
    };
    startTimer(captureSession);
    return { started: true };
  });
  ipcMain.handle('cursor:pause', (event, sessionId) => {
    requireTrustedSender(event);
    if (captureSession?.sessionId === sessionId) pauseCapture(captureSession);
  });
  ipcMain.handle('cursor:resume', (event, sessionId) => {
    requireTrustedSender(event);
    if (captureSession?.sessionId !== sessionId || captureSession.activeStartedAt !== null) return;
    captureSession.activeStartedAt = performance.now();
    startTimer(captureSession);
  });
  ipcMain.handle('cursor:stop', (event, sessionId, requestedDurationMs) => {
    requireTrustedSender(event);
    if (captureSession?.sessionId !== sessionId) throw new Error('Cursor capture session not found.');
    pauseCapture(captureSession);
    const state = captureSession;
    const durationMs = Math.max(0, Number(requestedDurationMs) || state.accumulatedMs);
    sampleThrough(state, durationMs);
    state.samples = state.samples.filter((sample) => sample.timestampMs < durationMs);
    state.samples.forEach((sample, index) => { sample.index = index; });
    const trajectory = {
      schemaVersion: 2,
      sessionId: state.sessionId,
      sampleRateHz: SAMPLE_RATE_HZ,
      coordinateSpace: {
        origin: 'top-left',
        xRange: [0, 1],
        yRange: [0, 1],
        relativeTo: 'captured-screen-content',
        sourceWidth: state.sourceWidth,
        sourceHeight: state.sourceHeight,
      },
      timeline: {
        clock: 'active-recording-time',
        pausedIntervalsExcluded: true,
        durationMs: Number(durationMs.toFixed(3)),
      },
      tracking: {
        mode: 'native-helper',
        cursorBakedIntoScreenVideo: state.cursorBakedIntoScreenVideo,
        displayId: state.display.id,
        displayLabel: state.display.label,
      },
      samples: state.samples,
    };
    resetCapture();
    return trajectory;
  });
  ipcMain.handle('cursor:reset', (event, sessionId) => {
    requireTrustedSender(event);
    if (sessionId === null || captureSession?.sessionId === sessionId) resetCapture();
  });
}

async function configureDisplayCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const selected = sources.find((source) => source.display_id === selectedDisplayId) || sources[0];
      const streams = selected ? {
        video: selected,
        ...(request.audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {}),
      } : null;
      callback(streams);
    } catch {
      callback(null);
    }
  }, { useSystemPicker: process.platform === 'darwin' });
}

function createWindow() {
  const target = appUrl();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: 'RecordWeb Desktop',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== target.origin) event.preventDefault();
  });
  void mainWindow.loadURL(target.href);
}

app.whenReady().then(async () => {
  if (process.argv.includes('--cursor-helper-smoke')) {
    // Regression guard: reset must be idempotent before any capture starts.
    resetCapture();
    resetCapture();
    const availableDisplays = displays();
    const cursor = screen.getCursorScreenPoint();
    console.log(JSON.stringify({
      cursorHelper: 'ready',
      displayCount: availableDisplays.length,
      primaryDisplayId: availableDisplays.find((display) => display.primary)?.id ?? null,
      cursor,
    }));
    app.quit();
    return;
  }
  registerCursorIpc();
  await configureDisplayCapture();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  resetCapture();
  if (process.platform !== 'darwin') app.quit();
});
