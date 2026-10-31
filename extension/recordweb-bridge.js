(() => {
  if (globalThis.__recordWebExtensionBridgeInstalled) return;

  const { CHANNEL, PORT } = globalThis.RecordWebExtensionProtocol;
  const manifest = chrome.runtime.getManifest();
  const appOrigins = new Set(
    (manifest.content_scripts || [])
      .filter((script) => script.js?.includes('recordweb-bridge.js'))
      .flatMap((script) => script.matches || [])
      .map((match) => {
        try {
          return new URL(match.replace(/\*$/, '')).origin;
        } catch {
          return null;
        }
      })
      .filter(Boolean),
  );

  if (!appOrigins.has(window.location.origin)) return;
  globalThis.__recordWebExtensionBridgeInstalled = true;

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
