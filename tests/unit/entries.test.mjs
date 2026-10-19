/**
 * ENTRIES — block A (`/library`) and block B (`/builder`) are installable
 * one without the other: bundling one entry must not reach the other's code.
 * The bank must not drag the editor (its engine, the canvas, the 1.2 MB MJML
 * compiler) into an app that only lists templates, and the editor must not drag the bank into an app
 * that has its own.
 *
 * The AI is a module (`/ai`, `/ai/server`): no other entry reaches its code
 * or its texts, so an application without it ships no AI at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function graph(entry) {
  const { metafile, outputFiles } = await build({
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
    // Texts as written (not \u-escaped): the checks below search for them.
    charset: 'utf8',
  });
  const inputs = Object.keys(metafile.inputs);
  const packages = new Set(Object.values(metafile.inputs).flatMap((i) => i.imports.filter((x) => x.external).map((x) => x.path)));
  return { inputs, packages, text: outputFiles[0].text };
}

test('block A alone: the library entry reaches neither the editor nor its engine', async () => {
  const { inputs, packages } = await graph('src/library.js');
  assert.ok(inputs.includes('src/ui/library/TemplateLibrary.jsx'));
  // The bases are the editor's (its Templates button): not even the gallery.
  // (The memory storage cleans the brand, whose module repaints MJML with the
  // engine's text parser — model.js and mjml.js, no dependency — and a few
  // pure helpers of the blocks; the rest of the engine and the canvas stay out.)
  const PURE = new Set(['src/engine/model.js', 'src/engine/mjml.js', 'src/blocks/shared.js']);
  const editor = inputs.filter(
    (f) =>
      f === 'src/ui/EmailBuilder.jsx' ||
      f === 'src/defaultEditor.js' ||
      ((f.startsWith('src/engine/') || f.startsWith('src/blocks/')) && !PURE.has(f)) ||
      f === 'src/features/templates/gallery.js' ||
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

/** Words only the AI module has: its buttons, its prompts. */
const AI_MARKERS = ['Suggest subjects', 'Rewrite with AI', 'Proofread the email', 'Suggérer des objets', 'You write email subject lines', 'You proofread an email'];

for (const entry of ['src/index.js', 'src/builder.js', 'src/library.js', 'src/server/index.js']) {
  test(`without the AI module: ${entry} reaches none of its code, texts or SDK`, async () => {
    const { inputs, packages, text } = await graph(entry);
    assert.deepEqual(inputs.filter((f) => f.startsWith('src/ai/')), []);
    assert.deepEqual(AI_MARKERS.filter((marker) => text.includes(marker)), []);
    assert.ok(![...packages].some((p) => p.startsWith('@anthropic-ai/')), 'no Anthropic SDK');
  });
}

test('the AI module: its buttons and their texts, without the builder or the library', async () => {
  const { inputs, text } = await graph('src/ai/index.js');
  for (const file of ['src/ai/createAi.js', 'src/ai/ProofreadButton.jsx', 'src/ai/RewriteText.jsx', 'src/ai/SubjectIdeas.jsx', 'src/ai/i18n/fr.js']) {
    assert.ok(inputs.includes(file), file);
  }
  assert.deepEqual(AI_MARKERS.filter((marker) => !text.includes(marker)), []);
  assert.deepEqual(
    inputs.filter((f) => f === 'src/ui/EmailBuilder.jsx' || f.startsWith('src/ui/library/') || f.startsWith('src/engine/canvas')),
    []
  );
});

test('the AI module for the server: no React, no interface', async () => {
  const { inputs, packages } = await graph('src/ai/server.js');
  assert.ok(inputs.includes('src/ai/generator.js'));
  assert.deepEqual(inputs.filter((f) => f.endsWith('.jsx') || f.startsWith('src/ui/')), []);
  assert.deepEqual([...packages].filter((p) => /^(react|react-dom|lucide-react|radix-ui)(\/|$)/.test(p)), []);
});
