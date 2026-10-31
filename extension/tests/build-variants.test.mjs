import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');

test('development build targets localhost and production while leaving the publication manifest intact', async () => {
  const sourcePath = join(root, 'extension', 'manifest.json');
  const before = await readFile(sourcePath, 'utf8');
  execFileSync(process.execPath, [join(root, 'scripts', 'build-extension-dev.mjs')], { cwd: root });

  const development = JSON.parse(await readFile(join(root, 'artifacts', 'extension-development', 'manifest.json'), 'utf8'));
  const publication = JSON.parse(before);
  const localhostMatch = 'http://localhost:3000/*';
  const productionMatch = `${new URL(publication.homepage_url).origin}/*`;

  assert.equal(development.homepage_url, 'http://localhost:3000/');
  assert.match(development.name, /Development/);
  assert.deepEqual(development.host_permissions, [
    localhostMatch,
    productionMatch,
    'https://docs.google.com/presentation/*',
  ]);
  assert.deepEqual(
    development.content_scripts.find((script) => script.js.includes('recordweb-bridge.js')).matches,
    [localhostMatch, productionMatch],
  );
  assert.equal(development.content_scripts.filter((script) => script.matches.includes('https://docs.google.com/presentation/*')).length, 3);
  assert.equal(development.host_permissions.includes(productionMatch), true);
  assert.equal(await readFile(sourcePath, 'utf8'), before);
  await assert.rejects(readFile(join(root, 'artifacts', 'extension-development', 'releases', `recordweb-presentation-cursor-${publication.version}.zip`)));
});
