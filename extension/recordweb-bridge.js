(() => {
  if (globalThis.__recordWebExtensionBridgeInstalled) return;
  globalThis.__recordWebExtensionBridgeInstalled = true;

  const CHANNEL = 'recordweb-extension-v1';
  const canonicalAppOrigin = new URL(chrome.runtime.getManifest().homepage_url).origin;
  const isAllowedAppOrigin = ({ origin, hostname, port, protocol }) => (
    origin === canonicalAppOrigin
    || ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000' && protocol === 'http:')
    || (hostname.startsWith('recordweb-') && hostname.endsWith('-coannoacs-projects.vercel.app'))
  );
  if (!isAllowedAppOrigin(window.location)) return;

  const port = chrome.runtime.connect({ name: 'recordweb-app' });
  let disconnected = false;
  const emitToPage = (message) => {
    window.postMessage({
      ...message,
      channel: CHANNEL,
      direction: 'extension-to-page',
    }, window.location.origin);
  };

  const forwardToExtension = (event) => {
    if (disconnected || event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.direction !== 'page-to-extension') return;
    try {
      port.postMessage(message);
    } catch {
      disconnected = true;
      window.removeEventListener('message', forwardToExtension);
    }
  };

  port.onMessage.addListener(emitToPage);
  port.onDisconnect.addListener(() => {
    disconnected = true;
    window.removeEventListener('message', forwardToExtension);
    emitToPage({ type: 'EXTENSION_ERROR', message: 'The RecordWeb extension bridge disconnected.' });
  });

  window.addEventListener('message', forwardToExtension);

  emitToPage({ type: 'BRIDGE_READY' });
})();
