importScripts('extension-protocol.js', 'google-slides.js');

const { MESSAGE, PORT } = globalThis.RecordWebExtensionProtocol;
const GoogleSlides = globalThis.RecordWebGoogleSlides;
const APP_URL = chrome.runtime.getManifest().homepage_url;
const APP_ORIGIN = new URL(APP_URL).origin;

function isRecordWebAppUrl(urlValue) {
  try {
    return new URL(urlValue).origin === APP_ORIGIN;
  } catch {
    return false;
  }
}

const appPorts = new Map();
const trackerPorts = new Map();
const captureHandles = new Map();
const CAPTURE_TARGET_RESOLUTION_TIMEOUT_MS = 2500;
const TRACKER_RECONNECT_GRACE_MS = 2500;
const CURSOR_COMMAND_TYPES = new Set([
  MESSAGE.CURSOR_START,
  MESSAGE.CURSOR_PAUSE,
  MESSAGE.CURSOR_RESUME,
  MESSAGE.CURSOR_STOP,
  MESSAGE.CURSOR_RESET,
]);
let currentTarget = null;
let currentAppTabId = null;
let requestedTarget = null;
let requestedAppTabId = null;

async function findExistingGoogleSlidesTab(deckKey) {
  const tabs = await chrome.tabs.query({ url: GoogleSlides.SLIDES_TAB_QUERY });
  return tabs
    .filter((tab) => tab.id && tab.url && GoogleSlides.deckKey(tab.url) === deckKey)
    .sort((left, right) => {
      if (left.active !== right.active) return left.active ? -1 : 1;
      return (right.lastAccessed || 0) - (left.lastAccessed || 0);
    })[0] || null;
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
  if (!requestedTarget
    || !trackerPorts.has(requestedTarget.tabId)
    || !captureHandles.has(requestedTarget.tabId)) return;
  currentTarget = requestedTarget;
  currentAppTabId = requestedAppTabId;
  requestedTarget = null;
  requestedAppTabId = null;
  setBadge(currentTarget.tabId, 'CUR', '#22c58b');
  postPortMessage(trackerPorts.get(currentTarget.tabId), { type: MESSAGE.PRESENTATION_READY });
  sendAppMessage({ type: MESSAGE.TARGET_READY, target: currentTarget });
}

function targetTabIdForCaptureHandle(handle) {
  if (typeof handle !== 'string' || !handle.startsWith('recordweb-slides-v1:')) return null;
  for (const [tabId, registeredHandle] of captureHandles.entries()) {
    if (registeredHandle === handle && trackerPorts.has(tabId)) return tabId;
  }
  return null;
}

async function waitForTargetTabId(handle) {
  const deadline = Date.now() + CAPTURE_TARGET_RESOLUTION_TIMEOUT_MS;
  let targetTabId = targetTabIdForCaptureHandle(handle);
  while (!targetTabId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    targetTabId = targetTabIdForCaptureHandle(handle);
  }
  return targetTabId;
}

async function waitForTrackerPort(tabId) {
  const deadline = Date.now() + TRACKER_RECONNECT_GRACE_MS;
  let trackerPort = trackerPorts.get(tabId);
  while (!trackerPort && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    trackerPort = trackerPorts.get(tabId);
  }
  return trackerPort;
}

function adoptTarget(tabId, appTabId, title = 'Google Slides') {
  currentTarget = {
    tabId,
    title: currentTarget?.tabId === tabId ? currentTarget.title : title,
  };
  if (typeof appTabId === 'number') currentAppTabId = appTabId;
  setBadge(tabId, 'CUR', '#22c58b');
  return currentTarget;
}

async function prepareCaptureHandles() {
  try {
    const tabs = await chrome.tabs.query({ url: GoogleSlides.SLIDES_TAB_QUERY });
    await Promise.allSettled(tabs.flatMap((tab) => (
      typeof tab.id === 'number'
        ? [chrome.tabs.sendMessage(tab.id, { type: MESSAGE.PREPARE_CAPTURE_HANDLE })]
        : []
    )));
  } catch (error) {
    console.warn('[RecordWeb][CaptureHandle] could not prepare open Slides tabs', error);
  }
}

async function routeCursorMessage(message, appTabId, appPort) {
  if (typeof message.targetTabId !== 'number') return;
  const trackerPort = await waitForTrackerPort(message.targetTabId);
  if (trackerPort && postPortMessage(trackerPort, message)) {
    adoptTarget(message.targetTabId, appTabId);
    return;
  }
  postPortMessage(appPort, {
    type: MESSAGE.EXTENSION_ERROR,
    message: 'The cursor tracker is no longer connected to the prepared presentation.',
  });
}

async function resolveCaptureTarget(handle, requestId, appTabId, appPort) {
  const targetTabId = await waitForTargetTabId(handle);
  if (!targetTabId) {
    postPortMessage(appPort, {
      type: MESSAGE.CAPTURE_TARGET_REJECTED,
      requestId,
      message: 'The shared source is not a trackable Google Slides tab. Open or reload the presentation tab, then choose it again.',
    });
    return;
  }

  try {
    const tab = await chrome.tabs.get(targetTabId);
    const previousTargetTabId = currentTarget?.tabId;
    if (typeof previousTargetTabId === 'number' && previousTargetTabId !== targetTabId) {
      postPortMessage(trackerPorts.get(previousTargetTabId), { type: MESSAGE.CURSOR_RESET });
      clearBadge(previousTargetTabId);
    }

    currentTarget = { tabId: targetTabId, title: tab.title || 'Google Slides' };
    currentAppTabId = appTabId;
    requestedTarget = null;
    requestedAppTabId = null;
    setBadge(targetTabId, 'CUR', '#22c58b');
    postPortMessage(trackerPorts.get(targetTabId), { type: MESSAGE.PRESENTATION_READY });
    postPortMessage(appPort, {
      type: MESSAGE.CAPTURE_TARGET_RESOLVED,
      requestId,
      target: currentTarget,
    });
  } catch {
    postPortMessage(appPort, {
      type: MESSAGE.CAPTURE_TARGET_REJECTED,
      requestId,
      message: 'The shared Google Slides tab closed before RecordWeb could connect cursor tracking.',
    });
  }
}

async function openGoogleSlides(urlValue, appTabId, appPort) {
  const url = GoogleSlides.parse(urlValue);
  if (!url) {
    postPortMessage(appPort, { type: MESSAGE.EXTENSION_ERROR, message: 'RecordWeb received an invalid Google Slides URL.' });
    return;
  }

  try {
    const deckKey = GoogleSlides.deckKey(url.href);
    const existingTab = deckKey ? await findExistingGoogleSlidesTab(deckKey) : null;
    if (currentTarget && existingTab?.id !== currentTarget.tabId) {
      postPortMessage(appPort, {
        type: MESSAGE.EXTENSION_ERROR,
        message: 'Disconnect the current presentation before preparing a different Google Slides deck.',
      });
      return;
    }

    if (existingTab?.id) {
      const target = { tabId: existingTab.id, title: existingTab.title || 'Google Slides' };
      currentAppTabId = appTabId;
      postPortMessage(appPort, { type: MESSAGE.TARGET_OPENED, target, reused: true });

      const shouldEnterPresentMode = GoogleSlides.isEditablePresentUrl(url.href)
        && !GoogleSlides.isEditablePresentUrl(existingTab.url || '');
      if (shouldEnterPresentMode) {
        currentTarget = target;
        setBadge(existingTab.id, 'CUR', '#22c58b');
        try {
          await chrome.tabs.update(existingTab.id, { url: url.href });
        } catch (error) {
          if (currentTarget?.tabId === existingTab.id) {
            currentTarget = null;
            currentAppTabId = null;
          }
          clearBadge(existingTab.id);
          throw error;
        }
        return;
      }

      if (trackerPorts.has(existingTab.id) && captureHandles.has(existingTab.id)) {
        currentTarget = target;
        setBadge(existingTab.id, 'CUR', '#22c58b');
        postPortMessage(trackerPorts.get(existingTab.id), { type: MESSAGE.PRESENTATION_READY });
        postPortMessage(appPort, { type: MESSAGE.TARGET_READY, target });
      } else {
        if (!currentTarget) {
          requestedTarget = target;
          requestedAppTabId = appTabId;
        }
        if (!trackerPorts.has(existingTab.id)) await chrome.tabs.reload(existingTab.id);
      }

      return;
    }

    if (currentTarget) {
      postPortMessage(appPort, {
        type: MESSAGE.EXTENSION_ERROR,
        message: 'Disconnect the current presentation before preparing a different Google Slides deck.',
      });
      return;
    }

    const tab = await chrome.tabs.create({ url: url.href, active: false });
    if (!tab.id) throw new Error('Chrome did not return the new tab ID.');
    requestedTarget = { tabId: tab.id, title: tab.title || 'Google Slides' };
    requestedAppTabId = appTabId;
    postPortMessage(appPort, { type: MESSAGE.TARGET_OPENED, target: requestedTarget, reused: false });
    pairRequestedTarget();
  } catch (error) {
    requestedTarget = null;
    requestedAppTabId = null;
    postPortMessage(appPort, {
      type: MESSAGE.EXTENSION_ERROR,
      message: `Could not find or open Google Slides: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function releaseTarget(targetTabId) {
  if (typeof targetTabId !== 'number') return;
  const trackerPort = trackerPorts.get(targetTabId);
  if (trackerPort) postPortMessage(trackerPort, { type: MESSAGE.CURSOR_RESET });
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

function syncAppPort(port) {
  postPortMessage(port, { type: MESSAGE.BRIDGE_READY });
  if (currentTarget) postPortMessage(port, { type: MESSAGE.TARGET_READY, target: currentTarget });
}

function handleAppMessage(message, appTabId, appPort) {
  switch (message.type) {
    case MESSAGE.PAGE_READY:
      syncAppPort(appPort);
      break;
    case MESSAGE.PREPARE_CAPTURE_HANDLES:
      void prepareCaptureHandles();
      break;
    case MESSAGE.OPEN_GOOGLE_SLIDES:
      void openGoogleSlides(message.url, appTabId, appPort);
      break;
    case MESSAGE.RESOLVE_CAPTURE_TARGET:
      void resolveCaptureTarget(message.captureHandle, message.requestId, appTabId, appPort);
      break;
    case MESSAGE.FOCUS_APP:
      void focusTab(appTabId);
      break;
    case MESSAGE.FOCUS_TARGET:
      if (typeof message.targetTabId !== 'number') break;
      adoptTarget(message.targetTabId, appTabId);
      void focusTab(message.targetTabId).then((focused) => {
        if (!focused) {
          postPortMessage(appPort, {
            type: MESSAGE.TARGET_ENDED,
            message: 'The prepared presentation tab is no longer open.',
          });
        }
      });
      break;
    case MESSAGE.DISCONNECT:
      releaseTarget(message.targetTabId);
      break;
    default:
      if (CURSOR_COMMAND_TYPES.has(message.type)) {
        void routeCursorMessage(message, appTabId, appPort);
      }
  }
}

function connectAppPort(port, tabId) {
  if (!isRecordWebAppUrl(port.sender?.tab?.url || '')) return;
  appPorts.set(tabId, port);
  syncAppPort(port);
  port.onMessage.addListener((message) => handleAppMessage(message, tabId, port));
  port.onDisconnect.addListener(() => {
    if (appPorts.get(tabId) === port) appPorts.delete(tabId);
  });
}

function forwardTrackerSessionMessage(message, tabId, port) {
  if (currentTarget?.tabId !== tabId && !message.sessionId) return;
  if (currentTarget?.tabId !== tabId) {
    adoptTarget(tabId, currentAppTabId, port.sender?.tab?.title || 'Google Slides');
  }
  sendAppMessage(message);
}

function forwardPresentationCommand(message, tabId, port) {
  if (currentTarget && currentTarget.tabId !== tabId) return;
  adoptTarget(tabId, currentAppTabId, port.sender?.tab?.title || 'Google Slides');
  const appTabId = currentAppTabId ?? appPorts.keys().next().value;

  if (message.command === 'return-to-start') {
    if (typeof appTabId === 'number') void focusTab(appTabId).then(() => sendAppMessage(message));
    else sendAppMessage(message);
    return;
  }

  sendAppMessage(message);
  if ((message.command === 'stop' || message.command === 'end-session')
    && typeof appTabId === 'number') {
    void focusTab(appTabId);
  }
}

function handleTrackerMessage(message, tabId, port) {
  switch (message.type) {
    case MESSAGE.CAPTURE_HANDLE_READY:
      if (typeof message.handle === 'string' && message.handle.startsWith('recordweb-slides-v1:')) {
        captureHandles.set(tabId, message.handle);
        pairRequestedTarget();
      }
      break;
    case MESSAGE.TRACKER_STATE:
      if (message.sessionId) {
        adoptTarget(tabId, currentAppTabId, port.sender?.tab?.title || 'Google Slides');
        sendAppMessage({ type: MESSAGE.TARGET_READY, target: currentTarget });
      }
      break;
    case MESSAGE.CURSOR_SAMPLE:
    case MESSAGE.CURSOR_STARTED:
    case MESSAGE.CURSOR_STOPPED:
      forwardTrackerSessionMessage(message, tabId, port);
      break;
    case MESSAGE.PRESENTATION_COMMAND:
      forwardPresentationCommand(message, tabId, port);
      break;
    default:
      break;
  }
}

function handleTrackerDisconnect(tabId, port) {
  if (trackerPorts.get(tabId) !== port) return;
  trackerPorts.delete(tabId);
  setTimeout(() => {
    if (trackerPorts.has(tabId)) return;
    captureHandles.delete(tabId);
    if (requestedTarget?.tabId === tabId) {
      requestedTarget = null;
      requestedAppTabId = null;
    }
    clearBadge(tabId);
    if (currentTarget?.tabId === tabId) {
      currentTarget = null;
      currentAppTabId = null;
      sendAppMessage({
        type: MESSAGE.TARGET_ENDED,
        message: 'Cursor tracking disconnected from the selected Google Slides tab. RecordWeb will stop any active recording to protect cursor data.',
      });
    }
  }, TRACKER_RECONNECT_GRACE_MS);
}

function connectTrackerPort(port, tabId) {
  trackerPorts.set(tabId, port);
  postPortMessage(port, { type: MESSAGE.TRACKER_READY });
  const wasRequestedTarget = requestedTarget?.tabId === tabId;
  if (wasRequestedTarget) {
    requestedTarget = { tabId, title: port.sender?.tab?.title || requestedTarget.title };
  }
  pairRequestedTarget();
  if (!wasRequestedTarget && currentTarget?.tabId === tabId) {
    currentTarget = { tabId, title: port.sender?.tab?.title || currentTarget.title };
    setBadge(tabId, 'CUR', '#22c58b');
    postPortMessage(port, { type: MESSAGE.PRESENTATION_READY });
    sendAppMessage({ type: MESSAGE.TARGET_READY, target: currentTarget });
  }

  port.onMessage.addListener((message) => handleTrackerMessage(message, tabId, port));
  port.onDisconnect.addListener(() => handleTrackerDisconnect(tabId, port));
}

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender?.tab?.id;
  if (!tabId) return;
  if (port.name === PORT.APP) connectAppPort(port, tabId);
  if (port.name === PORT.TRACKER) connectTrackerPort(port, tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (currentTarget?.tabId !== tabId || !changeInfo.url) return;
  if (GoogleSlides.parse(changeInfo.url)) return;
  currentTarget = null;
  currentAppTabId = null;
  clearBadge(tabId);
  sendAppMessage({ type: MESSAGE.TARGET_ENDED, message: 'The selected tab navigated away from Google Slides.' });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  appPorts.delete(tabId);
  trackerPorts.delete(tabId);
  captureHandles.delete(tabId);
  if (requestedTarget?.tabId === tabId) {
    requestedTarget = null;
    requestedAppTabId = null;
    sendAppMessage({ type: MESSAGE.EXTENSION_ERROR, message: 'The Google Slides tab was closed before cursor tracking became ready.' });
  }
  if (currentTarget?.tabId === tabId) {
    currentTarget = null;
    currentAppTabId = null;
    sendAppMessage({ type: MESSAGE.TARGET_ENDED, message: 'The selected Google Slides tab was closed.' });
  }
  if (currentAppTabId === tabId) currentAppTabId = null;
  if (requestedAppTabId === tabId) requestedAppTabId = null;
});
