const APP_PORT_NAME = 'recordweb-app';
const TRACKER_PORT_NAME = 'recordweb-tracker';
const APP_URL = chrome.runtime.getManifest().homepage_url;
const APP_ORIGINS = new Set([
  new URL(APP_URL).origin,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function isRecordWebAppUrl(urlValue) {
  try {
    const url = new URL(urlValue);
    return APP_ORIGINS.has(url.origin)
      || (url.hostname.startsWith('recordweb-') && url.hostname.endsWith('-coannoacs-projects.vercel.app'));
  } catch {
    return false;
  }
}

const appPorts = new Map();
const trackerPorts = new Map();
let currentTarget = null;
let currentAppTabId = null;
let requestedTarget = null;
let requestedAppTabId = null;

function parseGoogleSlidesUrl(value) {
  try {
    const url = new URL(value);
    const slidePath = /^\/presentation\/(?:u\/\d+\/)?d\/[^/]+(?:\/|$)/;
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !slidePath.test(url.pathname)) return null;
    const editableDeckPath = url.pathname.match(
      /^(\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+)(?:\/(?:edit|view|preview|present))?\/?$/,
    );
    if (editableDeckPath) url.pathname = `${editableDeckPath[1]}/present`;
    return url;
  } catch {
    return null;
  }
}

function postPortMessage(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

function sendAppMessage(message) {
  for (const [tabId, port] of appPorts.entries()) {
    if (!postPortMessage(port, message)) appPorts.delete(tabId);
  }
}

function setBadge(tabId, text, color) {
  void Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ tabId, color }),
    chrome.action.setBadgeText({ tabId, text }),
  ]);
}

function clearBadge(tabId) {
  void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined);
}

async function focusTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    return true;
  } catch {
    return false;
  }
}

async function openRecordWeb() {
  const existingAppTabId = appPorts.keys().next().value;
  if (typeof existingAppTabId === 'number' && await focusTab(existingAppTabId)) return;
  try {
    await chrome.tabs.create({ url: APP_URL });
  } catch {
    // Chrome surfaces extension-page failures in its own UI.
  }
}

function pairRequestedTarget() {
  if (!requestedTarget || !trackerPorts.has(requestedTarget.tabId)) return;
  currentTarget = requestedTarget;
  currentAppTabId = requestedAppTabId;
  requestedTarget = null;
  requestedAppTabId = null;
  setBadge(currentTarget.tabId, 'CUR', '#22c58b');
  sendAppMessage({ type: 'TARGET_READY', target: currentTarget });
}

async function openGoogleSlides(urlValue, appTabId, appPort) {
  if (currentTarget) {
    postPortMessage(appPort, {
      type: 'EXTENSION_ERROR',
      message: 'Disconnect the current presentation before opening another Google Slides presentation.',
    });
    return;
  }
  const url = parseGoogleSlidesUrl(urlValue);
  if (!url) {
    postPortMessage(appPort, { type: 'EXTENSION_ERROR', message: 'RecordWeb received an invalid Google Slides URL.' });
    return;
  }

  try {
    const tab = await chrome.tabs.create({ url: url.href, active: false });
    if (!tab.id) throw new Error('Chrome did not return the new tab ID.');
    requestedTarget = { tabId: tab.id, title: tab.title || 'Google Slides' };
    requestedAppTabId = appTabId;
    postPortMessage(appPort, { type: 'TARGET_OPENED', target: requestedTarget });
    pairRequestedTarget();
  } catch (error) {
    requestedTarget = null;
    requestedAppTabId = null;
    postPortMessage(appPort, {
      type: 'EXTENSION_ERROR',
      message: `Could not open Google Slides: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function releaseTarget(targetTabId) {
  if (typeof targetTabId !== 'number') return;
  const trackerPort = trackerPorts.get(targetTabId);
  if (trackerPort) postPortMessage(trackerPort, { type: 'CURSOR_RESET' });
  clearBadge(targetTabId);
  if (currentTarget?.tabId === targetTabId) {
    currentTarget = null;
    currentAppTabId = null;
  }
  if (requestedTarget?.tabId === targetTabId) {
    requestedTarget = null;
    requestedAppTabId = null;
  }
}

chrome.action.onClicked.addListener(() => {
  void openRecordWeb();
});

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;

  if (port.name === APP_PORT_NAME) {
    if (!isRecordWebAppUrl(port.sender?.tab?.url || '')) return;
    appPorts.set(tabId, port);
    postPortMessage(port, { type: 'BRIDGE_READY' });
    if (currentTarget) postPortMessage(port, { type: 'TARGET_READY', target: currentTarget });

    port.onMessage.addListener((message) => {
      if (message.type === 'PAGE_READY') {
        postPortMessage(port, { type: 'BRIDGE_READY' });
        if (currentTarget) postPortMessage(port, { type: 'TARGET_READY', target: currentTarget });
        return;
      }
      if (message.type === 'OPEN_GOOGLE_SLIDES') {
        void openGoogleSlides(message.url, tabId, port);
        return;
      }
      if (message.type === 'FOCUS_TARGET' && message.targetTabId === currentTarget?.tabId) {
        void focusTab(message.targetTabId).then((focused) => {
          if (!focused) postPortMessage(port, { type: 'TARGET_ENDED', message: 'The prepared presentation tab is no longer open.' });
        });
        return;
      }
      if (message.type === 'DISCONNECT') {
        releaseTarget(message.targetTabId);
        return;
      }
      if (message.type?.startsWith('CURSOR_') && message.targetTabId === currentTarget?.tabId) {
        const trackerPort = trackerPorts.get(message.targetTabId);
        if (trackerPort && postPortMessage(trackerPort, message)) return;
        postPortMessage(port, { type: 'EXTENSION_ERROR', message: 'The cursor tracker is no longer connected to the prepared presentation.' });
      }
    });

    port.onDisconnect.addListener(() => {
      appPorts.delete(tabId);
      if (currentAppTabId === tabId) currentAppTabId = null;
      if (requestedAppTabId === tabId) requestedAppTabId = null;
    });
    return;
  }

  if (port.name === TRACKER_PORT_NAME) {
    trackerPorts.set(tabId, port);
    const wasRequestedTarget = requestedTarget?.tabId === tabId;
    if (wasRequestedTarget) {
      requestedTarget = { tabId, title: port.sender?.tab?.title || requestedTarget.title };
    }
    pairRequestedTarget();
    if (!wasRequestedTarget && currentTarget?.tabId === tabId) {
      currentTarget = { tabId, title: port.sender?.tab?.title || currentTarget.title };
      setBadge(tabId, 'CUR', '#22c58b');
      sendAppMessage({ type: 'TARGET_READY', target: currentTarget });
    }

    port.onMessage.addListener((message) => {
      if (message.type === 'CURSOR_SAMPLE' && currentTarget?.tabId === tabId) sendAppMessage(message);
      if (message.type === 'PRESENTATION_COMMAND' && currentTarget?.tabId === tabId) {
        sendAppMessage(message);
        if (message.command === 'stop') {
          const appTabId = currentAppTabId ?? appPorts.keys().next().value;
          if (typeof appTabId === 'number') void focusTab(appTabId);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      trackerPorts.delete(tabId);
      if (requestedTarget?.tabId === tabId) {
        requestedTarget = null;
        requestedAppTabId = null;
      }
      clearBadge(tabId);
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (currentTarget?.tabId !== tabId || !changeInfo.url) return;
  if (parseGoogleSlidesUrl(changeInfo.url)) return;
  currentTarget = null;
  currentAppTabId = null;
  clearBadge(tabId);
  sendAppMessage({ type: 'TARGET_ENDED', message: 'The prepared tab navigated away from Google Slides.' });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  appPorts.delete(tabId);
  trackerPorts.delete(tabId);
  if (requestedTarget?.tabId === tabId) {
    requestedTarget = null;
    requestedAppTabId = null;
    sendAppMessage({ type: 'EXTENSION_ERROR', message: 'The Google Slides tab was closed before cursor tracking became ready.' });
  }
  if (currentTarget?.tabId === tabId) {
    currentTarget = null;
    currentAppTabId = null;
    sendAppMessage({ type: 'TARGET_ENDED', message: 'The prepared Google Slides tab was closed.' });
  }
  if (currentAppTabId === tabId) currentAppTabId = null;
  if (requestedAppTabId === tabId) requestedAppTabId = null;
});
