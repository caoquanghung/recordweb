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
const captureHandles = new Map();
const CAPTURE_TARGET_RESOLUTION_TIMEOUT_MS = 2500;
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

function googleSlidesDeckKey(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return null;
    const match = url.pathname.match(/^\/presentation\/(?:u\/\d+\/)?d\/(e\/)?([^/]+)/);
    if (!match) return null;
    return `${match[1] ? 'published' : 'deck'}:${match[2]}`;
  } catch {
    return null;
  }
}

function isEditableGoogleSlidesPresentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'docs.google.com'
      && /^\/presentation\/(?:u\/\d+\/)?d\/(?!e(?:\/|$))[^/]+\/present\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

async function findExistingGoogleSlidesTab(deckKey) {
  const tabs = await chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' });
  return tabs
    .filter((tab) => tab.id && tab.url && googleSlidesDeckKey(tab.url) === deckKey)
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
  postPortMessage(trackerPorts.get(currentTarget.tabId), { type: 'PRESENTATION_READY' });
  sendAppMessage({ type: 'TARGET_READY', target: currentTarget });
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

async function resolveCaptureTarget(handle, requestId, appTabId, appPort) {
  const targetTabId = await waitForTargetTabId(handle);
  if (!targetTabId) {
    postPortMessage(appPort, {
      type: 'CAPTURE_TARGET_REJECTED',
      requestId,
      message: 'The shared source is not a trackable Google Slides tab. Open or reload the presentation tab, then choose it again.',
    });
    return;
  }

  try {
    const tab = await chrome.tabs.get(targetTabId);
    const previousTargetTabId = currentTarget?.tabId;
    if (typeof previousTargetTabId === 'number' && previousTargetTabId !== targetTabId) {
      postPortMessage(trackerPorts.get(previousTargetTabId), { type: 'CURSOR_RESET' });
      clearBadge(previousTargetTabId);
    }

    currentTarget = { tabId: targetTabId, title: tab.title || 'Google Slides' };
    currentAppTabId = appTabId;
    requestedTarget = null;
    requestedAppTabId = null;
    setBadge(targetTabId, 'CUR', '#22c58b');
    postPortMessage(trackerPorts.get(targetTabId), { type: 'PRESENTATION_READY' });
    postPortMessage(appPort, {
      type: 'CAPTURE_TARGET_RESOLVED',
      requestId,
      target: currentTarget,
    });
  } catch {
    postPortMessage(appPort, {
      type: 'CAPTURE_TARGET_REJECTED',
      requestId,
      message: 'The shared Google Slides tab closed before RecordWeb could connect cursor tracking.',
    });
  }
}

async function openGoogleSlides(urlValue, appTabId, appPort) {
  const url = parseGoogleSlidesUrl(urlValue);
  if (!url) {
    postPortMessage(appPort, { type: 'EXTENSION_ERROR', message: 'RecordWeb received an invalid Google Slides URL.' });
    return;
  }

  try {
    const deckKey = googleSlidesDeckKey(url.href);
    const existingTab = deckKey ? await findExistingGoogleSlidesTab(deckKey) : null;
    if (currentTarget && existingTab?.id !== currentTarget.tabId) {
      postPortMessage(appPort, {
        type: 'EXTENSION_ERROR',
        message: 'Disconnect the current presentation before preparing a different Google Slides deck.',
      });
      return;
    }

    if (existingTab?.id) {
      const target = { tabId: existingTab.id, title: existingTab.title || 'Google Slides' };
      currentAppTabId = appTabId;
      postPortMessage(appPort, { type: 'TARGET_OPENED', target, reused: true });

      const shouldEnterPresentMode = isEditableGoogleSlidesPresentUrl(url.href)
        && !isEditableGoogleSlidesPresentUrl(existingTab.url || '');
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
        postPortMessage(trackerPorts.get(existingTab.id), { type: 'PRESENTATION_READY' });
        postPortMessage(appPort, { type: 'TARGET_READY', target });
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
        type: 'EXTENSION_ERROR',
        message: 'Disconnect the current presentation before preparing a different Google Slides deck.',
      });
      return;
    }

    const tab = await chrome.tabs.create({ url: url.href, active: false });
    if (!tab.id) throw new Error('Chrome did not return the new tab ID.');
    requestedTarget = { tabId: tab.id, title: tab.title || 'Google Slides' };
    requestedAppTabId = appTabId;
    postPortMessage(appPort, { type: 'TARGET_OPENED', target: requestedTarget, reused: false });
    pairRequestedTarget();
  } catch (error) {
    requestedTarget = null;
    requestedAppTabId = null;
    postPortMessage(appPort, {
      type: 'EXTENSION_ERROR',
      message: `Could not find or open Google Slides: ${error instanceof Error ? error.message : String(error)}`,
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
      if (message.type === 'RESOLVE_CAPTURE_TARGET') {
        void resolveCaptureTarget(message.captureHandle, message.requestId, tabId, port);
        return;
      }
      if (message.type === 'FOCUS_APP') {
        void focusTab(tabId);
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
      if (appPorts.get(tabId) === port) {
        appPorts.delete(tabId);
        if (currentAppTabId === tabId) currentAppTabId = null;
        if (requestedAppTabId === tabId) requestedAppTabId = null;
      }
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
      postPortMessage(port, { type: 'PRESENTATION_READY' });
      sendAppMessage({ type: 'TARGET_READY', target: currentTarget });
    }

    port.onMessage.addListener((message) => {
      if (message.type === 'CAPTURE_HANDLE_READY'
        && typeof message.handle === 'string'
        && message.handle.startsWith('recordweb-slides-v1:')) {
        captureHandles.set(tabId, message.handle);
        pairRequestedTarget();
      }
      if (message.type === 'CURSOR_SAMPLE' && currentTarget?.tabId === tabId) sendAppMessage(message);
      if (message.type === 'PRESENTATION_COMMAND' && currentTarget?.tabId === tabId) {
        const appTabId = currentAppTabId ?? appPorts.keys().next().value;
        if (message.command === 'return-to-start') {
          if (typeof appTabId === 'number') {
            void focusTab(appTabId).then(() => sendAppMessage(message));
          } else {
            sendAppMessage(message);
          }
          return;
        }
        sendAppMessage(message);
        if (message.command === 'stop' || message.command === 'end-session') {
          if (typeof appTabId === 'number') void focusTab(appTabId);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      if (trackerPorts.get(tabId) === port) {
        trackerPorts.delete(tabId);
        captureHandles.delete(tabId);
        if (requestedTarget?.tabId === tabId) {
          requestedTarget = null;
          requestedAppTabId = null;
        }
        clearBadge(tabId);
      }
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (currentTarget?.tabId !== tabId || !changeInfo.url) return;
  if (parseGoogleSlidesUrl(changeInfo.url)) return;
  currentTarget = null;
  currentAppTabId = null;
  clearBadge(tabId);
  sendAppMessage({ type: 'TARGET_ENDED', message: 'The selected tab navigated away from Google Slides.' });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  appPorts.delete(tabId);
  trackerPorts.delete(tabId);
  captureHandles.delete(tabId);
  if (requestedTarget?.tabId === tabId) {
    requestedTarget = null;
    requestedAppTabId = null;
    sendAppMessage({ type: 'EXTENSION_ERROR', message: 'The Google Slides tab was closed before cursor tracking became ready.' });
  }
  if (currentTarget?.tabId === tabId) {
    currentTarget = null;
    currentAppTabId = null;
    sendAppMessage({ type: 'TARGET_ENDED', message: 'The selected Google Slides tab was closed.' });
  }
  if (currentAppTabId === tabId) currentAppTabId = null;
  if (requestedAppTabId === tabId) requestedAppTabId = null;
});
