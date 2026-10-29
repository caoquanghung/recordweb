import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { Pool, neonConfig } from '@neondatabase/serverless';
import * as protocol from '../../src/lib/recordingUploadProtocol.ts';
import * as titles from '../../src/lib/recordingTitle.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');

test('upload lifecycle uses real PostgreSQL constraints and atomic completion (all fixture rows rolled back)', {
  skip: !process.env.DATABASE_URL,
}, async () => {
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const deleted = [];
  const blobMetadata = new Map();
  const sql = async (strings, ...values) => {
    const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '');
    return (await client.query(query, values)).rows;
  };
  const exported = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../../src/lib/recordingUploads.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    module: exported, exports: exported.exports, Date, console,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/lib/db') return { getDb: () => sql };
      if (name === '@/lib/blobCredentials') return { getBlobCommandCredentials: () => ({}) };
      if (name === '@/lib/recordingUploadProtocol') return protocol;
      if (name === '@/lib/recordingTitle') return titles;
      if (name === '@vercel/blob') return {
        del: async paths => { deleted.push(...paths); },
        head: async path => { assert.ok(blobMetadata.has(path)); return blobMetadata.get(path); },
      };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const api = exported.exports;
  const userId = `upload-test-${crypto.randomUUID()}`;
  const assetInput = [{ kind: 'composite', mimeType: 'video/webm', size: 10 }, { kind: 'cursor', mimeType: 'application/json', size: 8 }];
  const start = async () => {
    const id = crypto.randomUUID();
    const localId = crypto.randomUUID();
    const result = await api.startUploadAttempt(userId, id, localId, assetInput);
    for (const asset of result.attempt.manifest) {
      blobMetadata.set(asset.pathname, { pathname: asset.pathname, contentType: asset.contentType, size: asset.size, url: `https://fixture.invalid/${asset.pathname}` });
    }
    return { id, localId, attempt: result.attempt };
  };
  const body = id => ({
    attempt_id: id, title: 'Upload lifecycle test', recorded_at: '2026-10-29T00:00:00.000Z',
    duration_seconds: 10, assets: [{ kind: 'composite', resolution: '1920x1080', fps: 30 }, { kind: 'cursor' }],
  });
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL statement_timeout = 15000');
    await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.invalid`]);

    const first = await start();
    await api.authorizeUploadPath(userId, first.attempt.manifest[0].pathname);
    await assert.rejects(api.authorizeUploadPath('another-user', first.attempt.manifest[0].pathname));
    await assert.rejects(api.authorizeUploadPath(userId, `recording-uploads/${first.id}/unexpected.webm`));
    assert.equal((await api.startUploadAttempt(userId, first.id, first.localId, assetInput)).attempt.id, first.id, 'start is idempotent despite JSONB key ordering');
    await assert.rejects(api.startUploadAttempt(userId, crypto.randomUUID(), first.localId, assetInput), /already being saved/);
    const saved = await api.completeUploadAttempt(userId, body(first.id), new Request('https://fixture.invalid'));
    assert.equal(saved.assets.length, 2);
    assert.equal((await api.cancelUploadAttempt(userId, first.id, first.localId, assetInput)).status, 'completed');
    await api.handleUploadCompleted(first.attempt.manifest[0].pathname, new Request('https://fixture.invalid'));
    assert.equal(deleted.length, 0, 'completed assets must survive cancellation and late callbacks');
    assert.equal((await api.completeUploadAttempt(userId, body(first.id), new Request('https://fixture.invalid'))).id, saved.id);

    const cancelled = await start();
    await api.cancelUploadAttempt(userId, cancelled.id, cancelled.localId, assetInput);
    await assert.rejects(api.completeUploadAttempt(userId, body(cancelled.id), new Request('https://fixture.invalid')), /cancelled/);
    await api.handleUploadCompleted(cancelled.attempt.manifest[0].pathname, new Request('https://fixture.invalid'));
    assert.equal(deleted.includes(cancelled.attempt.manifest[0].pathname), true);
    assert.equal(deleted.some(path => path.includes(first.id)), false);

    const beforeStartId = crypto.randomUUID();
    const beforeStartLocal = crypto.randomUUID();
    await api.cancelUploadAttempt(userId, beforeStartId, beforeStartLocal, assetInput);
    await assert.rejects(api.startUploadAttempt(userId, beforeStartId, beforeStartLocal, assetInput));

    const expired = await start();
    await client.query("UPDATE recording_upload_attempts SET lease_expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [expired.id]);
    await assert.rejects(api.completeUploadAttempt(userId, body(expired.id), new Request('https://fixture.invalid')), /expired/);
    await api.cleanupExpiredUploads(undefined, userId);
    assert.equal((await api.getUploadAttempt(expired.id, userId)).status, 'cancelled');
    assert.equal(deleted.includes(expired.attempt.manifest[0].pathname), true);

    const atomic = await start();
    await client.query('SAVEPOINT invalid_asset');
    const invalid = body(atomic.id);
    invalid.assets[0].resolution = 'x'.repeat(100);
    await assert.rejects(api.completeUploadAttempt(userId, invalid, new Request('https://fixture.invalid')));
    await client.query('ROLLBACK TO SAVEPOINT invalid_asset');
    assert.equal((await api.getUploadAttempt(atomic.id, userId)).status, 'uploading', 'failed asset metadata rolls back completion claim');
    assert.equal(await api.findSavedRecording(userId, atomic.localId), null, 'no partial recording row remains');
    assert.equal((await api.completeUploadAttempt(userId, body(atomic.id), new Request('https://fixture.invalid'))).assets.length, 2);

    await client.query('SAVEPOINT duplicate_local');
    await assert.rejects(client.query(`INSERT INTO recordings (user_id, local_id, title, duration_seconds, file_size_bytes)
      VALUES ($1, $2, 'Duplicate', 10, 10)`, [userId, first.localId]), { code: '23505' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_local');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
