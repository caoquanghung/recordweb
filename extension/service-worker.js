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
let requestedTarget = null;
let requestedAppTabId = null;
let currentAppTabId = null;

function parseGoogleSlidesUrl(value) {
  try {
    const url = new URL(value);
    const slidePath = /^\/presentation\/(?:u\/\d+\/)?d\/[^/]+(?:\/|$)/;
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !slidePath.test(url.pathname)) {
      return null;
    }
    const editableDeckPath = url.pathname.match(
      /^(\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+)(?:\/(?:edit|view|preview|present))?\/?$/,
    );
    if (editableDeckPath) url.pathname = `${editableDeckPath[1]}/present`;
    return url;
  } catch {
    return null;
  }
}

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
    currentAppTabId = appTabId;
    requestedTarget = null;
    requestedAppTabId = null;
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
  const requestedAppPort = requestedAppTabId === null ? null : appPorts.get(requestedAppTabId);
  const [fallbackAppTabId, fallbackAppPort] = appPorts.entries().next().value;
  const appTabId = requestedAppPort ? requestedAppTabId : fallbackAppTabId;
  const appPort = requestedAppPort || fallbackAppPort;
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
  if (requestedTarget && requestedTarget.tabId !== tab.id) {
    setBadge(tab.id, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: 'Authorize the Google Slides tab opened by RecordWeb, not a different tab.',
    });
    await chrome.tabs.update(requestedTarget.tabId, { active: true });
    return;
  }
  if (requestedTarget && !parseGoogleSlidesUrl(tab.url)) {
    setBadge(tab.id, '!', '#dc5964');
    sendAppMessage({
      type: 'EXTENSION_ERROR',
      message: 'The tab opened by RecordWeb is no longer showing a supported Google Slides URL.',
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

async function openGoogleSlides(urlValue, appTabId, appPort) {
  if (currentTargetTabId !== null) {
    appPort.postMessage({
      type: 'EXTENSION_ERROR',
      message: 'Disconnect the current captured tab before opening another Google Slides presentation.',
    });
    return;
  }
  const url = parseGoogleSlidesUrl(urlValue);
  if (!url) {
    appPort.postMessage({ type: 'EXTENSION_ERROR', message: 'RecordWeb received an invalid Google Slides URL.' });
    return;
  }

  try {
    const tab = await chrome.tabs.create({ url: url.href, active: true });
    if (!tab.id) throw new Error('Chrome did not return the new tab ID.');
    requestedTarget = { tabId: tab.id, title: tab.title || 'Google Slides' };
    requestedAppTabId = appTabId;
    appPort.postMessage({ type: 'TARGET_OPENED', target: requestedTarget });
  } catch (error) {
    requestedTarget = null;
    requestedAppTabId = null;
    appPort.postMessage({
      type: 'EXTENSION_ERROR',
      message: `Could not open Google Slides: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
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
      if (message.type === 'OPEN_GOOGLE_SLIDES') {
        void openGoogleSlides(message.url, tabId, port);
        return;
      }
      if (message.type === 'FOCUS_TARGET' && message.targetTabId === currentTargetTabId) {
        void chrome.tabs.update(message.targetTabId, { active: true });
        return;
      }
      if (message.type === 'DISCONNECT') {
        if (typeof message.targetTabId === 'number') {
          trackerPorts.get(message.targetTabId)?.postMessage(message);
          void chrome.action.setBadgeText({ tabId: message.targetTabId, text: '' });
        }
        currentTargetTabId = null;
        currentAppTabId = null;
        pendingTarget = null;
        requestedTarget = null;
        requestedAppTabId = null;
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
      if (message.type === 'PRESENTATION_COMMAND') {
        sendAppMessage(message);
        if (message.command === 'stop') {
          const appTabId = currentAppTabId ?? appPorts.keys().next().value;
          if (typeof appTabId === 'number') void chrome.tabs.update(appTabId, { active: true });
        }
      }
    });
    port.onDisconnect.addListener(() => {
      trackerPorts.delete(tabId);
      if (currentTargetTabId === tabId) {
        currentTargetTabId = null;
        currentAppTabId = null;
      }
      void chrome.action.setBadgeText({ tabId, text: '' });
      sendAppMessage({ type: 'TARGET_ENDED', message: 'The selected tab navigated, closed, or disconnected from cursor tracking.' });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  appPorts.delete(tabId);
  if (pendingTarget?.tabId === tabId) pendingTarget = null;
  if (requestedTarget?.tabId === tabId) {
    requestedTarget = null;
    requestedAppTabId = null;
    sendAppMessage({ type: 'EXTENSION_ERROR', message: 'The Google Slides tab was closed before capture was authorized.' });
  }
  if (currentTargetTabId === tabId) {
    currentTargetTabId = null;
    currentAppTabId = null;
  }
  if (currentAppTabId === tabId) currentAppTabId = null;
  if (requestedAppTabId === tabId) requestedAppTabId = null;
});
