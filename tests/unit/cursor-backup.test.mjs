import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');

function fixture({ stopIndex = 0, checkpointError } = {}) {
  let now = 0;
  const intervals = new Map();
  const drafts = [];
  const states = [];
  const recorders = [];
  let timerId = 0;
  const mocks = {
    react: {
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect() {},
      useState: (value) => [typeof value === 'function' ? value() : value, (next) => states.push(next)],
    },
    '@/lib/idb': {
      saveRecordingDraft: async (draft) => {
        if (checkpointError) throw new Error(checkpointError);
        drafts.push(structuredClone(draft));
      },
      saveLocalRecording: async () => {},
      deleteRecordingDraft: async () => {},
    },
    '@/lib/audioWaveform': { decodeRecordedWaveform: async () => ({ peaks: [] }) },
    '@/lib/recordingAssets': {
      MEDIA_ASSET_ORDER: ['composite'], AUDIO_ASSET_KINDS: [],
      createRecorderInputs: () => ({ inputs: [{ kind: 'composite', spec: { mimeType: 'video/webm' } }], missingSources: [] }),
      createMediaRecorder: () => {
        const recorder = {
          state: 'inactive', start() { this.state = 'recording'; },
          stop() { this.state = 'inactive'; this.onstop(); },
        };
        recorders.push(recorder);
        return { recorder, requestedMimeType: 'video/webm' };
      },
      resolveRecorderMimeType: () => 'video/webm',
      getActiveRecorders: (recorders) => Object.values(recorders),
      snapshotRecordingAssets: (chunks) => ({ composite: { mimeType: 'video/webm', chunks: [...chunks.composite] } }),
      createRecordingAsset: async (kind, chunks) => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        return { kind, blob, mimeType: blob.type, fileSizeBytes: blob.size };
      },
    },
  };
  const cache = new Map();
  const load = (name) => {
    if (mocks[name]) return mocks[name];
    if (cache.has(name)) return cache.get(name);
    const source = readFileSync(new URL(`../../src/${name.slice(2)}.ts`, import.meta.url), 'utf8');
    const loaded = { exports: {} };
    cache.set(name, loaded.exports);
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      module: loaded, exports: loaded.exports, require: load, Blob, URL, crypto,
      performance: { now: () => now },
      window: {
        MediaRecorder: true, setTimeout, clearTimeout,
        setInterval: (callback) => { intervals.set(++timerId, callback); return timerId; },
        clearInterval: (id) => intervals.delete(id),
      },
    });
    return loaded.exports;
  };
  let capture;
  const commands = [];
  capture = load('@/lib/extensionCursorCapture').createExtensionCursorCapture({
    commandTimeoutMs: 10,
    send: (message) => {
      commands.push(message);
      if (message.type === 'CURSOR_START') capture.handleMessage({ ...message, type: 'CURSOR_STARTED' });
      if (message.type === 'CURSOR_STOP') capture.handleMessage({ ...message, type: 'CURSOR_STOPPED', lastSampleIndex: stopIndex });
    },
  });
  capture.setTarget({ tabId: 42, title: 'Slides' });
  const sample = (sessionId, index, timestampMs) => capture.handleMessage({
    type: 'CURSOR_SAMPLE', sessionId, sample: { index, timestampMs, x: 0.25, y: 0.75 },
    viewport: { width: 1920, height: 1080 },
  });
  return { load, capture, sample, drafts, states, recorders, commands, intervals, setNow: (value) => { now = value; } };
}

const drainWrites = () => new Promise((resolve) => setImmediate(resolve));

test('live snapshots retain session metadata after tracker loss and do not stop sampling', async () => {
  const f = fixture();
  assert.equal(f.capture.controller.snapshot(0), null);
  await f.capture.controller.start('session');
  f.sample('old-session', 0, 5);
  f.sample('session', 0, 10);
  const snapshot = f.capture.controller.snapshot(20);
  f.sample('session', 1, 30);
  assert.equal(snapshot.samples.length, 1);
  assert.equal(f.capture.controller.snapshot(40).samples.length, 2);
  assert.equal(f.commands.filter((message) => message.type === 'CURSOR_STOP').length, 0);
  f.capture.setTarget(null);
  assert.equal(f.capture.controller.snapshot(40).tracking.targetTabId, 42);
  await f.capture.controller.reset();
  assert.equal(f.capture.controller.snapshot(40), null);
});

test('media checkpoints include cursor; tracker loss preserves received cursor during finalization', async () => {
  const f = fixture();
  const session = f.load('@/hooks/useRecordingSession').useRecordingSession({
    videoStream: { getVideoTracks: () => [{}] }, audioStream: null,
    resolution: '1920x1080', cursorCapture: f.capture.controller, ownerUserId: 'owner',
  });
  await session.start();
  const id = f.commands[0].sessionId;
  f.sample(id, 0, 100);
  f.setNow(1000);
  f.recorders[0].ondataavailable({ data: new Blob(['video-checkpoint']) });
  await drainWrites();
  const checkpoint = f.drafts.at(-1);
  assert.equal(checkpoint.ownerUserId, 'owner');
  assert.equal(checkpoint.cursor.sessionId, checkpoint.id);
  assert.equal(checkpoint.cursor.samples.length, 1);
  assert.equal(checkpoint.cursor.timeline.durationMs, checkpoint.durationMs);
  assert.equal(checkpoint.assets.composite.chunks.length, 1);

  // Closing Slides loses its stop acknowledgement, but must not discard prior samples.
  f.sample(id, 1, 1100);
  f.capture.setTarget(null);
  f.setNow(1200);
  session.stop();
  await drainWrites();
  const finalized = f.drafts.at(-1).recording;
  const cursor = JSON.parse(await finalized.assets.cursor.blob.text());
  assert.equal(cursor.samples.length, 2);
  assert.equal(cursor.recovery.incomplete, true);
  assert.ok(f.states.some((state) => typeof state === 'string' && state.includes('Preserved received samples')));
  assert.equal(checkpoint.cursor.samples.length, 1, 'durable checkpoint must not mutate with in-memory samples');
});

test('normal stop keeps final acknowledgement semantics and does not mark output incomplete', async () => {
  const f = fixture({ stopIndex: 1 });
  await f.capture.controller.start('normal');
  f.sample('normal', 0, 10);
  let settled = false;
  const stopping = f.capture.controller.stop(20).then((cursor) => { settled = true; return cursor; });
  await Promise.resolve();
  assert.equal(settled, false, 'stop must still wait for the acknowledged final sample');
  f.sample('normal', 1, 20);
  const cursor = await stopping;
  assert.equal(cursor.samples.length, 2);
  assert.equal(cursor.recovery, undefined);
  assert.equal(f.capture.controller.snapshot(20), null);
});

test('checkpoint storage failure surfaces a recovery warning', async () => {
  const f = fixture({ checkpointError: 'Storage quota exceeded' });
  const session = f.load('@/hooks/useRecordingSession').useRecordingSession({
    videoStream: { getVideoTracks: () => [{}] }, audioStream: null,
    resolution: '1920x1080', cursorCapture: f.capture.controller,
  });
  await session.start();
  f.recorders[0].ondataavailable({ data: new Blob(['video']) });
  await drainWrites();
  assert.equal(f.drafts.length, 0);
  assert.ok(f.states.some((state) => typeof state === 'string' && state.includes('Recovery checkpoint unavailable: Storage quota exceeded')));
});

test('recovery creates cursor.json for the same checkpoint duration, without inventing missing samples', async () => {
  const f = fixture();
  await f.capture.controller.start('interrupted');
  f.sample('interrupted', 0, 100);
  f.sample('interrupted', 1, 1100);
  const { recoverCursorTrajectory, createCursorAsset } = f.load('@/lib/cursorTrajectory');
  const source = f.capture.controller.snapshot(1200);
  assert.equal(recoverCursorTrajectory(undefined, 'interrupted', 1000), null);
  assert.equal(recoverCursorTrajectory(source, 'different-session', 1000), null);
  const recovered = recoverCursorTrajectory(source, 'interrupted', 1000);
  const asset = createCursorAsset(recovered);
  const json = JSON.parse(await asset.blob.text());
  assert.equal(json.samples.length, 1);
  assert.equal(json.timeline.durationMs, 1000);
  assert.equal(json.recovery.incomplete, true);
  assert.equal(json.tracking.targetTabId, 42);
  assert.equal(asset.mimeType, 'application/json');
  assert.equal(asset.sampleRateHz, 24);
  assert.equal(source.samples.length, 2);
});

test('Presentation mode can checkpoint cursor without interrupting its active sampler', async () => {
  const f = fixture();
  const presentation = f.load('@/lib/presentationCursorCapture').createPresentationCursorCaptureSession();
  presentation.setTargetAvailable(true);
  presentation.updatePointer({ visible: true, x: 0.5, y: 0.5, sourceWidth: 1920, sourceHeight: 1080 });
  await presentation.controller.start('presentation');
  f.setNow(100);
  for (const tick of f.intervals.values()) tick();
  const snapshot = presentation.controller.snapshot(100);
  assert.equal(snapshot.samples.length, 1);
  f.setNow(200);
  for (const tick of f.intervals.values()) tick();
  assert.equal(snapshot.samples.length, 1);
  const complete = await presentation.controller.stop(200);
  assert.equal(complete.samples.length, 2);
  assert.equal(presentation.controller.snapshot(200), null);
});
