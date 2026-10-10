/**
 * CORE of the builder — no browser, no engine: the adapter is a fake that
 * records its calls.
 *
 * What is locked here is the CONTRACT everything else depends on:
 *   - no call goes through before `initialize` nor after `destroy`;
 *   - a `destroy` while the engine loads (React unmount, strict mode) never
 *     ends with an editor declared ready;
 *   - features start with the editor and stop with it;
 *   - a block is resolved by its id in the registry, never otherwise;
 *   - the document is a versioned envelope, refused when unreadable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../../src/core/registry.js';
import { createEmitter } from '../../src/core/events.js';
import { createEmailEditor } from '../../src/core/EmailEditor.js';
import { createDocument, readDocument, serializeDocument, EmailDocumentError } from '../../src/core/document.js';
import { readFileSync } from 'node:fs';
import { EMAIL_BUILDER_VERSION, EMAIL_DOCUMENT_SCHEMA_VERSION } from '../../src/core/constants.js';

/** Fake adapter: records calls, returns predictable values. */
function fakeAdapter({ delay = 0 } = {}) {
  const calls = [];
  let onEvent = () => {};
  let selection = null;
  return {
    name: 'fake',
    version: '0.0.1',
    calls,
    emit: (type, payload) => onEvent(type, payload),
    setSelection: (s) => {
      selection = s;
    },
    async initialize(options) {
      calls.push(['initialize', options.blocks.length, options.document]);
      onEvent = options.onEvent;
      if (delay) await new Promise((r) => setTimeout(r, delay));
    },
    destroy: () => calls.push(['destroy']),
    addBlock: (block, opts) => {
      calls.push(['addBlock', block.id, opts]);
      return 'new-id';
    },
    remove: (id) => (calls.push(['remove', id]), true),
    duplicate: (id) => (calls.push(['duplicate', id]), 'copy-id'),
    move: (id, dir) => (calls.push(['move', id, dir]), true),
    select: (id) => calls.push(['select', id]),
    getSelection: () => selection,
    describe: (id) => (id === 'body-1' ? { id, tagName: 'mj-section', attributes: { 'padding-top': '4px' } } : null),
    getRootId: () => 'body-1',
    updateProperties: (id, values) => calls.push(['updateProperties', id, values]),
    setContent: (id, content) => calls.push(['setContent', id, content]),
    insertText: (text) => (calls.push(['insertText', text]), true),
    insertLink: (href, label) => (calls.push(['insertLink', href, label]), true),
    undo: () => calls.push(['undo']),
    redo: () => calls.push(['redo']),
    canUndo: () => true,
    canRedo: () => false,
    clearHistory: () => calls.push(['clearHistory']),
    getProject: () => ({ pages: [{ id: 'p1' }] }),
    loadProject: (project) => calls.push(['loadProject', project]),
    loadMjml: (mjml) => calls.push(['loadMjml', mjml]),
    exportMjml: () => '<mjml><mj-body></mj-body></mjml>',
    exportHtml: () => ({ html: '<html></html>', errors: [] }),
    setDevice: (d) => calls.push(['setDevice', d]),
    getDevice: () => 'desktop',
    startBlockDrag: (block) => calls.push(['startBlockDrag', block.id]),
    endBlockDrag: (cancel) => calls.push(['endBlockDrag', cancel]),
    addShortcut: (id, keys) => (calls.push(['addShortcut', id, keys]), () => calls.push(['removeShortcut', id])),
  };
}

const TEXT_BLOCK = { id: 'text', label: 'Text', icon: 'Type', kind: 'content', tagName: 'mj-text', mjml: '<mj-text>Text</mj-text>', properties: [] };
const SECTION_STRUCTURE = { id: 'section', label: 'Section', icon: 'Rows', kind: 'structure', tagName: 'mj-section', properties: [] };
const container = /** @type {any} */ ({});

async function quietly(fn) {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

test('registry: order, duplicates, ids, unregister, filter', () => {
  const reg = createRegistry('test', [{ id: 'b', order: 2 }, { id: 'a', order: 1 }, { id: 'c' }]);
  assert.deepEqual(reg.list().map((x) => x.id), ['a', 'b', 'c']);
  assert.throws(() => reg.register({ id: 'a' }), /already registered/);
  assert.throws(() => reg.register({ id: 'Bad Id' }), /invalid id/);
  const unregister = reg.register({ id: 'd' });
  unregister();
  assert.equal(reg.has('d'), false);
  assert.equal(reg.list((x) => x.id !== 'b').length, 2);
});

test('emitter: a throwing listener does not stop the others', () => {
  const errors = [];
  const em = createEmitter({ onError: (e) => errors.push(e) });
  const seen = [];
  em.on('x', () => {
    throw new Error('broken panel');
  });
  const off = em.on('x', (p) => seen.push(p));
  em.emit('x', 1);
  off();
  em.emit('x', 2);
  assert.deepEqual(seen, [1]);
  assert.equal(errors.length, 2);
});

test('editor lifecycle, blocks, implicit target, document, destroy', async () => {
  const adapter = fakeAdapter();
  const blocks = createRegistry('emailBlocks', [TEXT_BLOCK, SECTION_STRUCTURE]);
  const started = [];
  const features = createRegistry('emailBuilderFeatures', [
    { id: 'one', setup: () => (started.push('one'), () => started.push('one:stop')) },
    { id: 'off', enabled: false, setup: () => started.push('off') },
    {
      id: 'broken',
      setup: () => {
        throw new Error('broken');
      },
    },
  ]);
  const editor = createEmailEditor({ adapter, blocks, features });

  assert.equal(editor.status, 'idle');
  assert.throws(() => editor.exportMjml(), /before the editor was initialized/);
  assert.equal(editor.getSelection(), null);
  assert.equal(editor.canUndo(), false);

  let readyEvents = 0;
  editor.on('ready', () => (readyEvents += 1));
  await quietly(() => editor.initialize({ container }));

  assert.equal(editor.status, 'ready');
  assert.equal(readyEvents, 1);
  assert.deepEqual(adapter.calls[0].slice(0, 2), ['initialize', 2]);
  assert.deepEqual(started, ['one'], 'only enabled features start; a broken one stops nothing');
  await assert.rejects(editor.initialize({ container }), /initialization refused/);

  let selectionPayload;
  editor.on('selection', (p) => (selectionPayload = p));
  adapter.emit('selection', { id: 'x' });
  assert.equal(selectionPayload?.id, 'x');

  assert.equal(editor.addBlock('text'), 'new-id');
  assert.throws(() => editor.addBlock('unknown'), /unknown block/);
  assert.throws(() => editor.addBlock('section'), /unknown block/, 'a structure (no MJML) cannot be inserted');

  assert.throws(() => editor.remove(), /no selected element/);
  adapter.setSelection({ id: 'sel-1' });
  editor.remove();
  editor.duplicate();
  editor.move(1);
  editor.updateProperties({ color: '#000' });
  assert.deepEqual(
    adapter.calls.slice(-4).map((c) => [c[0], c[1]]),
    [['remove', 'sel-1'], ['duplicate', 'sel-1'], ['move', 'sel-1'], ['updateProperties', 'sel-1']]
  );
  assert.throws(() => editor.move(2), /invalid move direction/);
  assert.throws(() => editor.setDevice('tablet'), /unknown device/);

  const element = editor.getElement(editor.getRootId());
  assert.equal(element?.blockId, 'section');
  assert.equal(element.label, 'Section');
  assert.equal(editor.getElement('absent'), null);

  const doc = editor.getDocument();
  assert.equal(doc.engine, 'fake');
  assert.equal(doc.engineVersion, '0.0.1');
  assert.equal(doc.schemaVersion, EMAIL_DOCUMENT_SCHEMA_VERSION);
  editor.loadDocument(JSON.stringify(doc));
  assert.equal(adapter.calls.at(-1)[0], 'clearHistory', 'history cleared after loading');
  assert.throws(() => editor.loadDocument({ ...doc, engine: 'other' }), /engine "other"/);

  editor.destroy();
  assert.equal(editor.status, 'idle');
  assert.equal(started.at(-1), 'one:stop');
  assert.equal(adapter.calls.at(-1)[0], 'destroy');
  assert.throws(() => editor.exportMjml(), /before the editor was initialized/);

  await quietly(() => editor.initialize({ container }));
  assert.equal(editor.status, 'ready', 'can be initialized again after destroy');
  editor.destroy();
});

test('destroy while the engine loads (React strict mode)', async () => {
  const adapter = fakeAdapter({ delay: 20 });
  const editor = createEmailEditor({ adapter, blocks: createRegistry('emailBlocks', []) });
  let ready = 0;
  editor.on('ready', () => (ready += 1));
  const pending = editor.initialize({ container });
  editor.destroy();
  await pending;
  assert.equal(editor.status, 'idle');
  assert.equal(ready, 0, 'no ready event for a stale initialization');
  await editor.initialize({ container });
  assert.equal(editor.status, 'ready');
  assert.equal(ready, 1);
  editor.destroy();
});

test('document envelope', () => {
  const doc = createDocument({ engine: 'grapesjs-mjml', engineVersion: '0.22.16', project: { pages: [] } });
  assert.deepEqual(readDocument(serializeDocument(doc)), doc);
  assert.throws(() => readDocument('{not json'), /invalid JSON/);
  assert.throws(() => readDocument({ engine: 'x', project: {} }), /schema version/);
  assert.throws(() => readDocument({ ...doc, schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION + 1 }), /newer version/);
  assert.throws(() => readDocument({ ...doc, project: [] }), /engine project/);
  assert.throws(
    () => readDocument(null),
    (error) => error instanceof EmailDocumentError && error.status === 422
  );
});

test('the builder version written into every template is the published package version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(EMAIL_BUILDER_VERSION, pkg.version);
});
