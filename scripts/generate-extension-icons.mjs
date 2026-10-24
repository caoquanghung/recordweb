import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const repositoryRoot = resolve(import.meta.dirname, '..');
const iconsDirectory = join(repositoryRoot, 'extension', 'icons');
const svg = await readFile(join(iconsDirectory, 'icon.svg'), 'utf8');
const sizes = [16, 32, 48, 128];
const browser = await chromium.launch({ headless: true });

try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`
      <style>
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: transparent; }
        svg { width: 100%; height: 100%; display: block; }
      </style>
      ${svg}
    `);
    await page.screenshot({
      path: join(iconsDirectory, `icon-${size}.png`),
      omitBackground: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`Generated extension icons: ${sizes.join(', ')}px`);
