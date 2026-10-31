import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const directory = new URL('../../src/components/studio/', import.meta.url);
const facade = postcss.parse(readFileSync(new URL('StudioShell.module.css', directory), 'utf8'));

test('Studio CSS facade composes every component-local identity used by contextual selectors', () => {
  const modules = new Map();
  const composed = new Set();
  facade.walkDecls('composes', declaration => {
    const match = /^([\w-]+) from ['"]\.\/([\w-]+\.module\.css)['"]$/.exec(declaration.value);
    assert.ok(match, `Unsupported composition: ${declaration.value}`);
    const [, name, filename] = match;
    assert.equal(declaration.parent.selector, `.${name}`, 'Compose matching class roles, not unrelated styles');
    composed.add(`${filename}:${name}`);
    if (!modules.has(filename)) {
      modules.set(filename, postcss.parse(readFileSync(new URL(filename, directory), 'utf8')));
    }
  });
  assert.ok(modules.size > 1, 'Component styles must remain split into owned modules');
  for (const [filename, root] of modules) {
    const names = new Set();
    root.walkRules(rule => {
      const selector = rule.selector.replace(/:global\([^)]*\)/g, '');
      for (const match of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) names.add(match[1]);
    });
    for (const name of names) {
      assert.ok(composed.has(`${filename}:${name}`),
        `.${name} must compose its ${filename} identity so descendant selectors still match`);
    }
  }
});

test('Studio CSS facade contains no UI declarations or duplicate stylesheet imports', () => {
  facade.walkDecls(declaration => {
    assert.equal(declaration.prop, 'composes', `Move ${declaration.prop} into its component-owned module`);
  });
  facade.walkAtRules('import', () => assert.fail('Composition already loads these styles; @import duplicates Turbopack CSS output'));
});
