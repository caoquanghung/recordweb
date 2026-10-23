(() => {
  if (globalThis.__recordWebExtensionBridgeInstalled) return;
  globalThis.__recordWebExtensionBridgeInstalled = true;

  const CHANNEL = 'recordweb-extension-v1';
  const PORT_NAME = 'recordweb-app';
  const RECONNECT_DELAYS_MS = [0, 100, 250, 500, 1000, 2500, 5000];
  const canonicalAppOrigin = new URL(chrome.runtime.getManifest().homepage_url).origin;
  const isAllowedAppOrigin = ({ origin, hostname, port, protocol }) => (
    origin === canonicalAppOrigin
    || ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000' && protocol === 'http:')
    || (hostname.startsWith('recordweb-') && hostname.endsWith('-coannoacs-projects.vercel.app'))
  );
  if (!isAllowedAppOrigin(window.location)) return;

  let port = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  const pendingMessages = [];

  const emitToPage = (message) => {
    window.postMessage({
      ...message,
      channel: CHANNEL,
      direction: 'extension-to-page',
    }, window.location.origin);
  };

  const scheduleReconnect = () => {
    if (reconnectTimer !== null || !chrome.runtime?.id) return;
    const delayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connectPort();
    }, delayMs);
  };

  const flushPendingMessages = (connectedPort) => {
    while (port === connectedPort && pendingMessages.length > 0) {
      const message = pendingMessages.shift();
      try {
        connectedPort.postMessage(message);
      } catch {
        pendingMessages.unshift(message);
        if (port === connectedPort) port = null;
        scheduleReconnect();
        return;
      }
    }
  };

  function connectPort() {
    if (port || !chrome.runtime?.id) return port;
    let connectedPort;
    try {
      connectedPort = chrome.runtime.connect({ name: PORT_NAME });
    } catch {
      scheduleReconnect();
      return null;
    }

    port = connectedPort;
    connectedPort.onMessage.addListener((message) => {
      if (port !== connectedPort) return;
      reconnectAttempt = 0;
      emitToPage(message);
    });
    connectedPort.onDisconnect.addListener(() => {
      if (port !== connectedPort) return;
      port = null;
      scheduleReconnect();
    });
    flushPendingMessages(connectedPort);
    return connectedPort;
  }

  const forwardToExtension = (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.direction !== 'page-to-extension') return;

    const connectedPort = port ?? connectPort();
    if (!connectedPort) {
      pendingMessages.push(message);
      scheduleReconnect();
      return;
    }
    try {
      connectedPort.postMessage(message);
    } catch {
      if (port === connectedPort) port = null;
      pendingMessages.push(message);
      scheduleReconnect();
    }
  };

  window.addEventListener('message', forwardToExtension);
  connectPort();
})();
