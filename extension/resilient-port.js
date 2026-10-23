(() => {
  if (globalThis.RecordWebResilientPort) return;

  const { RECONNECT_DELAYS_MS } = globalThis.RecordWebExtensionProtocol;

  function create({ portName, onMessage, onConnect, queueWhileDisconnected = false }) {
    let port = null;
    let reconnectTimer = null;
    let reconnectAttempt = 0;
    const pendingMessages = [];

    const scheduleReconnect = () => {
      if (reconnectTimer !== null || !chrome.runtime?.id) return;
      const delayMs = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttempt += 1;
      reconnectTimer = globalThis.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const rememberMessage = (message) => {
      if (queueWhileDisconnected) pendingMessages.push(message);
    };

    const markDisconnected = (connectedPort) => {
      if (port !== connectedPort) return;
      port = null;
      scheduleReconnect();
    };

    const post = (connectedPort, message) => {
      try {
        connectedPort.postMessage(message);
        return true;
      } catch {
        markDisconnected(connectedPort);
        return false;
      }
    };

    const flushPendingMessages = (connectedPort) => {
      while (port === connectedPort && pendingMessages.length > 0) {
        const message = pendingMessages.shift();
        if (post(connectedPort, message)) continue;
        pendingMessages.unshift(message);
        return;
      }
    };

    function connect() {
      if (port || !chrome.runtime?.id) return port;

      let connectedPort;
      try {
        connectedPort = chrome.runtime.connect({ name: portName });
      } catch {
        scheduleReconnect();
        return null;
      }

      port = connectedPort;
      connectedPort.onMessage.addListener((message) => {
        if (port !== connectedPort) return;
        reconnectAttempt = 0;
        onMessage(message);
      });
      connectedPort.onDisconnect.addListener(() => markDisconnected(connectedPort));
      onConnect?.();
      flushPendingMessages(connectedPort);
      return connectedPort;
    }

    const send = (message) => {
      const connectedPort = port ?? connect();
      if (!connectedPort) {
        rememberMessage(message);
        scheduleReconnect();
        return false;
      }
      if (post(connectedPort, message)) return true;
      rememberMessage(message);
      return false;
    };

    return Object.freeze({ connect, send });
  }

  globalThis.RecordWebResilientPort = Object.freeze({ create });
})();
