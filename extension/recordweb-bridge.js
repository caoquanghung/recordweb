(() => {
  if (globalThis.__recordWebExtensionBridgeInstalled) return;
  globalThis.__recordWebExtensionBridgeInstalled = true;

  const { CHANNEL, PORT } = globalThis.RecordWebExtensionProtocol;
  const canonicalAppOrigin = new URL(chrome.runtime.getManifest().homepage_url).origin;

  if (window.location.origin !== canonicalAppOrigin) return;

  const portClient = globalThis.RecordWebResilientPort.create({
    portName: PORT.APP,
    onMessage: (message) => {
      window.postMessage({
        ...message,
        channel: CHANNEL,
        direction: 'extension-to-page',
      }, window.location.origin);
    },
    queueWhileDisconnected: true,
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (!message || message.channel !== CHANNEL || message.direction !== 'page-to-extension') return;
    portClient.send(message);
  });

  portClient.connect();
})();
