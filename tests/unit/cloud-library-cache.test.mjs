import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudLibraryCache } from '../../src/lib/cloudLibraryCache.ts';

const row = (id, user_id = 'owner', title = id) => ({ id, user_id, title });
const response = (data, ok = true) => ({ ok, json: async () => data });
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('concurrent page consumers share one request; later navigation reuses the result', async (t) => {
  const gate = deferred();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; await gate.promise; return response({ recordings: [row('one')] }); });
  const cache = createCloudLibraryCache('owner');
  const first = cache.loadRecordings();
  const second = cache.loadRecordings();
  assert.equal(first, second);
  gate.resolve();
  await Promise.all([first, second]);
  await cache.loadRecordings();
  await cache.loadRecordings();
  assert.equal(count, 1);
  assert.equal(cache.getSnapshot().recordings.data[0].id, 'one');
});

test('explicit refresh fetches again while retaining the visible cached list', async (t) => {
  const gate = deferred();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++count === 2) await gate.promise;
    return response({ recordings: [row(String(count))] });
  });
  const cache = createCloudLibraryCache('owner');
  await cache.loadRecordings();
  const refreshing = cache.loadRecordings(true);
  assert.equal(cache.getSnapshot().recordings.data[0].id, '1');
  assert.equal(cache.getSnapshot().recordings.refreshing, true);
  gate.resolve();
  await refreshing;
  assert.equal(count, 2);
  assert.equal(cache.getSnapshot().recordings.data[0].id, '2');
});

test('a delayed GET cannot resurrect a deleted recording or overwrite a new title/upload', async (t) => {
  const gate = deferred();
  t.mock.method(globalThis, 'fetch', async () => { await gate.promise; return response({ recordings: [row('deleted'), row('renamed', 'owner', 'Old title')] }); });
  const cache = createCloudLibraryCache('owner');
  const loading = cache.loadRecordings();
  cache.removeRecording('deleted');
  cache.upsertRecording(row('renamed', 'owner', 'New title'));
  cache.upsertRecording(row('uploaded'));
  gate.resolve();
  await loading;
  const rows = cache.getSnapshot().recordings.data;
  assert.equal(rows.some(item => item.id === 'deleted'), false);
  assert.equal(rows.find(item => item.id === 'renamed').title, 'New title');
  assert.ok(rows.some(item => item.id === 'uploaded'));
});

test('owner caches and their mutations stay isolated, including empty successful libraries', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return response({ recordings: [row('a', 'owner-a'), row('b', 'owner-b')] }); });
  const first = createCloudLibraryCache('owner-a');
  const second = createCloudLibraryCache('owner-b');
  await Promise.all([first.loadRecordings(), second.loadRecordings()]);
  first.upsertRecording(row('foreign', 'owner-b'));
  assert.deepEqual(first.getSnapshot().recordings.data.map(item => item.id), ['a']);
  assert.deepEqual(second.getSnapshot().recordings.data.map(item => item.id), ['b']);
  const empty = createCloudLibraryCache('owner-c');
  await empty.loadRecordings();
  await empty.loadRecordings();
  assert.equal(count, 3, 'an empty loaded list must also be cached');
});

test('failed requests can be retried; failed refresh preserves already loaded records', async (t) => {
  let fail = true;
  t.mock.method(globalThis, 'fetch', async () => fail ? response({ error: 'Network failure' }, false) : response({ recordings: [row('one')] }));
  const cache = createCloudLibraryCache('owner');
  await assert.rejects(cache.loadRecordings(), /Network failure/);
  assert.equal(cache.getSnapshot().recordings.data, null);
  fail = false;
  await cache.loadRecordings();
  fail = true;
  await assert.rejects(cache.loadRecordings(true), /Network failure/);
  assert.equal(cache.getSnapshot().recordings.data[0].id, 'one');
  assert.equal(cache.getSnapshot().recordings.refreshing, false);
});

test('presets use an independent cache and successful saves update subscribers without another GET', async (t) => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async (path) => { paths.push(path); return response(path.endsWith('presets') ? { presets: [row('preset')] } : { recordings: [] }); });
  const cache = createCloudLibraryCache('owner');
  let changes = 0;
  const unsubscribe = cache.subscribe(() => { changes++; });
  await Promise.all([cache.loadRecordings(), cache.loadPresets()]);
  cache.upsertPreset(row('saved-preset'));
  await cache.loadPresets();
  assert.equal(paths.length, 2);
  assert.equal(cache.getSnapshot().presets.data.length, 2);
  assert.ok(changes >= 5);
  unsubscribe();
});

test('cross-tab invalidation arriving during a GET triggers a fresh follow-up request', async (t) => {
  const gate = deferred();
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++count === 1) { await gate.promise; return response({ recordings: [] }); }
    return response({ recordings: [row('external-upload')] });
  });
  const cache = createCloudLibraryCache('owner');
  const first = cache.loadRecordings();
  const invalidated = cache.refreshLoaded('recordings');
  gate.resolve();
  await Promise.all([first, invalidated]);
  assert.equal(count, 2);
  assert.equal(cache.getSnapshot().recordings.data[0].id, 'external-upload');
  await cache.refreshLoaded('presets');
  assert.equal(count, 2, 'unused resources should not be fetched by cross-tab notifications');
});
