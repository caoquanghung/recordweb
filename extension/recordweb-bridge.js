(() => {
  if (globalThis.__recordWebExtensionBridgeInstalled) return;
  globalThis.__recordWebExtensionBridgeInstalled = true;

  const CHANNEL = 'recordweb-extension-v1';
  void chrome.storage.sync.get({ recordWebAppUrl: 'http://localhost:3000/' }).then(({ recordWebAppUrl }) => {
    let configuredOrigin;
    try {
      configuredOrigin = new URL(recordWebAppUrl).origin;
    } catch {
      return;
    }
    if (configuredOrigin !== window.location.origin) return;

    const port = chrome.runtime.connect({ name: 'recordweb-app' });
    const emitToPage = (message) => {
      window.postMessage({
        ...message,
        channel: CHANNEL,
        direction: 'extension-to-page',
      }, window.location.origin);
    };

    port.onMessage.addListener(emitToPage);
    port.onDisconnect.addListener(() => {
      emitToPage({ type: 'EXTENSION_ERROR', message: 'The RecordWeb extension bridge disconnected.' });
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || message.channel !== CHANNEL || message.direction !== 'page-to-extension') return;
      port.postMessage(message);
    });

    emitToPage({ type: 'BRIDGE_READY' });
  });
})();
