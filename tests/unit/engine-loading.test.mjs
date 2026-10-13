/**
 * ENGINE LOADING — the modules `import()` returns differ by bundler; the
 * adapter must get the same values from all of them.
 *
 * Regression: under webpack (Next.js) a CommonJS package (then
 * `grapesjs-mjml`, now `mjml-browser`) arrived wrapped twice and the builder
 * never started ("… is not a function").
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { functionExport, unwrapModule } from '../../src/engine/unwrapModule.js';

const plugin = function mjml2html() {};
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
  const exportsObject = { 'mjml-browser': { category: '' } };
  assert.equal(unwrapModule(namespace({ default: exportsObject })), exportsObject);
});

test('ES module whose default export is an object: never peeled further', () => {
  const library = { init() {}, version: '1.0.0' };
  assert.equal(unwrapModule(namespace({ default: library })), library);
  const locale = { default: 'not an interop layer' };
  assert.equal(unwrapModule(namespace({ default: locale })), locale);
});

// mjml-browser is CommonJS: through Node's `import()` it comes wrapped, and
// the canvas compiler must still be the function.
test('the real canvas compiler, as Node imports it', async () => {
  const mjml2html = functionExport(await import('mjml-browser'));
  assert.equal(typeof mjml2html, 'function');
  const result = await mjml2html('<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>');
  assert.deepEqual(result.errors, []);
  assert.match(result.html, />Hi</);
});

test('functionExport: the compiler function under every bundler', () => {
  const fn = function mjml2html() {};
  fn.extra = true;
  // Vite, dynamic import of a CommonJS module: a plain object, no module flag.
  assert.equal(functionExport(namespace({ default: { ...fn, extra: true, default: fn } })), fn);
  // webpack: wrapped twice.
  assert.equal(functionExport(namespace({ default: { __esModule: true, default: fn } })), fn);
  // Already the function.
  assert.equal(functionExport(fn), fn);
  // Nothing usable.
  assert.equal(functionExport(namespace({ default: { nothing: 1 } })), null);
});
