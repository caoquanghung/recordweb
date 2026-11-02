import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { recentRecordingEntries, recordingBackupTitle } from '../../src/lib/pendingRecordings.ts';
import { UPLOAD_KINDS } from '../../src/lib/recordingUploadProtocol.ts';

const ts = createRequire(import.meta.url)('typescript');
const date = (day) => `2026-11-${String(day).padStart(2, '0')}T10:30:00.000Z`;
const cloud = (id, day, localId = id) => ({ id, recorded_at: date(day), local_id: localId });
const draft = (id, day) => ({ id, startedAt: date(day), durationMs: 1000, ownerUserId: 'owner' });

test('Dashboard picks the newest three by recording time across cloud and local drafts', () => {
  const entries = recentRecordingEntries([cloud('cloud-a', 2), cloud('cloud-b', 6)], [draft('draft-a', 5), draft('draft-b', 3)]);
  assert.deepEqual(entries.map(entry => entry.kind === 'cloud' ? entry.recording.id : entry.draft.id), ['cloud-b', 'draft-a', 'draft-b']);
  assert.deepEqual(entries.map(entry => entry.kind), ['cloud', 'draft', 'draft']);
  assert.equal(recentRecordingEntries([], [draft('a', 1), draft('b', 2), draft('c', 3), draft('d', 4)]).length, 3);
  assert.equal(recentRecordingEntries([cloud('a', 1), cloud('b', 2), cloud('c', 3), cloud('d', 4)], []).length, 3);
});

test('a committed row still awaiting local completion appears once with recovery actions', () => {
  const entries = recentRecordingEntries([cloud('cloud-id', 3, 'same-local-id'), cloud('other', 1)], [draft('same-local-id', 3)]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'draft');
  assert.equal(entries[0].draft.id, 'same-local-id');
});

test('backup titles identify recording date and distinguish different times on the same date', () => {
  const first = recordingBackupTitle('2026-11-02T01:05:00.000Z');
  assert.match(first, /^Bản ghi /);
  assert.match(first, /02\/11\/2026/);
  assert.notEqual(first, recordingBackupTitle('2026-11-02T02:05:00.000Z'));
});

function fixture({ owner = 'owner', attempt = 'upload-attempt', status = 'cancelled', failure, finalized = true, legacy = false } = {}) {
  const blob = new Blob(['video'], { type: 'video/webm' });
  const backup = {
    ...draft('backup-id', 2), ownerUserId: owner, uploadAttemptId: attempt,
    recording: finalized ? { id: 'backup-id', localId: 'local-id', blob, mimeType: blob.type,
      assets: { cursor: { mimeType: 'application/json', blob: new Blob(['{}']) } } } : undefined,
    ...(legacy ? { chunks: [blob], mimeType: blob.type } : { assets: { composite: { chunks: [blob], mimeType: blob.type } } }),
  };
  const calls = [];
  const loaded = { exports: {} };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../../src/lib/recordingBackupClient.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module: loaded, exports: loaded.exports, Blob, AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: !failure, json: async () => failure ? { error: failure } : { status } };
    },
    require(name) {
      if (name === '@/lib/idb') return {
        getRecordingDraft: async () => backup,
        deleteRecordingBackup: async (id) => { calls.push({ deleted: id }); },
      };
      if (name === '@/lib/recordingUploadProtocol') return { UPLOAD_KINDS };
      if (name === '@/lib/ebmlPatcher') return { repairWebmDuration: async (input, duration) => { calls.push({ repaired: duration }); return input; } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { ...loaded.exports, backup, blob, calls };
}

test('discard first cancels exactly the backup attempt, then deletes its local data', async () => {
  const f = fixture();
  await f.discardRecordingBackup('backup-id', 'owner');
  assert.equal(f.calls[0].url, '/api/recording-uploads');
  assert.equal(f.calls[0].body.action, 'cancel');
  assert.equal(f.calls[0].body.id, 'upload-attempt');
  assert.equal(f.calls[0].body.localId, 'local-id');
  assert.deepEqual(Array.from(f.calls[0].body.assets, asset => asset.kind), ['composite', 'cursor']);
  assert.equal(f.calls[1].deleted, 'backup-id');
});

test('discarding a completed upload deletes only the local backup, never the cloud recording', async () => {
  const f = fixture({ status: 'completed' });
  await f.discardRecordingBackup('backup-id', 'owner');
  assert.equal(f.calls.some(call => call.url === '/api/recordings' || call.method === 'DELETE'), false);
  assert.equal(f.calls.at(-1).deleted, 'backup-id');
});

test('failed cancellation keeps local recovery available; another account cannot preview or discard', async () => {
  const f = fixture({ failure: 'Try again later' });
  await assert.rejects(f.discardRecordingBackup('backup-id', 'owner'), /Try again later/);
  assert.equal(f.calls.some(call => call.deleted), false);
  for (const action of [f.discardRecordingBackup, f.loadRecordingBackupPreview]) {
    await assert.rejects(action('backup-id', 'another-owner'), /tài khoản/);
  }
  assert.equal(f.calls.length, 1);
});

test('raw drafts without an upload attempt can be deleted without a network request', async () => {
  const f = fixture({ attempt: undefined, finalized: false });
  // An explicitly absent attempt is how raw checkpoints are stored.
  f.backup.uploadAttemptId = undefined;
  await f.discardRecordingBackup('backup-id', 'owner');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].deleted, 'backup-id');
});

test('preview reads finalized or repaired raw media without starting an upload or changing storage', async () => {
  const finalized = fixture();
  assert.equal(await finalized.loadRecordingBackupPreview('backup-id', 'owner'), finalized.blob);
  assert.equal(finalized.calls.length, 0);
  for (const legacy of [false, true]) {
    const raw = fixture({ finalized: false, legacy });
    const preview = await raw.loadRecordingBackupPreview('backup-id', 'owner');
    assert.equal(await preview.text(), 'video');
    assert.equal(raw.calls.length, 1);
    assert.equal(raw.calls[0].repaired, 1000);
  }
});
