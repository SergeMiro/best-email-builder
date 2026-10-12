/**
 * ENGINE LOADING — the modules `import()` returns differ by bundler; the
 * adapter must get the same values from all of them.
 *
 * Regression: under webpack (Next.js) `grapesjs-mjml` arrived wrapped twice
 * and the builder never started ("mjmlPlugin is not a function").
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unwrapModule } from '../../src/adapters/grapesjs/unwrapModule.js';

const plugin = function mjmlPlugin() {};
/** What a module namespace looks like (`Symbol.toStringTag` = 'Module'). */
const namespace = (fields) => Object.freeze(Object.assign(Object.create(null), fields, { [Symbol.toStringTag]: 'Module' }));

test('CommonJS module flagged __esModule, as Vite / esbuild hand it over', () => {
  assert.equal(unwrapModule(namespace({ default: plugin })), plugin);
});

test('same module through webpack from an ES module package: wrapped twice', () => {
  const cjs = { __esModule: true, default: plugin };
  assert.equal(unwrapModule(namespace({ default: cjs })), plugin);
});

test('plain CommonJS object without __esModule: one layer only', () => {
  const exportsObject = { 'grapesjs-mjml': { category: '' } };
  assert.equal(unwrapModule(namespace({ default: exportsObject })), exportsObject);
});

test('ES module whose default export is an object: never peeled further', () => {
  const grapesjs = { init() {}, version: '0.22.16' };
  assert.equal(unwrapModule(namespace({ default: grapesjs })), grapesjs);
  const locale = { default: 'not an interop layer' };
  assert.equal(unwrapModule(namespace({ default: locale })), locale);
});

// The plugin itself needs a browser (`window`) to load; its locale, a
// CommonJS module flagged `__esModule` like it, comes through Node's `import()`
// wrapped twice too.
test('real CommonJS module, as Node imports it', async () => {
  const fr = unwrapModule(await import('grapesjs-mjml/locale/fr.js'));
  assert.ok(fr['grapesjs-mjml'], 'locale object, not its wrapper');
});
