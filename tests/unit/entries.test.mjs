/**
 * ENTRIES — block A (`/library`) and block B (`/builder`) are installable
 * one without the other: bundling one entry must not reach the other's code.
 * The bank must not drag the editor (its engine, the canvas, the 1.2 MB MJML
 * compiler) into an app that only lists templates, and the editor must not drag the bank into an app
 * that has its own.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function graph(entry) {
  const { metafile } = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'neutral',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.js': 'jsx' },
    logLevel: 'silent',
  });
  const inputs = Object.keys(metafile.inputs);
  const packages = new Set(Object.values(metafile.inputs).flatMap((i) => i.imports.filter((x) => x.external).map((x) => x.path)));
  return { inputs, packages };
}

test('block A alone: the library entry reaches neither the editor nor its engine', async () => {
  const { inputs, packages } = await graph('src/library.js');
  assert.ok(inputs.includes('src/ui/library/TemplateLibrary.jsx'));
  // (The bases reuse a few pure MJML helpers of the blocks, and the brand
  // repaints them with the engine's text parser — model.js and mjml.js, no
  // dependency; the rest of the engine and the canvas stay out.)
  const PURE_PARSER = new Set(['src/engine/model.js', 'src/engine/mjml.js']);
  const editor = inputs.filter(
    (f) =>
      f === 'src/ui/EmailBuilder.jsx' ||
      f === 'src/defaultEditor.js' ||
      (f.startsWith('src/engine/') && !PURE_PARSER.has(f)) ||
      f.startsWith('src/core/EmailEditor'),
  );
  assert.deepEqual(editor, []);
  assert.deepEqual([...packages].filter((p) => p.startsWith('mjml')), [], 'no MJML compiler in the bank');
});

test('block B alone: the builder entry does not reach the library', async () => {
  const { inputs } = await graph('src/builder.js');
  assert.ok(inputs.includes('src/ui/EmailBuilder.jsx'));
  assert.deepEqual(inputs.filter((f) => f.startsWith('src/ui/library/') || f === 'src/ui/EmailStudio.jsx'), []);
});
