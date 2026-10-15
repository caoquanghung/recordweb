const APP_PORT_NAME = 'recordweb-app';
const TRACKER_PORT_NAME = 'recordweb-tracker';
const APP_URL = chrome.runtime.getManifest().homepage_url;
const APP_ORIGINS = new Set([
  new URL(APP_URL).origin,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

const appPorts = new Map();
const trackerPorts = new Map();
let pendingTarget = null;
let connectingPending = false;
let currentTargetTabId = null;

function sendAppMessage(message) {
  for (const port of appPorts.values()) {
    try {
      port.postMessage(message);
    } catch {
      // A disconnected port is removed by its onDisconnect handler.
    }
  }
}

function setBadge(tabId, text, color) {
  void chrome.action.setBadgeBackgroundColor({ tabId, color });
  void chrome.action.setBadgeText({ tabId, text });
}

function openRecordWeb() {
  return chrome.tabs.create({ url: APP_URL });
}

async function offerCapture(target, appTabId, appPort) {
  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: target.tabId,
      consumerTabId: appTabId,
    });
    appPort.postMessage({ type: 'CAPTURE_OFFER', streamId, target });
    if (currentTargetTabId !== null && currentTargetTabId !== target.tabId) {
      trackerPorts.get(currentTargetTabId)?.postMessage({ type: 'DISCONNECT' });
      void chrome.action.setBadgeText({ tabId: currentTargetTabId, text: '' });
    }
    currentTargetTabId = target.tabId;
    setBadge(target.tabId, 'ON', '#22c58b');
    pendingTarget = null;
    await chrome.tabs.update(appTabId, { active: true });
  } catch (error) {
    setBadge(target.tabId, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: `Could not capture the selected tab: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function connectPendingTarget() {
  if (!pendingTarget || appPorts.size === 0 || connectingPending) return;
  connectingPending = true;
  const [appTabId, appPort] = appPorts.entries().next().value;
  try {
    await offerCapture(pendingTarget, appTabId, appPort);
  } finally {
    connectingPending = false;
  }
}

async function prepareTarget(tab) {
  if (!tab.id) return;
  if (currentTargetTabId !== null) {
    setBadge(tab.id, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: 'A target tab is already connected. Disconnect it in RecordWeb before selecting another tab.',
    });
    return;
  }
  if (!tab.url || /^(chrome|edge|arc|about|chrome-extension):/.test(tab.url)) {
    setBadge(tab.id, '!', '#dc5964');
    return;
  }
  if (APP_ORIGINS.has(new URL(tab.url).origin)) {
    setBadge(tab.id, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: 'Select the content tab you want to record, not the RecordWeb studio tab.',
    });
    return;
  }

  pendingTarget = {
    tabId: tab.id,
    title: tab.title || 'Untitled tab',
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['tracker-content.js'],
    });
  } catch (error) {
    pendingTarget = null;
    setBadge(tab.id, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: `Cursor tracking cannot run on this page: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }

  if (appPorts.size === 0) await openRecordWeb();
  else await connectPendingTarget();
}

chrome.action.onClicked.addListener((tab) => {
  void prepareTarget(tab);
});

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;

  if (port.name === APP_PORT_NAME) {
    appPorts.set(tabId, port);
    port.postMessage({ type: 'BRIDGE_READY' });
    port.onMessage.addListener((message) => {
      if (message.type === 'PAGE_READY') {
        port.postMessage({ type: 'BRIDGE_READY' });
        void connectPendingTarget();
      }
      if (message.type === 'DISCONNECT') {
        if (typeof message.targetTabId === 'number') {
          trackerPorts.get(message.targetTabId)?.postMessage(message);
          void chrome.action.setBadgeText({ tabId: message.targetTabId, text: '' });
        }
        currentTargetTabId = null;
        pendingTarget = null;
        return;
      }
      if (message.type?.startsWith('CURSOR_') && typeof message.targetTabId === 'number') {
        const trackerPort = trackerPorts.get(message.targetTabId);
        if (trackerPort) trackerPort.postMessage(message);
        else port.postMessage({ type: 'EXTENSION_ERROR', message: 'The cursor tracker is no longer connected to the selected tab.' });
      }
    });
    port.onDisconnect.addListener(() => appPorts.delete(tabId));
    void connectPendingTarget();
    return;
  }

  if (port.name === TRACKER_PORT_NAME) {
    trackerPorts.set(tabId, port);
    port.onMessage.addListener((message) => {
      if (message.type === 'CURSOR_SAMPLE') sendAppMessage(message);
    });
    port.onDisconnect.addListener(() => {
      trackerPorts.delete(tabId);
      if (currentTargetTabId === tabId) currentTargetTabId = null;
      void chrome.action.setBadgeText({ tabId, text: '' });
      sendAppMessage({ type: 'TARGET_ENDED', message: 'The selected tab navigated, closed, or disconnected from cursor tracking.' });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  appPorts.delete(tabId);
  if (pendingTarget?.tabId === tabId) pendingTarget = null;
  if (currentTargetTabId === tabId) currentTargetTabId = null;
});
