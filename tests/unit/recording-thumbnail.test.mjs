import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { hasVisibleThumbnailPixels, thumbnailSeekTimes } from '../../src/lib/recordingThumbnailPolicy.ts';

const ts = createRequire(import.meta.url)('typescript');
const drain = () => new Promise(resolve => setImmediate(resolve));
const image = 'data:image/jpeg;base64,first-frame';

function fixture({ cached, cacheError, holdDecode = false, decodeError = false, holdFrame = false, blackUntil = 0, alwaysBlack = false } = {}) {
  const calls = [];
  const videos = [];
  const frames = [];
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
        let drawnVideo;
        if (kind === 'canvas') return {
          width: 0, height: 0,
          getContext: () => ({
            clearRect() {},
            drawImage: (video, _x, _y, width, height) => { drawnVideo = video; calls.push({ drawn: [width, height], time: video.currentTime }); },
            getImageData: (_x, _y, width, height) => {
              const data = new Uint8ClampedArray(width * height * 4);
              if (!alwaysBlack && drawnVideo.currentTime >= blackUntil) data.fill(255);
              return { data };
            },
          }),
          toDataURL: (type) => { assert.equal(type, 'image/jpeg'); return image; },
        };
        let currentTime = 0;
        const video = {
          videoWidth: 1920, videoHeight: 1080, duration: 2, seekable: { length: 1 }, src: '',
          get currentTime() { return currentTime; },
          set currentTime(value) { currentTime = value; calls.push({ seeked: value }); queueMicrotask(() => this.onseeked?.()); },
          requestVideoFrameCallback(callback) { frames.push(callback); if (!holdFrame) queueMicrotask(callback); return frames.length; },
          cancelVideoFrameCallback() {},
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
        getCloudRecordingThumbnail: async (id, owner, sourceUrl) => { calls.push({ cloudCache: id, owner, sourceUrl }); return cached; },
        cacheCloudRecordingThumbnail: async (id, owner, sourceUrl, value) => { calls.push({ cloudCached: id, owner, sourceUrl, image: value }); },
        getRecordingBackupThumbnail: async (id, owner) => { calls.push({ readCache: id, owner }); return cached; },
        cacheRecordingBackupThumbnail: async (id, owner, value) => {
          calls.push({ cached: id, owner, image: value });
          if (cacheError) throw new Error(cacheError);
        },
      };
      if (name === '@/lib/recordingBackupClient') return {
        loadRecordingBackupPreview: async (id, owner, options) => { calls.push({ readVideo: id, owner, repair: options.repairDuration }); return {}; },
      };
      if (name === '@/lib/recordingThumbnailPolicy') return { hasVisibleThumbnailPixels, thumbnailSeekTimes };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { load: loaded.exports.loadRecordingBackupThumbnail, loadCloud: loaded.exports.loadCloudRecordingThumbnail, calls, videos, frames, get active() { return active; }, get maxActive() { return maxActive; } };
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

test('cloud posters reuse an owner-and-URL-scoped cache without reopening the video', async () => {
  const f = fixture({ cached: image });
  assert.equal(await f.loadCloud('recording', 'owner', 'https://example.invalid/video.webm', new AbortController().signal), image);
  assert.equal(f.videos.length, 0);
  assert.equal(f.calls[0].sourceUrl, 'https://example.invalid/video.webm');
  assert.equal(f.calls[0].owner, 'owner');
});

test('cloud first-frame capture uses anonymous CORS and caches only its JPEG', async () => {
  const f = fixture();
  assert.equal(await f.loadCloud('recording', 'owner', 'https://example.invalid/video.webm', new AbortController().signal), image);
  assert.equal(f.videos[0].crossOrigin, 'anonymous');
  assert.equal(f.videos[0].preload, 'metadata');
  assert.equal(f.calls.some(call => call.readVideo), false, 'cloud thumbnails must not load a complete local video Blob');
  assert.equal(f.calls.find(call => call.cloudCached).image, image);
  assert.equal(f.active, 0);
});

test('loadeddata alone cannot cache a frame before the decoder presentation callback', async () => {
  const f = fixture({ holdFrame: true });
  const loading = f.load('recording', 'owner', new AbortController().signal);
  await drain();
  assert.equal(f.calls.some(call => call.drawn || call.cached), false);
  f.frames[0]();
  assert.equal(await loading, image);
  assert.equal(f.active, 0);
});

test('black opening frames are skipped using a bounded early seek before anything is cached', async () => {
  const f = fixture({ blackUntil: 0.3 });
  assert.equal(await f.loadCloud('recording', 'owner', 'https://example.invalid/video.mp4', new AbortController().signal), image);
  assert.deepEqual(f.calls.filter(call => call.seeked !== undefined).map(call => call.seeked), [0.05, 0.2, 0.5]);
  assert.equal(f.calls.filter(call => call.cloudCached).length, 1);
  assert.equal(f.calls.filter(call => call.drawn).at(-1).time, 0.5);
});

test('an entirely black/empty decoder surface is not persisted as a successful thumbnail', async () => {
  const f = fixture({ alwaysBlack: true });
  await assert.rejects(f.load('recording', 'owner', new AbortController().signal), /No visible thumbnail frame/);
  assert.equal(f.calls.some(call => call.cached), false);
  assert.equal(f.active, 0);
  assert.ok(f.calls.filter(call => call.seeked !== undefined).every(call => call.seeked <= 1));
});

test('pixel validation rejects black and transparent frames while preserving visible dark content', () => {
  assert.equal(hasVisibleThumbnailPixels(new Uint8ClampedArray([0, 0, 0, 255])), false);
  assert.equal(hasVisibleThumbnailPixels(new Uint8ClampedArray([255, 255, 255, 0])), false);
  assert.equal(hasVisibleThumbnailPixels(new Uint8ClampedArray([20, 20, 20, 255])), true);
});

test('early seek candidates stay inside very short recordings', () => {
  const times = thumbnailSeekTimes(0.02);
  assert.equal(times.length, 1);
  assert.ok(times[0] > 0 && times[0] < 0.02);
});
