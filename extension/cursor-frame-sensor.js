(() => {
  if (globalThis.__recordWebCursorFrameSensorInstalled) return;
  globalThis.__recordWebCursorFrameSensorInstalled = true;

  const FRAME_MESSAGE_TYPE = 'recordweb-cursor-frame-pointer-v1';
  const TOP_FRAME_EVENT = 'recordweb:cursor-frame-pointer';

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function frameElementForSource(source) {
    for (const frame of document.querySelectorAll('iframe, frame')) {
      try {
        if (frame.contentWindow === source) return frame;
      } catch {
        // A cross-origin frame can deny property access while still allowing
        // comparison against its WindowProxy. Ignore only that candidate.
      }
    }
    return null;
  }

  function publishToParent(pointer) {
    if (window === window.top) {
      document.dispatchEvent(new CustomEvent(TOP_FRAME_EVENT, { detail: pointer }));
      return;
    }
    window.parent.postMessage({ type: FRAME_MESSAGE_TYPE, pointer }, '*');
  }

  function handleChildFramePointer(event) {
    const message = event.data;
    if (!message || message.type !== FRAME_MESSAGE_TYPE || !message.pointer) return;

    const frame = frameElementForSource(event.source);
    if (!frame) return;

    const pointer = message.pointer;
    if (!pointer.visible) {
      publishToParent({ x: null, y: null, visible: false });
      return;
    }
    if (!finiteNumber(pointer.x)
      || !finiteNumber(pointer.y)
      || !finiteNumber(pointer.viewportWidth)
      || !finiteNumber(pointer.viewportHeight)
      || pointer.viewportWidth <= 0
      || pointer.viewportHeight <= 0) return;

    const bounds = frame.getBoundingClientRect();
    publishToParent({
      x: bounds.left + (pointer.x / pointer.viewportWidth) * bounds.width,
      y: bounds.top + (pointer.y / pointer.viewportHeight) * bounds.height,
      visible: true,
      viewportWidth: Math.max(1, window.innerWidth),
      viewportHeight: Math.max(1, window.innerHeight),
    });
  }

  window.addEventListener('message', handleChildFramePointer);

  if (window === window.top) return;

  let pendingPointer = null;
  let animationFrameId = 0;

  function flushPointer() {
    animationFrameId = 0;
    if (!pendingPointer) return;
    publishToParent(pendingPointer);
    pendingPointer = null;
  }

  function schedulePointer(event) {
    pendingPointer = {
      x: event.clientX,
      y: event.clientY,
      visible: true,
      viewportWidth: Math.max(1, window.innerWidth),
      viewportHeight: Math.max(1, window.innerHeight),
    };
    if (!animationFrameId) animationFrameId = window.requestAnimationFrame(flushPointer);
  }

  function hidePointer() {
    pendingPointer = null;
    if (animationFrameId) window.cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    publishToParent({ x: null, y: null, visible: false });
  }

  function handlePointerOut(event) {
    if (event.relatedTarget === null) hidePointer();
  }

  document.addEventListener('pointermove', schedulePointer, { capture: true, passive: true });
  document.addEventListener('pointerout', handlePointerOut, { capture: true, passive: true });
  window.addEventListener('blur', hidePointer, { passive: true });
})();
