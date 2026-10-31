import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function createTracker() {
  const window = new EventTarget();
  let tick;
  let onMessage;
  const sent = [];
  Object.assign(window, {
    innerWidth: 1000,
    innerHeight: 500,
    setInterval: (callback) => { tick = callback; return 1; },
    clearInterval: () => { tick = null; },
  });
  const document = new EventTarget();
  const context = vm.createContext({
    window,
    document,
    performance: { now: () => 100 },
    chrome: { runtime: { onMessage: { addListener() {} } } },
    RecordWebTrackerControls: {
      create: () => ({ show() {}, destroy() {}, setPaused() {}, moveToCurrentParent() {} }),
    },
    RecordWebResilientPort: {
      create: (options) => {
        onMessage = options.onMessage;
        return { connect() {}, send: (message) => sent.push(message) };
      },
    },
  });
  for (const file of ['extension-protocol.js', 'cursor-sampler.js', 'tracker-content.js']) {
    vm.runInContext(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), context);
  }
  const attemptLeave = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { window, document, sent, attemptLeave, message: (message) => onMessage(message), tick: () => tick?.() };
}

test('only active cursor sessions request departure confirmation; cancelling preserves sampling', () => {
  const tracker = createTracker();
  assert.equal(tracker.attemptLeave(), false);
  tracker.message({ type: 'PRESENTATION_READY' });
  tracker.message({ type: 'CURSOR_START' });
  assert.equal(tracker.attemptLeave(), false);

  tracker.message({ type: 'CURSOR_START', sessionId: 'recording', requestId: 'start' });
  assert.equal(tracker.attemptLeave(), true);
  const pointer = new Event('pointermove');
  Object.assign(pointer, { clientX: 500, clientY: 250 });
  tracker.document.dispatchEvent(pointer);
  tracker.tick();
  assert.equal(tracker.sent.at(-1).type, 'CURSOR_SAMPLE');
  assert.equal(tracker.sent.at(-1).sessionId, 'recording');

  // Stale messages must not disable protection for the current recording.
  tracker.message({ type: 'CURSOR_STOP', sessionId: 'old' });
  tracker.message({ type: 'CURSOR_RESET', sessionId: 'old' });
  assert.equal(tracker.attemptLeave(), true);

  tracker.message({ type: 'CURSOR_STOP', sessionId: 'recording', requestId: 'stop' });
  assert.equal(tracker.attemptLeave(), false);
  assert.equal(tracker.sent.at(-1).type, 'CURSOR_STOPPED');
  assert.equal(tracker.sent.at(-1).lastSampleIndex, 1);
  assert.equal(tracker.sent.at(-2).type, 'CURSOR_SAMPLE');
});

test('stop, reset and disconnect remove the listener across repeated sessions', () => {
  for (const type of ['CURSOR_STOP', 'CURSOR_RESET', 'DISCONNECT']) {
    const tracker = createTracker();
    let listeners = 0;
    const add = tracker.window.addEventListener.bind(tracker.window);
    const remove = tracker.window.removeEventListener.bind(tracker.window);
    tracker.window.addEventListener = (name, ...args) => {
      if (name === 'beforeunload') listeners++;
      return add(name, ...args);
    };
    tracker.window.removeEventListener = (name, ...args) => {
      if (name === 'beforeunload') listeners--;
      return remove(name, ...args);
    };
    for (let index = 0; index < 2; index++) {
      tracker.message({ type: 'CURSOR_START', sessionId: `recording-${index}` });
      assert.equal(listeners, 1);
      assert.equal(tracker.attemptLeave(), true);
      tracker.message({ type });
      assert.equal(listeners, 0);
      assert.equal(tracker.attemptLeave(), false);
    }
  }
});
