import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const drain = () => new Promise(resolve => setImmediate(resolve));
const image = 'data:image/jpeg;base64,first-frame';

function fixture({ cached, cacheError, holdDecode = false, decodeError = false } = {}) {
  const calls = [];
  const videos = [];
  let active = 0;
  let maxActive = 0;
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/lib/recordingThumbnailClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module: loaded, exports: loaded.exports,
    window: { setTimeout: () => 1, clearTimeout() {} },
    URL: {
      createObjectURL: () => { active++; maxActive = Math.max(maxActive, active); return `blob:thumbnail-${videos.length}`; },
      revokeObjectURL: () => { active--; },
    },
    document: {
      createElement(kind) {
        if (kind === 'canvas') return {
          width: 0, height: 0,
          getContext: () => ({ drawImage: (_video, _x, _y, width, height) => calls.push({ drawn: [width, height] }) }),
          toDataURL: (type) => { assert.equal(type, 'image/jpeg'); return image; },
        };
        const video = {
          videoWidth: 1920, videoHeight: 1080, src: '',
          pause() { calls.push({ paused: true }); },
          removeAttribute() { this.src = ''; },
          load() {
            if (!this.src || holdDecode) return;
            queueMicrotask(() => decodeError ? this.onerror?.() : this.onloadeddata?.());
          },
        };
        videos.push(video);
        return video;
      },
    },
    require(name) {
      if (name === '@/lib/idb') return {
        getRecordingBackupThumbnail: async (id, owner) => { calls.push({ readCache: id, owner }); return cached; },
        cacheRecordingBackupThumbnail: async (id, owner, value) => {
          calls.push({ cached: id, owner, image: value });
          if (cacheError) throw new Error(cacheError);
        },
      };
      if (name === '@/lib/recordingBackupClient') return {
        loadRecordingBackupPreview: async (id, owner, options) => { calls.push({ readVideo: id, owner, repair: options.repairDuration }); return {}; },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { load: loaded.exports.loadRecordingBackupThumbnail, calls, videos, get active() { return active; }, get maxActive() { return maxActive; } };
}

test('cached thumbnails avoid reopening full recordings and video decoders', async () => {
  const f = fixture({ cached: image });
  assert.equal(await f.load('recording', 'owner', new AbortController().signal), image);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].owner, 'owner');
  assert.equal(f.videos.length, 0);
});

test('first-frame extraction scales down, remains muted, skips duration rewriting and releases video URLs', async () => {
  const f = fixture();
  assert.equal(await f.load('recording', 'owner', new AbortController().signal), image);
  assert.equal(f.calls.find(call => call.readVideo).repair, false);
  assert.deepEqual(Array.from(f.calls.find(call => call.drawn).drawn), [480, 270]);
  assert.equal(f.videos[0].muted, true);
  assert.equal(f.videos[0].src, '');
  assert.equal(f.active, 0);
  assert.equal(f.calls.find(call => call.cached).owner, 'owner');
});

test('multiple cards decode sequentially rather than retaining multiple full videos', async () => {
  const f = fixture({ holdDecode: true });
  const first = f.load('first', 'owner', new AbortController().signal);
  const second = f.load('second', 'owner', new AbortController().signal);
  await drain();
  assert.equal(f.videos.length, 1);
  f.videos[0].onloadeddata();
  await first;
  await drain();
  assert.equal(f.videos.length, 2);
  f.videos[1].onloadeddata();
  await second;
  assert.equal(f.maxActive, 1);
  assert.equal(f.active, 0);
});

test('unmounted queued cards are skipped; active abort releases the decoder without caching', async () => {
  const f = fixture({ holdDecode: true });
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = f.load('first', 'owner', firstController.signal);
  const second = f.load('second', 'owner', secondController.signal);
  const firstRejected = assert.rejects(first, { name: 'AbortError' });
  const secondRejected = assert.rejects(second, { name: 'AbortError' });
  await drain();
  secondController.abort();
  firstController.abort();
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(f.videos.length, 1);
  assert.equal(f.active, 0);
  assert.equal(f.calls.some(call => call.cached), false);
  assert.equal(f.calls.some(call => call.readVideo === 'second'), false);
});

test('unsupported media releases resources and cannot block later queued cards', async () => {
  const f = fixture({ decodeError: true });
  await assert.rejects(f.load('broken', 'owner', new AbortController().signal), /decode/);
  await assert.rejects(f.load('also-broken', 'owner', new AbortController().signal), /decode/);
  assert.equal(f.active, 0);
  assert.equal(f.videos.length, 2);
  assert.equal(f.calls.some(call => call.cached), false);
});

test('optional cache quota failures still return the generated thumbnail', async () => {
  const f = fixture({ cacheError: 'Quota exceeded' });
  assert.equal(await f.load('recording', 'owner', new AbortController().signal), image);
  assert.equal(f.active, 0);
});
