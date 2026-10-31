import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const extensionRoot = join(repositoryRoot, 'extension');
const outputRoot = join(repositoryRoot, 'artifacts', 'extension-development');
const developmentOrigin = 'http://localhost:3000';

const productionManifest = JSON.parse(await readFile(join(extensionRoot, 'manifest.json'), 'utf8'));
const productionOrigin = new URL(productionManifest.homepage_url).origin;
if (productionOrigin === developmentOrigin) {
  throw new Error('The publication manifest must not point to localhost.');
}

const developmentMatch = `${developmentOrigin}/*`;
const productionMatch = `${productionOrigin}/*`;
const developmentManifest = {
  ...productionManifest,
  name: `${productionManifest.name} (Development)`,
  homepage_url: `${developmentOrigin}/`,
  host_permissions: productionManifest.host_permissions.flatMap((match) =>
    match === productionMatch ? [developmentMatch, productionMatch] : [match],
  ),
  content_scripts: productionManifest.content_scripts.map((script) => ({
    ...script,
    matches: script.js.includes('recordweb-bridge.js')
      ? [developmentMatch, productionMatch]
      : script.matches,
  })),
};

if (!developmentManifest.host_permissions.includes(developmentMatch)
  || !developmentManifest.content_scripts.some((script) =>
    script.js.includes('recordweb-bridge.js')
      && script.matches.includes(developmentMatch)
      && script.matches.includes(productionMatch)
  )) {
  throw new Error('Could not add localhost alongside the publication origin.');
}

await mkdir(join(repositoryRoot, 'artifacts'), { recursive: true });
await rm(outputRoot, { recursive: true, force: true });
await cp(extensionRoot, outputRoot, { recursive: true, filter: (source) =>
  source !== join(extensionRoot, 'tests')
  && source !== join(extensionRoot, 'releases')
  && source !== join(extensionRoot, 'README.md')
  && source !== join(extensionRoot, 'icons', 'icon.svg'),
});
await writeFile(join(outputRoot, 'manifest.json'), `${JSON.stringify(developmentManifest, null, 2)}\n`);

console.log(`Development extension ready: ${outputRoot}`);
console.log(`Open ${developmentManifest.homepage_url} after loading this directory as an unpacked extension.`);
