import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import {
  buildUploadManifest, uploadIdFromPath, UPLOAD_MAX_BYTES,
} from '../../src/lib/recordingUploadProtocol.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const id = '12345678-1234-1234-1234-123456789abc';
const video = { kind: 'composite', mimeType: 'video/webm;codecs=vp8,opus', size: 10 };

test('manifest fixes exact attempt-scoped paths and includes cursor JSON', () => {
  const manifest = buildUploadManifest(id, [video, { kind: 'cursor', mimeType: 'application/json', size: 8 }]);
  assert.equal(manifest[0].pathname, `recording-uploads/${id}/composite.webm`);
  assert.equal(manifest[1].pathname, `recording-uploads/${id}/cursor.json`);
  assert.equal(uploadIdFromPath(manifest[1].pathname), id);
  for (const path of ['recordings/old.webm', `recording-uploads/${id}/nested/file.webm`, 'recording-uploads/../file.webm']) {
    assert.equal(uploadIdFromPath(path), null);
  }
});

test('manifest rejects duplicate kinds, oversized files, wrong MIME types, and missing composites', () => {
  for (const assets of [[video, video], [{ ...video, size: UPLOAD_MAX_BYTES + 1 }],
    [{ ...video, mimeType: 'text/html' }], [{ kind: 'cursor', mimeType: 'application/json', size: 8 }],
    [{ ...video, kind: '../composite' }]]) {
    assert.throws(() => buildUploadManifest(id, assets));
  }
});

function fixture({ saved, uploadError, saveError, delayStart = false } = {}) {
  const calls = [];
  let backup;
  let releaseStart;
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, body, signal: options.signal });
    if (body.action === 'cancel') return response({ status: 'cancelled' });
    if (body.action === 'start') {
      assert.ok(backup?.recording?.assets?.cursor.blob, 'cursor must be backed up BEFORE any upload starts');
      if (delayStart) await new Promise(resolve => { releaseStart = resolve; });
      options.signal?.throwIfAborted();
      return response(saved ? { recording: saved } : { attempt: { id } });
    }
    if (url === '/api/upload') return response({ uploadMethod: 'client-token' });
    return response({ recording: { id: 'cloud-recording', title: 'Recording test' } });
  };
  const fakeUpload = async (pathname, blob, options) => {
    calls.push({ pathname, blob, signal: options.abortSignal });
    if (uploadError) throw new Error(uploadError);
    options.abortSignal.throwIfAborted();
    return { pathname, url: `https://example.invalid/${pathname}` };
  };
  const exported = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../../src/lib/recordingUploadClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    module: exported, exports: exported.exports, Blob, AbortController, AbortSignal, crypto, fetch,
    window: { setInterval: () => 1, clearInterval: () => undefined },
    navigator: { sendBeacon: () => { calls.push({ beacon: true }); return true; } },
    require(name) {
      if (name === '@vercel/blob/client') return { upload: fakeUpload, uploadPresigned: fakeUpload };
      if (name === '@/lib/recordingUploadProtocol') return { buildUploadManifest, UPLOAD_KINDS: ['composite', 'cursor'] };
      if (name === '@/lib/idb') return {
        getRecordingDraft: async () => backup,
        saveRecordingDraft: async (value) => { if (saveError) throw new Error(saveError); backup = value; },
        updateRecordingDraft: async (_id, patch) => { backup = { ...backup, ...patch }; },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const recording = {
    id, localId: id, title: '', createdAt: '2026-10-29T00:00:00.000Z', durationSeconds: 10,
    mimeType: 'video/webm', blob: new Blob(['video'], { type: 'video/webm' }),
    assets: { cursor: { kind: 'cursor', mimeType: 'application/json', fileSizeBytes: 2, blob: new Blob(['{}']) } },
  };
  const job = exported.exports.createRecordingUploadJob({
    recording, ownerUserId: 'user-a', settings: { recordingMode: 'screen-pip' }, onPhase() {}, onProgress() {},
  });
  return { job, calls, get backup() { return backup; }, get releaseStart() { return releaseStart; } };
}

test('uploads only after the complete durable backup and marks the committed cloud ID', async () => {
  const f = fixture();
  const saved = await f.job.run();
  assert.equal(saved.id, 'cloud-recording');
  assert.equal(f.backup.cloudRecordingId, saved.id);
  assert.equal(f.backup.ownerUserId, 'user-a');
  assert.equal(f.backup.recording.previewUrl, undefined);
  assert.equal(f.calls.filter(call => call.pathname).length, 2);
  assert.equal(f.calls.find(call => call.url === '/api/recordings').body.attempt_id, f.job.id);
  await f.job.cancel();
  assert.equal(f.calls.filter(call => call.body?.action === 'cancel').length, 0, 'completed jobs must not be cancelled');
});

test('an IndexedDB write failure prevents both Blob upload and metadata completion', async () => {
  const f = fixture({ saveError: 'Quota exceeded' });
  await assert.rejects(f.job.run(), /Quota exceeded/);
  assert.equal(f.calls.some(call => call.pathname || call.url === '/api/recordings' || call.body?.action === 'start'), false);
});

test('failed asset upload aborts sibling uploads and requests scoped cleanup without removing the backup', async () => {
  const f = fixture({ uploadError: 'Connection lost' });
  await assert.rejects(f.job.run(), /Connection lost/);
  const cancel = f.calls.find(call => call.body?.action === 'cancel');
  assert.equal(cancel.body.id, f.job.id);
  assert.equal(cancel.body.localId, id);
  assert.equal(f.calls.filter(call => call.pathname).every(call => call.signal.aborted), true);
  assert.ok(f.backup.recording.assets.cursor.blob);
  assert.equal(f.calls.some(call => call.url === '/api/recordings'), false);
  assert.equal(f.job.cancelled, false, 'network failure must retain its useful error message');
});

test('lost completion response recovery reuses an existing recording without uploading again', async () => {
  const f = fixture({ saved: { id: 'already-saved', title: 'Lecture' } });
  assert.equal((await f.job.run()).id, 'already-saved');
  assert.equal(f.calls.some(call => call.pathname || call.url === '/api/recordings'), false);
  assert.equal(f.backup.cloudRecordingId, 'already-saved');
});

test('confirmed departure cancels a start request that has not returned yet', async () => {
  const f = fixture({ delayStart: true });
  const running = f.job.run();
  await new Promise(resolve => setImmediate(resolve));
  await f.job.cancel();
  f.releaseStart();
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(f.job.cancelled, true);
  assert.ok(f.backup.recording.assets.cursor.blob);
  assert.equal(f.calls.some(call => call.pathname || call.url === '/api/recordings'), false);
});

test('pagehide sends a cancellation beacon, without deleting local files', async () => {
  const f = fixture({ delayStart: true });
  const running = f.job.run();
  await new Promise(resolve => setImmediate(resolve));
  f.job.cancelOnExit();
  f.releaseStart();
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal(f.calls.some(call => call.beacon), true);
  assert.ok(f.backup.recording.blob);
});
