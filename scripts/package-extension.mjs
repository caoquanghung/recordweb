import { execFileSync } from 'node:child_process';
import { constants, existsSync } from 'node:fs';
import { copyFile, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const extensionRoot = join(repositoryRoot, 'extension');
const manifestPath = join(extensionRoot, 'manifest.json');
const outputDirectory = join(repositoryRoot, 'artifacts', 'chrome-web-store');
const runtimeFiles = [
  'capture-handle-main.js',
  'cursor-frame-sensor.js',
  'cursor-sampler.js',
  'extension-protocol.js',
  'google-slides.js',
  'recordweb-bridge.js',
  'resilient-port.js',
  'service-worker.js',
  'tracker-content.js',
  'tracker-controls.js',
];

function createStoreManifest(developmentManifest) {
  const homepage = new URL(developmentManifest.homepage_url);
  if (homepage.protocol !== 'https:') {
    throw new Error('Chrome Web Store homepage_url must use HTTPS.');
  }

  const appMatch = `${homepage.origin}/*`;
  const slidesMatch = 'https://docs.google.com/presentation/*';
  const contentScripts = developmentManifest.content_scripts.map((contentScript) => {
    if (!contentScript.js.includes('recordweb-bridge.js')) return contentScript;
    return { ...contentScript, matches: [appMatch] };
  });

  return {
    ...developmentManifest,
    host_permissions: [appMatch, slidesMatch],
    content_scripts: contentScripts,
  };
}

function validateStoreManifest(manifest) {
  const serialized = JSON.stringify(manifest);
  const forbiddenPatterns = ['localhost', '127.0.0.1', '*.vercel.app'];
  for (const pattern of forbiddenPatterns) {
    if (serialized.includes(pattern)) {
      throw new Error(`Store manifest still contains development host pattern: ${pattern}`);
    }
  }

  for (const size of ['16', '32', '48', '128']) {
    if (!manifest.icons?.[size]) throw new Error(`Store manifest is missing the ${size}px icon.`);
  }
}

async function copyPackageFiles(packageRoot, manifest) {
  await writeFile(join(packageRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await Promise.all(runtimeFiles.map((file) => cp(join(extensionRoot, file), join(packageRoot, file))));
  await cp(join(extensionRoot, 'icons'), join(packageRoot, 'icons'), { recursive: true });
  await rm(join(packageRoot, 'icons', 'icon.svg'), { force: true });
}

async function main() {
  const developmentManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const storeManifest = createStoreManifest(developmentManifest);
  validateStoreManifest(storeManifest);

  await mkdir(outputDirectory, { recursive: true });
  const packageName = `recordweb-presentation-cursor-${storeManifest.version}.zip`;
  const outputPath = join(outputDirectory, packageName);
  const releaseBackupPath = join(extensionRoot, 'releases', packageName);
  if (existsSync(outputPath) || existsSync(releaseBackupPath)) {
    throw new Error(`Publication ZIP for ${storeManifest.version} already exists. Keep that backup and increment the manifest version for a new release.`);
  }
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'recordweb-extension-'));
  const temporaryPackageRoot = join(temporaryDirectory, 'package');
  const temporaryZip = join(temporaryDirectory, packageName);

  try {
    await mkdir(temporaryPackageRoot);
    await copyPackageFiles(temporaryPackageRoot, storeManifest);
    execFileSync('zip', ['-q', '-r', temporaryZip, '.'], { cwd: temporaryPackageRoot });
    execFileSync('unzip', ['-tq', temporaryZip], { stdio: 'inherit' });
    await copyFile(temporaryZip, outputPath, constants.COPYFILE_EXCL);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(`Chrome Web Store package created: ${outputPath}`);
  console.log(`Version: ${storeManifest.version}`);
  console.log(`Production origin: ${new URL(storeManifest.homepage_url).origin}`);
  console.log(`Package: ${basename(outputPath)}`);
}

await main();
