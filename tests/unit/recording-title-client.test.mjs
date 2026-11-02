import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { buildUploadManifest, UPLOAD_KINDS } from '../../src/lib/recordingUploadProtocol.ts';
import { getRecordingTitleError, normalizeRecordingTitle } from '../../src/lib/recordingTitle.ts';

const ts = createRequire(import.meta.url)('typescript');
const id = '12345678-1234-1234-1234-123456789abc';
const cloud = { id: 'cloud-recording', title: `Recording ${id}`, assets: [{ kind: 'composite' }] };
const drain = () => new Promise(resolve => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture({ title = '', uploadGate, metadataGate, prepareGate, localGate } = {}) {
  const recording = {
    id, localId: id, title, createdAt: '2026-11-02T00:00:00.000Z', durationSeconds: 10,
    mimeType: 'video/webm', blob: new Blob(['video'], { type: 'video/webm' }), previewUrl: 'blob:preview',
    assets: { cursor: { kind: 'cursor', mimeType: 'application/json', blob: new Blob(['{}']) } },
  };
  let backup = { id, ownerUserId: 'owner', recording: { ...recording, previewUrl: undefined } };
  let local;
  let patchError;
  let localError;
  let savedCloud;
  const calls = [];
  const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  const fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({ url, method: options.method, body });
    if (body.action === 'start') return response(savedCloud ? { recording: savedCloud } : { attempt: {} });
    if (body.action === 'cancel') return response({ status: 'cancelled' });
    if (url === '/api/upload') return response({ uploadMethod: 'client-token' });
    if (options.method === 'PATCH') {
      if (patchError) return response({ error: patchError }, 500);
      savedCloud = { ...(savedCloud ?? cloud), title: body.title };
      return response({ recording: { id: cloud.id, title: body.title } });
    }
    if (options.method === 'POST' && url === '/api/recordings') {
      await metadataGate?.promise;
      savedCloud = { ...cloud, title: body.title };
      return response({ recording: savedCloud });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  let firstRead = true;
  const idb = {
    getRecordingDraft: async () => {
      const snapshot = structuredClone(backup);
      if (firstRead) {
        firstRead = false;
        await prepareGate?.promise;
      }
      return snapshot;
    },
    saveRecordingDraft: async (value) => { backup = structuredClone(value); },
    updateRecordingDraft: async (_id, patch) => {
      assert.ok(backup, 'recovery backup must remain available until synchronization succeeds');
      backup = { ...backup, ...structuredClone(typeof patch === 'function' ? patch(backup) : patch) };
    },
    saveLocalRecording: async (value) => {
      await localGate?.promise;
      if (localError) throw new Error(localError);
      local = structuredClone(value);
    },
    deleteRecordingDraft: async () => { calls.push({ deleted: true }); backup = undefined; },
  };
  const load = (filename) => {
    const loaded = { exports: {} };
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../../src/lib/${filename}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText, {
      module: loaded, exports: loaded.exports, Blob, AbortController, AbortSignal, crypto, fetch,
      window: { setInterval: () => 1, clearInterval() {} },
      require(name) {
        if (name === '@/lib/idb') return idb;
        if (name === '@/lib/recordingTitle') return { getRecordingTitleError, normalizeRecordingTitle };
        if (name === '@/lib/recordingUploadProtocol') return { buildUploadManifest, UPLOAD_KINDS };
        if (name === '@vercel/blob/client') return {
          upload: async () => { calls.push({ uploaded: true }); await uploadGate?.promise; },
        };
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    return loaded.exports;
  };
  const createTitleSave = load('recordingTitleClient').createRecordingTitleSave;
  const titleSave = createTitleSave(recording);
  const createJob = () => load('recordingUploadClient').createRecordingUploadJob({
    recording, ownerUserId: 'owner', settings: {}, onPhase() {}, onProgress() {},
  });
  return {
    titleSave, createJob, calls,
    recover: () => createTitleSave(backup.recording),
    get backup() { return backup; }, get local() { return local; },
    setPatchError(value) { patchError = value; }, setLocalError(value) { localError = value; },
  };
}

test('title saves locally during Blob upload; metadata uses it and cleanup waits for cloud', async () => {
  const uploadGate = deferred();
  const f = fixture({ uploadGate });
  const uploading = f.createJob().run();
  await drain();
  assert.ok(f.calls.some(call => call.uploaded));
  const titled = await f.titleSave.saveLocally('  Bài giảng 1  ');
  assert.equal(titled.title, 'Bài giảng 1');
  assert.equal(f.local.title, titled.title);
  assert.equal(f.local.previewUrl, undefined);
  assert.equal(f.backup.recording.title, titled.title);
  assert.ok(f.backup.recording.assets.cursor.blob);
  assert.equal(await f.titleSave.syncCloud(), null);
  assert.equal(f.calls.some(call => call.method === 'PATCH' || call.deleted), false);
  uploadGate.resolve();
  const saved = await f.titleSave.completeUpload(await uploading);
  assert.equal(saved.title, titled.title);
  assert.equal(f.calls.find(call => call.url === '/api/recordings').body.title, titled.title);
  assert.equal(f.calls.some(call => call.method === 'PATCH'), false, 'POST already saved the latest title');
  assert.equal(f.backup, undefined);
});

test('a title saved while metadata POST is in flight is PATCHed after completion', async () => {
  const metadataGate = deferred();
  const f = fixture({ metadataGate });
  const uploading = f.createJob().run();
  await drain();
  const metadata = f.calls.find(call => call.url === '/api/recordings');
  assert.equal(metadata.body.title, cloud.title);
  await f.titleSave.saveLocally('Newest title');
  await f.titleSave.syncCloud();
  metadataGate.resolve();
  const saved = await f.titleSave.completeUpload(await uploading);
  assert.equal(saved.title, 'Newest title');
  assert.equal(saved.assets.length, 1, 'PATCH must retain the uploaded asset inventory');
  assert.equal(f.calls.find(call => call.method === 'PATCH').body.title, 'Newest title');
  assert.equal(f.backup, undefined);
});

test('cloud completion before title entry retains the backup until the local title is saved', async () => {
  const f = fixture();
  await f.titleSave.completeUpload(await f.createJob().run());
  assert.ok(f.backup);
  await f.titleSave.saveLocally('Late title');
  assert.ok(f.backup);
  assert.equal((await f.titleSave.syncCloud()).title, 'Late title');
  assert.equal(f.backup, undefined);
});

test('upload preparation never overwrites a title saved after its initial draft read', async () => {
  const prepareGate = deferred();
  const f = fixture({ prepareGate });
  const uploading = f.createJob().run();
  await drain();
  await f.titleSave.saveLocally('Saved during preparation');
  prepareGate.resolve();
  const saved = await uploading;
  assert.equal(f.backup.recording.title, 'Saved during preparation');
  assert.equal(saved.title, 'Saved during preparation');
});

test('title synchronization survives reload and retry reuses committed media after PATCH failure', async () => {
  const f = fixture();
  const committed = await f.createJob().run();
  await f.titleSave.saveLocally('Durable title');
  f.setPatchError('Network unavailable');
  await assert.rejects(f.titleSave.completeUpload(committed), /Network unavailable/);
  assert.equal(f.backup.recording.title, 'Durable title');
  assert.ok(f.backup.recording.assets.cursor.blob);
  const uploadCount = f.calls.filter(call => call.uploaded).length;
  const recoveredTitle = f.recover();
  f.setPatchError(undefined);
  const saved = await recoveredTitle.completeUpload(await f.createJob().run());
  assert.equal(saved.title, 'Durable title');
  assert.equal(f.calls.filter(call => call.uploaded).length, uploadCount);
  assert.equal(f.local.title, 'Durable title');
  assert.equal(f.backup, undefined);
});

test('completion waits for an in-flight local title save before synchronizing', async () => {
  const localGate = deferred();
  const f = fixture({ localGate });
  const saving = f.titleSave.saveLocally('Concurrent title');
  await drain();
  let completed = false;
  const completion = f.titleSave.completeUpload(cloud).then(saved => { completed = true; return saved; });
  await drain();
  assert.equal(completed, false);
  assert.ok(f.backup);
  localGate.resolve();
  await saving;
  assert.equal((await completion).title, 'Concurrent title');
  assert.equal(f.backup, undefined);
});

test('local quota failure and invalid titles never remove the recovery backup', async () => {
  const f = fixture();
  await assert.rejects(f.titleSave.saveLocally('   '), /required/);
  assert.equal(f.backup.recording.title, '');
  f.setLocalError('Quota exceeded');
  await assert.rejects(f.titleSave.saveLocally('Retained title'), /Quota exceeded/);
  assert.equal(f.backup.recording.title, 'Retained title');
  await f.titleSave.completeUpload(cloud);
  assert.ok(f.backup, 'failed local title writes cannot authorize cleanup');
  f.setLocalError(undefined);
  await f.titleSave.saveLocally('Retained title');
  await f.titleSave.syncCloud();
  assert.equal(f.backup, undefined);
});
