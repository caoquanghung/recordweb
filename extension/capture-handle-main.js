(() => {
  if (globalThis.__recordWebCaptureHandleInstalled) return;
  globalThis.__recordWebCaptureHandleInstalled = true;

  const HANDLE_ATTRIBUTE = 'data-recordweb-capture-handle';
  const STATUS_ATTRIBUTE = 'data-recordweb-capture-handle-status';
  const PREPARE_EVENT = 'recordweb:prepare-capture-handle';
  const LOG_PREFIX = '[RecordWeb][CaptureHandleProducer]';
  const RETRY_DELAYS_MS = [250, 1000, 2500, 5000];
  const randomId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
  const handle = `recordweb-slides-v1:${randomId}`;
  let configuredOnce = false;

  const publishState = (status) => {
    if (!document.documentElement) {
      window.setTimeout(() => publishState(status), 0);
      return;
    }
    document.documentElement.setAttribute(STATUS_ATTRIBUTE, status);
    if (status === 'configured') {
      document.documentElement.setAttribute(HANDLE_ATTRIBUTE, handle);
    }
  };

  const applyCaptureHandleConfig = (reason) => {
    const setCaptureHandleConfig = navigator.mediaDevices?.setCaptureHandleConfig;
    if (typeof setCaptureHandleConfig !== 'function') {
      if (!configuredOnce) publishState('unsupported');
      console.warn(`${LOG_PREFIX} setCaptureHandleConfig() is unavailable`, { reason });
      return false;
    }

    try {
      setCaptureHandleConfig.call(navigator.mediaDevices, {
        handle,
        exposeOrigin: false,
        permittedOrigins: ['*'],
      });
      configuredOnce = true;
      publishState('configured');
      console.info(`${LOG_PREFIX} configuration applied`, { handle, reason });
      return true;
    } catch (error) {
      if (!configuredOnce) publishState('failed');
      console.error(`${LOG_PREFIX} configuration failed`, { error, reason });
      return false;
    }
  };

  applyCaptureHandleConfig('document-start');

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => applyCaptureHandleConfig('dom-content-loaded'),
      { once: true },
    );
  } else {
    applyCaptureHandleConfig('document-already-loaded');
  }

  window.addEventListener('load', () => applyCaptureHandleConfig('window-load'), { once: true });
  window.addEventListener('pageshow', () => applyCaptureHandleConfig('pageshow'));
  document.addEventListener(PREPARE_EVENT, () => applyCaptureHandleConfig('on-demand-prepare'));

  RETRY_DELAYS_MS.forEach((delayMs) => {
    window.setTimeout(() => applyCaptureHandleConfig(`retry-${delayMs}ms`), delayMs);
  });
})();
