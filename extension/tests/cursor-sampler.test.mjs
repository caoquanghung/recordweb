import assert from 'node:assert/strict';
import test from 'node:test';

test('sampler preserves its active-time clock and publishes a final indexed sample', async () => {
  let now = 0;
  let intervalCallback = null;
  const calls = [];
  const controlEvents = [];

  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.window = {
    innerWidth: 1000,
    innerHeight: 500,
    setInterval: (callback) => {
      intervalCallback = callback;
      return 1;
    },
    clearInterval: () => {
      intervalCallback = null;
    },
  };

  await import('../cursor-sampler.js');
  const sampler = globalThis.RecordWebCursorSampler.create({
    sampleRateHz: 24,
    sendSample: (sample) => calls.push(sample),
    controls: {
      show: (mode) => controlEvents.push(['show', mode]),
      destroy: () => controlEvents.push(['destroy']),
      setPaused: (paused) => controlEvents.push(['paused', paused]),
    },
  });

  sampler.start('session-1');
  assert.equal(calls.length, 0);

  sampler.updateCursor({ x: 500, y: 125, visible: true });
  now = 100;
  intervalCallback();
  assert.deepEqual(
    calls[0].sample,
    { index: 0, x: 0.5, y: 0.25, timestampMs: 100 },
  );

  sampler.updateCursor({ x: null, y: null, visible: false });
  now = 150;
  intervalCallback();
  assert.equal(calls.length, 1);

  sampler.updateCursor({ x: 500, y: 125, visible: true });
  assert.deepEqual(
    { x: calls[0].sample.x, y: calls[0].sample.y, timestampMs: calls[0].sample.timestampMs },
    { x: 0.5, y: 0.25, timestampMs: 100 },
  );

  now = 250;
  sampler.pause();
  assert.deepEqual(sampler.getState(), {
    sessionId: 'session-1',
    paused: true,
    timestampMs: 250,
    nextSampleIndex: 1,
  });

  now = 500;
  sampler.resume();
  now = 600;
  intervalCallback();
  const stopped = sampler.stop({ showReadyControls: true });

  assert.deepEqual(stopped, { stoppedSessionId: 'session-1', lastSampleIndex: 2 });
  assert.equal(calls.at(-1).sample.timestampMs, 350);
  assert.deepEqual(controlEvents, [
    ['show', 'recording'],
    ['paused', true],
    ['paused', false],
    ['show', 'ready'],
  ]);
});
