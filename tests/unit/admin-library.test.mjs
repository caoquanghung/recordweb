import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as policy from '../../src/lib/adminLibraryPolicy.ts';
import { hasPermission } from '../../src/lib/auth/roles.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadModule(path, dependencies, globals = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, require: (name) => {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, console, TextEncoder, URL, Date, Response, ...globals,
  });
  return mod.exports;
}

test('developer is the only role with cross-user recording administration', () => {
  assert.equal(hasPermission('developer', 'recordings:manage'), true);
  assert.equal(hasPermission('user', 'recordings:manage'), false);
  assert.equal(policy.canAdminDeleteUser('dev', 'dev', 'developer'), false);
  assert.equal(policy.canAdminDeleteUser('dev', 'other-dev', 'developer'), false);
  assert.equal(policy.canAdminDeleteUser('dev', 'participant', 'user'), true);
});

test('archive keeps owners/recording IDs distinct, includes metadata, and supports legacy composites', () => {
  const base = {
    title: '../../same/name', user_id: 'participant', owner_email: 'user@example.invalid', recorded_at: '2026-11-09',
    storage_url: 'https://fixture.invalid/composite.webm', mime_type: 'video/webm;codecs=vp9', file_size_bytes: 20,
    assets: [{ kind: 'cursor', storage_url: 'https://fixture.invalid/cursor.json', mime_type: 'application/json', file_size_bytes: 8 }],
  };
  const result = policy.buildAdminDownloadManifest([{ ...base, id: 'one' }, { ...base, id: 'two' }], 'export');
  assert.equal(result.files.length, 6);
  assert.equal(new Set(result.files.map(file => file.name)).size, 6);
  assert.equal(result.files.some(file => file.name.includes('/../')), false);
  assert.equal(result.files.filter(file => file.name.endsWith('composite.webm')).length, 2);
  const metadata = result.files.find(file => file.name.endsWith('metadata.json'));
  assert.equal(JSON.parse(metadata.text).owner_email, base.owner_email);
  assert.equal(metadata.size, new TextEncoder().encode(metadata.text).length);
  assert.equal(policy.adminFileStem('...'), 'recording');
});

const routes = [
  ['app/api/admin/recordings/route', 'GET'],
  ['app/api/admin/users/route', 'GET'],
  ['app/api/admin/recordings/download/route', 'POST'],
  ['app/api/admin/recordings/[recordingId]/download/route', 'GET'],
  ['app/api/admin/recordings/[recordingId]/assets/[kind]/download/route', 'GET'],
  ['app/api/admin/users/[userId]/recordings/download/route', 'GET'],
  ['app/api/admin/recordings/[recordingId]/route', 'DELETE'],
  ['app/api/admin/users/[userId]/recordings/route', 'DELETE'],
  ['app/api/admin/users/[userId]/route', 'DELETE'],
  ['app/api/admin/deletions/route', 'GET'],
  ['app/api/admin/deletions/[jobId]/retry/route', 'POST'],
];

for (const identity of ['anonymous', 'user']) {
  test(`all admin endpoints reject ${identity} before accessing data/services`, async () => {
    let serviceCalls = 0;
    const forbiddenService = new Proxy({}, { get: () => () => { serviceCalls++; throw new Error('Must not access services'); } });
    const api = loadModule('lib/adminLibrary', {
      'server-only': {}, 'next/server': { NextResponse: Response }, '@/lib/adminLibraryPolicy': policy,
      '@/lib/db': { isDbConfigured: true, getDb: () => { serviceCalls++; throw new Error('Must not access database'); } },
      '@/lib/auth': { requirePermission: async permission => {
        assert.equal(permission, 'recordings:manage');
        return { authorized: false, response: Response.json({ error: 'Denied' }, { status: identity === 'anonymous' ? 401 : 403 }) };
      } },
    });
    for (const [path, method] of routes) {
      const route = loadModule(path, {
        '@/lib/adminLibrary': api, '@/lib/adminDownloads': forbiddenService, '@/lib/adminDeletions': forbiddenService,
        '@/lib/db': forbiddenService,
      });
      const response = await route[method](new Request('https://fixture.invalid/api/admin', { method }), { params: Promise.resolve({}) });
      assert.equal(response.status, identity === 'anonymous' ? 401 : 403, path);
    }
    assert.equal(serviceCalls, 0);
  });
}

test('download API rejects malformed/bulk-empty IDs and missing selected recordings atomically', async () => {
  const api = loadModule('lib/adminLibrary', {
    'server-only': {}, 'next/server': { NextResponse: Response }, '@/lib/adminLibraryPolicy': policy,
    '@/lib/db': {}, '@/lib/auth': {},
  });
  const downloads = loadModule('lib/adminDownloads', {
    'server-only': {}, '@/lib/db': {}, '@/lib/adminLibraryPolicy': policy,
    '@/lib/adminLibrary': { ...api, adminRecordingsByIds: async () => [] },
  });
  await assert.rejects(downloads.downloadSelectedAdminRecordings([]), { status: 400 });
  await assert.rejects(downloads.downloadSelectedAdminRecordings(['invalid']), { status: 400 });
  await assert.rejects(downloads.downloadSelectedAdminRecordings(['00000000-0000-0000-0000-000000000001']), { status: 409 });
  await assert.rejects(api.adminBody(new Request('https://fixture.invalid', { method: 'POST', body: 'bad JSON' })), { status: 400 });
});

test('cross-origin mutation requests are rejected even with developer authorization', async () => {
  const api = loadModule('lib/adminLibrary', {
    'server-only': {}, 'next/server': { NextResponse: Response }, '@/lib/adminLibraryPolicy': policy,
    '@/lib/db': { isDbConfigured: true },
    '@/lib/auth': { requirePermission: async () => ({ authorized: true, context: { userId: 'developer', role: 'developer' } }) },
  });
  let called = false;
  const response = await api.adminApi(async () => { called = true; }, new Request('https://fixture.invalid/api/admin', {
    method: 'DELETE', headers: { origin: 'https://other.invalid' },
  }));
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test('a developer cannot resume an older deletion job targeting their own account', async () => {
  const api = loadModule('lib/adminLibrary', {
    'server-only': {}, 'next/server': { NextResponse: Response }, '@/lib/adminLibraryPolicy': policy,
    '@/lib/db': { isDbConfigured: true },
    '@/lib/auth': { requirePermission: async () => ({ authorized: true, context: { userId: 'developer', role: 'developer' } }) },
  });
  const route = loadModule('app/api/admin/deletions/[jobId]/retry/route', {
    '@/lib/adminLibrary': api,
    '@/lib/adminDeletions': {
      getAdminDeletion: async () => ({ target_user_id: 'developer' }),
      runAdminDeletion: async () => { throw new Error('Must not resume own deletion'); },
    },
  });
  const result = await route.POST(new Request('https://fixture.invalid', { method: 'POST' }), {
    params: Promise.resolve({ jobId: '00000000-0000-0000-0000-000000000001' }),
  });
  assert.equal(result.status, 403);
});

test('downloads stream directly into the chosen file and picker cancellation never fetches media', async () => {
  const bytes = [];
  let fetches = 0;
  let pickerCalls = 0;
  const api = loadModule('lib/adminDownloadClient', {}, {
    window: { showSaveFilePicker: async options => {
      pickerCalls++;
      assert.equal(options.suggestedName, 'source.webm');
      return { createWritable: async () => new WritableStream({ write: chunk => bytes.push(...chunk) }) };
    } },
    fetch: async (_url, options) => { fetches++; assert.ok(options.signal); return new Response('source media'); },
  });
  const manifests = async function* () { yield { files: [{ name: 'source.webm', url: 'https://fixture.invalid/source', size: 12 }] }; };
  await api.saveAdminDownload('source.webm', manifests(), new AbortController().signal, () => {}, true);
  assert.equal(pickerCalls, 1);
  assert.equal(fetches, 1);
  assert.equal(new TextDecoder().decode(new Uint8Array(bytes)), 'source media');

  const cancelled = loadModule('lib/adminDownloadClient', {}, {
    window: { showSaveFilePicker: async () => { throw new DOMException('Cancelled', 'AbortError'); } },
    fetch: async () => { throw new Error('Must not fetch after picker cancellation'); },
  });
  await assert.rejects(cancelled.saveAdminDownload('source.webm', manifests(), new AbortController().signal, () => {}, true), { name: 'AbortError' });
});

test('download cancellation aborts the disk writer and missing files are not silently skipped', async () => {
  const controller = new AbortController();
  let writerAborted = false;
  const api = loadModule('lib/adminDownloadClient', {}, {
    window: { showSaveFilePicker: async () => ({ createWritable: async () => new WritableStream({
      write: () => controller.abort(), abort: () => { writerAborted = true; },
    }) }) },
    fetch: async () => new Response(new ReadableStream({ start: stream => stream.enqueue(new Uint8Array([1])) })),
  });
  const manifests = async function* () { yield { files: [{ name: 'video.webm', url: 'https://fixture.invalid/video', size: 1 }] }; };
  await assert.rejects(api.saveAdminDownload('video.webm', manifests(), controller.signal, () => {}, true), { name: 'AbortError' });
  assert.equal(writerAborted, true);
  const missing = loadModule('lib/adminDownloadClient', {}, {
    window: {}, fetch: async () => new Response('Missing', { status: 404 }),
  });
  await assert.rejects(missing.saveAdminDownload('video.webm', manifests(), new AbortController().signal, () => {}, true), /Không thể tải/);
});
