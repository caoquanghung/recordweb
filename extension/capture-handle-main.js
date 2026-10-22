(() => {
  if (globalThis.__recordWebCaptureHandleInstalled) return;
  globalThis.__recordWebCaptureHandleInstalled = true;

  const ATTRIBUTE = 'data-recordweb-capture-handle';
  const randomId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
  const handle = `recordweb-slides-v1:${randomId}`;

  try {
    navigator.mediaDevices?.setCaptureHandleConfig?.({
      handle,
      exposeOrigin: false,
      permittedOrigins: ['*'],
    });
  } catch {
    // Unsupported or policy-blocked browsers are rejected after the picker.
  }

  const publishHandle = () => {
    if (!document.documentElement) {
      window.setTimeout(publishHandle, 0);
      return;
    }
    document.documentElement.setAttribute(ATTRIBUTE, handle);
  };

  publishHandle();
})();
