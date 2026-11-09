import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Pool, neonConfig } from '@neondatabase/serverless';
import * as policy from '../../src/lib/adminLibraryPolicy.ts';
import * as roles from '../../src/lib/auth/roles.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

test('admin queries and resumable deletion use PostgreSQL; fixture data and unapplied migration are rolled back', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
    return (await client.query(query, values)).rows;
  };
  sql.transaction = promises => Promise.all(promises);
  const fixture = crypto.randomUUID();
  const actor = `admin-test-dev-${fixture}`;
  const owner = `admin-test-user-${fixture}`;
  const account = `admin-test-account-${fixture}`;
  const paginationOwner = `admin-test-pages-${fixture}`;
  const ownerEmail = `${owner}@example.invalid`;
  const accountEmail = `${account}@example.invalid`;
  const clerkUsers = new Map([
    [actor, { publicMetadata: { appRole: 'developer' } }],
    [owner, { publicMetadata: { appRole: 'user' } }],
    [account, { publicMetadata: { appRole: 'user' } }],
  ]);
  const deleted = [];
  let failBlob = false;
  let failClerk = false;
  const dependencies = {
    'server-only': {}, 'next/server': { NextResponse: Response },
    '@/lib/db': { getDb: () => sql, isDbConfigured: true },
    '@/lib/auth': {}, '@/lib/auth/roles': roles, '@/lib/adminLibraryPolicy': policy,
    '@/lib/blobCredentials': { getBlobCommandCredentials: () => ({}) },
    'node:crypto': require('node:crypto'),
    '@clerk/nextjs/server': { clerkClient: async () => ({ users: {
      getUser: async id => {
        if (!clerkUsers.has(id)) throw Object.assign(new Error('Not found'), { status: 404 });
        return clerkUsers.get(id);
      },
      deleteUser: async id => {
        if (failClerk) throw new Error('Clerk fixture outage');
        clerkUsers.delete(id);
        // Model the webhook winning the race with the route's DB finalization.
        await client.query('DELETE FROM users WHERE id = $1', [id]);
      },
    } }) },
    '@vercel/blob': { del: async paths => {
      if (failBlob) throw new Error('Blob fixture outage');
      deleted.push(...(Array.isArray(paths) ? paths : [paths]));
    } },
  };
  function loadModule(path) {
    const mod = { exports: {} };
    const source = ts.transpileModule(readFileSync(new URL(`../../src/lib/${path}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(source, {
      module: mod, exports: mod.exports, require: name => {
        if (name in dependencies) return dependencies[name];
        throw new Error(`Unexpected dependency ${name}`);
      }, Date, TextEncoder, URL, Response, console: { ...console, error() {} },
    });
    return mod.exports;
  }
  const admin = loadModule('adminLibrary');
  dependencies['@/lib/adminLibrary'] = admin;
  const deletions = loadModule('adminDeletions');
  const downloads = loadModule('adminDownloads');
  async function expectSqlRejection(action, code) {
    await client.query('SAVEPOINT expected_rejection');
    await assert.rejects(action, { code });
    await client.query('ROLLBACK TO SAVEPOINT expected_rejection');
  }
  async function insertRecording(userId, title, localId = crypto.randomUUID()) {
    return (await client.query(`INSERT INTO recordings (user_id, local_id, title, duration_seconds, file_size_bytes, blob_pathname, storage_url)
      VALUES ($1, $2, $3, 10, 20, $4, $5) RETURNING *`,
    [userId, localId, title, `fixture/${fixture}/${localId}.webm`, `https://fixture.invalid/${localId}.webm`])).rows[0];
  }
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000');
    const exists = (await client.query("SELECT to_regclass('public.admin_deletion_jobs') AS table_name")).rows[0].table_name;
    if (!exists) await client.query(readFileSync(new URL('../../database/migrations/0009_admin_library.sql', import.meta.url), 'utf8'));
    await client.query('INSERT INTO users (id, email, role) VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9)',
      [actor, `${actor}@example.invalid`, 'developer', owner, ownerEmail, 'user', account, accountEmail, 'user']);
    await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [paginationOwner, `${paginationOwner}@example.invalid`]);
    await client.query(`INSERT INTO recordings (user_id, title, duration_seconds, file_size_bytes)
      SELECT $1, 'Pagination fixture ' || n, 1, 1 FROM generate_series(1, 101) n`, [paginationOwner]);
    const first = await insertRecording(owner, `First ${fixture}`);
    const second = await insertRecording(owner, `Second ${fixture}`);
    const third = await insertRecording(account, `Third ${fixture}`);
    await client.query(`INSERT INTO recording_assets (recording_id, kind, storage_url, blob_pathname, mime_type, file_size_bytes)
      VALUES ($1, 'cursor', 'https://fixture.invalid/cursor.json', $2, 'application/json', 5)`, [first.id, `fixture/${fixture}/cursor.json`]);
    const attemptId = crypto.randomUUID();
    const pendingPath = `fixture/${fixture}/pending.webm`;
    await client.query(`INSERT INTO recording_upload_attempts (id, user_id, local_id, manifest)
      VALUES ($1, $2, $3, $4::jsonb)`, [attemptId, owner, 'pending', JSON.stringify([{ pathname: pendingPath }])]);
    await client.query('INSERT INTO studio_presets (user_id, preset_name) VALUES ($1, $2)', [owner, 'Keep preset']);
    await client.query('INSERT INTO studio_presets (user_id, preset_name) VALUES ($1, $2)', [account, 'Delete preset']);
    const project = (await client.query('INSERT INTO recording_projects (user_id, title) VALUES ($1, $2) RETURNING id', [owner, 'Keep project'])).rows[0];
    await client.query(`INSERT INTO recording_project_segments (project_id, recording_id, sequence_number, media_profile)
      VALUES ($1, $2, 0, '{}')`, [project.id, first.id]);

    const listing = await admin.listAdminRecordings({ nextUrl: new URL(`https://fixture.invalid?q=${ownerEmail}&page=1`) });
    assert.equal(listing.total, 2);
    assert.equal(listing.recordings[0].owner_email, ownerEmail);
    assert.equal((await admin.listAdminRecordings({ nextUrl: new URL(`https://fixture.invalid?userId=${owner}&page=999`) })).total, 2);
    assert.equal((await admin.listAdminUsers({ nextUrl: new URL(`https://fixture.invalid?q=${ownerEmail}`) })).users[0].recording_count, 2);
    const singleFile = await downloads.downloadAdminRecording(first.id, 'cursor');
    assert.equal(singleFile.files.length, 1);
    assert.ok(singleFile.files[0].name.endsWith('/cursor.json'));
    assert.equal((await downloads.downloadSelectedAdminRecordings([first.id, third.id])).files.filter(file => file.text).length, 2);
    const laterPage = await admin.listAdminRecordings({ nextUrl: new URL(`https://fixture.invalid?userId=${paginationOwner}&page=17`) });
    assert.equal(laterPage.total, 101);
    assert.equal(laterPage.recordings.length, 5, 'recordings beyond the old 50-row limit remain accessible');
    const exportPage = await downloads.downloadUserAdminRecordings(paginationOwner, { nextUrl: new URL('https://fixture.invalid') });
    assert.equal(exportPage.files.length, 100);
    assert.ok(exportPage.nextCursor);
    const exportLast = await downloads.downloadUserAdminRecordings(paginationOwner, {
      nextUrl: new URL(`https://fixture.invalid?cursor=${exportPage.nextCursor}&snapshotAt=${exportPage.snapshotAt}`),
    });
    assert.equal(exportLast.files.length, 1);
    assert.equal(exportLast.nextCursor, null);

    await assert.rejects(deletions.createAdminDeletion(actor, actor, 'account', null, `${actor}@example.invalid`), { status: 403 });
    await expectSqlRejection(() => deletions.createAdminDeletion(actor, owner, 'recordings', null, 'wrong@example.invalid'), '22023');
    const single = await deletions.createAdminDeletion(actor, owner, 'recording', first.id, null);
    assert.equal(await deletions.createAdminDeletion(actor, owner, 'recording', first.id, null), single, 'repeated create reuses active job');
    await expectSqlRejection(() => deletions.createAdminDeletion(actor, owner, 'account', null, ownerEmail), '55000');
    await expectSqlRejection(() => client.query(`INSERT INTO recording_assets (recording_id, kind, storage_url, blob_pathname, mime_type, file_size_bytes)
      VALUES ($1, 'screen', 'https://fixture.invalid/screen', 'fixture/screen', 'video/webm', 1)`, [first.id]), '55000');

    failBlob = true;
    assert.equal((await deletions.runAdminDeletion(single)).status, 'failed');
    assert.equal((await client.query('SELECT id FROM recordings WHERE id = $1', [first.id])).rowCount, 1);
    failBlob = false;
    assert.equal((await deletions.runAdminDeletion(single)).status, 'completed');
    assert.equal(deleted.includes(first.blob_pathname), true);
    assert.equal(deleted.includes(second.blob_pathname), false);
    assert.equal((await client.query('SELECT revision FROM recording_projects WHERE id = $1', [project.id])).rows[0].revision, 1);

    const all = await deletions.createAdminDeletion(actor, owner, 'recordings', null, ownerEmail);
    assert.equal((await client.query('SELECT status FROM recording_upload_attempts WHERE id = $1', [attemptId])).rows[0].status, 'cancelled');
    await expectSqlRejection(() => insertRecording(owner, 'Late completion'), '55000');
    await expectSqlRejection(() => client.query("UPDATE recording_upload_attempts SET status = 'completed' WHERE id = $1", [attemptId]), '55000');
    await expectSqlRejection(() => client.query(`INSERT INTO recording_upload_attempts (id, user_id, local_id, manifest)
      VALUES ($1, $2, 'new-upload', '[]')`, [crypto.randomUUID(), owner]), '55000');
    assert.equal((await deletions.runAdminDeletion(all)).status, 'completed');
    assert.equal(deleted.includes(pendingPath), true);
    assert.equal((await client.query('SELECT id FROM users WHERE id = $1', [owner])).rowCount, 1);
    assert.equal((await client.query('SELECT id FROM studio_presets WHERE user_id = $1', [owner])).rowCount, 1);
    assert.equal((await client.query('SELECT id FROM recording_projects WHERE user_id = $1', [owner])).rowCount, 1);
    assert.equal((await client.query('SELECT id FROM recordings WHERE user_id = $1', [owner])).rowCount, 0);

    const full = await deletions.createAdminDeletion(actor, account, 'account', null, accountEmail);
    failClerk = true;
    assert.equal((await deletions.runAdminDeletion(full)).status, 'failed');
    assert.equal((await client.query('SELECT id FROM users WHERE id = $1', [account])).rowCount, 1);
    failClerk = false;
    assert.equal((await deletions.runAdminDeletion(full)).status, 'completed');
    assert.equal((await client.query('SELECT id FROM users WHERE id = $1', [account])).rowCount, 0);
    assert.equal((await client.query('SELECT id FROM studio_presets WHERE user_id = $1', [account])).rowCount, 0);
    assert.equal((await deletions.getAdminDeletion(full)).blob_pathnames.includes(third.blob_pathname), true, 'manifest survives the Clerk webhook cascade');
    assert.equal((await client.query('INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id', [account, accountEmail])).rowCount, 0, 'delayed Clerk events cannot recreate deleted users');
    assert.equal(await deletions.cleanupDeletedAdminUpload(third.blob_pathname, new Request('https://fixture.invalid')), true);
    assert.equal(await deletions.cleanupDeletedAdminUpload('unrelated/path', new Request('https://fixture.invalid')), false);
    assert.equal((await deletions.runAdminDeletion(full)).status, 'completed', 'retry after completion is idempotent');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
