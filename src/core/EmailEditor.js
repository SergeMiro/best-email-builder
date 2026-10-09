// @ts-check
/**
 * EmailEditor — THE email builder contract.
 *
 * ── THE ARCHITECTURE RULE ──────────────────────────────────────────────────
 *
 *     React UI ─► EmailEditor ─► adapter ─► engine (GrapesJS) ─► MJML
 *
 * The UI (`ui/`), features (`features/`) and blocks (`blocks/`) talk ONLY to
 * this object. None of them imports GrapesJS: everything engine-related lives
 * in `adapters/grapesjs/`. Swapping the engine therefore means writing another
 * adapter that fulfils `EmailEditorAdapter`, rewriting nothing above it.
 *
 * ── WHAT THIS LAYER ADDS TO THE ADAPTER ────────────────────────────────────
 *   - the lifecycle (idle → initializing → ready → idle), and a hard refusal
 *     of any call made before `initialize` or after `destroy`;
 *   - resolving blocks by id in the registry;
 *   - the versioned document envelope (`core/document.js`);
 *   - starting and stopping registered features.
 *
 * See `docs/ARCHITECTURE.md`.
 */

import { createEmitter } from './events.js';
import { EMAIL_DEVICES } from './constants.js';
import { createDocument, readDocument } from './document.js';
import { toAttributes, toValues } from './mjmlAttributes.js';

/**
 * @typedef {import('./constants.js').EmailDevice} EmailDevice
 * @typedef {import('./document.js').EmailDocument} EmailDocument
 */

/**
 * Editable block property, as shown in the right-hand panel. The key is an
 * MJML ATTRIBUTE (`color`, `padding`, `href`…) — the email's language, not
 * the engine's.
 *
 * @typedef {{
 *   key: string,
 *   label: string,
 *   type: 'text'|'textarea'|'color'|'size'|'select'|'align'|'url'|'image'|'spacing',
 *   group: string,
 *   options?: {value: string, label: string}[],
 *   placeholder?: string,
 *   min?: number,
 *   max?: number,
 *   unit?: string,
 * }} BlockProperty
 */

/**
 * Builder block.
 *
 *   `content`   : an element (text, image, button…) that lives INSIDE a column;
 *   `layout`    : an N-column section, living in the email body;
 *   `structure` : body, section, column — selectable, not addable.
 *
 * `mjml` is the inserted fragment; `sectionMjml` the same wrapped in a
 * section, for when it must go outside any column; `tagName` identifies the
 * block of a selected element (`mj-text` → text).
 * `editableContent`: the content is editable (canvas for text, panel for a
 * button label).
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description?: string,
 *   icon: string,
 *   kind: 'content'|'layout'|'structure',
 *   tagName: string,
 *   order?: number,
 *   mjml?: string,
 *   sectionMjml?: string,
 *   properties: BlockProperty[],
 *   editableContent?: boolean,
 * }} EmailBlock
 */

/**
 * Selected element as described by the ENGINE: MJML tag and raw attributes,
 * nothing more.
 *
 * @typedef {{
 *   id: string,
 *   tagName: string,
 *   attributes: Record<string, string>,
 *   content: string|null,
 *   canRemove: boolean,
 *   canDuplicate: boolean,
 *   canMoveUp: boolean,
 *   canMoveDown: boolean,
 * }} EngineSelection
 */

/**
 * Selected element, in the builder's vocabulary: its block and its property
 * values (padding recombined, see mjmlAttributes).
 *
 * @typedef {EngineSelection & {
 *   blockId: string|null,
 *   label: string,
 *   values: Record<string, string>,
 * }} EmailSelection
 */

/**
 * @typedef {{html: string, errors: {line?: number, message: string, tagName?: string}[]}} HtmlExport
 */

/**
 * What an engine must provide. All element ids are opaque strings returned by
 * the adapter itself.
 *
 * Events emitted through `onEvent(type, payload)`:
 *   `change`    the document changed (typing, add, remove, undo…)
 *   `load`      a whole document was just loaded — NOT a modification: the
 *               host screen decides whether it needs saving
 *   `selection` the selection changed — payload: EngineSelection|null
 *   `history`   undo/redo state changed — payload: {canUndo, canRedo}
 *   `device`    the displayed device changed — payload: EmailDevice
 *
 * @typedef {{
 *   name: string,
 *   version: string,
 *   initialize: (options: {
 *     container: HTMLElement,
 *     blocks: EmailBlock[],
 *     document: EmailDocument|null,
 *     onEvent: (type: string, payload?: any) => void,
 *   }) => Promise<void>,
 *   destroy: () => void,
 *   addBlock: (block: EmailBlock, options?: {targetId?: string|null}) => string|null,
 *   remove: (id: string) => boolean,
 *   duplicate: (id: string) => string|null,
 *   move: (id: string, direction: -1|1) => boolean,
 *   select: (id: string|null) => void,
 *   getSelection: () => EngineSelection|null,
 *   describe: (id: string) => EngineSelection|null,
 *   getRootId: () => string|null,
 *   updateProperties: (id: string, attributes: Record<string, string|null>) => void,
 *   setContent: (id: string, content: string) => void,
 *   insertText: (text: string) => boolean,
 *   insertLink: (href: string, label: string) => boolean,
 *   undo: () => void,
 *   redo: () => void,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 *   clearHistory: () => void,
 *   getProject: () => object,
 *   loadProject: (project: object) => void,
 *   loadMjml: (mjml: string) => void,
 *   exportMjml: () => string,
 *   exportHtml: () => HtmlExport,
 *   setDevice: (device: EmailDevice) => void,
 *   getDevice: () => EmailDevice,
 *   startBlockDrag: (block: EmailBlock, event: Event) => void,
 *   endBlockDrag: (cancel?: boolean) => void,
 *   addShortcut: (id: string, keys: string, handler: () => void) => (() => void),
 * }} EmailEditorAdapter
 */

/**
 * Pluggable feature. `setup` receives the ready editor and may return a
 * teardown function, called on `destroy`. `toolbar`: React component placed in
 * the toolbar (it receives the screen context); `options`: its settings, read
 * by the screen; `isAvailable(context)`: hides the toolbar entry when the
 * context cannot support it (e.g. a storage that cannot render).
 *
 * @typedef {{
 *   id: string,
 *   label?: string,
 *   order?: number,
 *   enabled?: boolean,
 *   setup?: (editor: EmailEditor) => (void | (() => void)),
 *   toolbar?: any,
 *   isAvailable?: (context: any) => boolean,
 *   options?: Record<string, any>,
 * }} EmailBuilderFeature
 */

/**
 * @typedef {'idle'|'initializing'|'ready'} EmailEditorStatus
 */

/**
 * @typedef {{
 *   readonly status: EmailEditorStatus,
 *   readonly adapterName: string,
 *   initialize: (options: {container: HTMLElement, document?: EmailDocument|null}) => Promise<void>,
 *   destroy: () => void,
 *   listBlocks: () => EmailBlock[],
 *   getBlock: (blockId: string) => EmailBlock|undefined,
 *   addBlock: (blockId: string, options?: {targetId?: string|null}) => string|null,
 *   remove: (id?: string|null) => boolean,
 *   duplicate: (id?: string|null) => string|null,
 *   move: (direction: -1|1, id?: string|null) => boolean,
 *   select: (id: string|null) => void,
 *   getSelection: () => EmailSelection|null,
 *   getElement: (id: string) => EmailSelection|null,
 *   getRootId: () => string|null,
 *   updateProperties: (values: Record<string, string|null>, id?: string|null) => void,
 *   setContent: (content: string, id?: string|null) => void,
 *   insertText: (text: string) => boolean,
 *   insertLink: (href: string, label: string) => boolean,
 *   undo: () => void,
 *   redo: () => void,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 *   getDocument: () => EmailDocument,
 *   loadDocument: (document: unknown) => void,
 *   loadMjml: (mjml: string) => void,
 *   exportMjml: () => string,
 *   exportHtml: () => HtmlExport,
 *   setDevice: (device: EmailDevice) => void,
 *   getDevice: () => EmailDevice,
 *   startBlockDrag: (blockId: string, event: Event) => void,
 *   endBlockDrag: (cancel?: boolean) => void,
 *   addShortcut: (id: string, keys: string, handler: () => void) => (() => void),
 *   on: (event: string, listener: (payload?: any) => void) => () => void,
 * }} EmailEditor
 */

/**
 * @param {{
 *   adapter: EmailEditorAdapter,
 *   blocks: import('./registry.js').Registry<EmailBlock>,
 *   features?: import('./registry.js').Registry<EmailBuilderFeature> | null,
 * }} options
 * @returns {EmailEditor}
 */
export function createEmailEditor({ adapter, blocks, features = null }) {
  if (!adapter) throw new Error('EmailEditor: missing adapter');
  if (!blocks) throw new Error('EmailEditor: missing block registry');

  const emitter = createEmitter();
  /** @type {EmailEditorStatus} */
  let status = 'idle';
  /** Token of the pending initialization: a `destroy` invalidates it. */
  let generation = 0;
  /** @type {(() => void)[]} */
  let teardowns = [];

  function requireReady(action) {
    if (status !== 'ready') {
      throw new Error(`EmailEditor: "${action}" called before the editor was initialized`);
    }
  }

  /** @param {string|null|undefined} id */
  function targetOf(id, action) {
    const resolved = id ?? adapter.getSelection()?.id ?? null;
    if (!resolved) throw new Error(`EmailEditor: "${action}" with no selected element`);
    return resolved;
  }

  /** Block describing a tag: structure first (a section stays a section). */
  function blockForTag(tagName) {
    const all = blocks.list();
    return (
      all.find((b) => b.tagName === tagName && b.kind === 'structure') ||
      all.find((b) => b.tagName === tagName) ||
      null
    );
  }

  /** @param {EngineSelection|null} selection @returns {EmailSelection|null} */
  function toEmailSelection(selection) {
    if (!selection) return null;
    const block = blockForTag(selection.tagName);
    return {
      ...selection,
      blockId: block?.id || null,
      label: block?.label || selection.tagName,
      values: toValues(selection.attributes || {}, block?.properties || []),
    };
  }

  function startFeatures() {
    if (!features) return;
    for (const feature of features.list((f) => f.enabled !== false)) {
      try {
        const stop = feature.setup?.(editor);
        if (typeof stop === 'function') teardowns.push(stop);
      } catch (error) {
        // A broken feature must not prevent editing.
        console.warn(`[mailblocks] feature "${feature.id}" failed`, error);
      }
    }
  }

  function stopFeatures() {
    for (const stop of teardowns.reverse()) {
      try {
        stop();
      } catch (error) {
        console.warn('[mailblocks] feature teardown failed', error);
      }
    }
    teardowns = [];
  }

  /** @type {EmailEditor} */
  const editor = {
    get status() {
      return status;
    },
    get adapterName() {
      return adapter.name;
    },

    async initialize({ container, document = null }) {
      if (!container) throw new Error('EmailEditor: missing container');
      if (status !== 'idle') {
        throw new Error(`EmailEditor: initialization refused (status "${status}")`);
      }
      const ticket = ++generation;
      status = 'initializing';
      try {
        await adapter.initialize({
          container,
          blocks: blocks.list(),
          document: document ? readDocument(document) : null,
          onEvent: (type, payload) => {
            if (ticket !== generation) return;
            emitter.emit(type, type === 'selection' ? toEmailSelection(payload) : payload);
          },
        });
      } catch (error) {
        if (ticket === generation) status = 'idle';
        throw error;
      }
      // Destroyed while the engine was loading (React unmount, StrictMode):
      // the adapter is already released, nothing is declared ready.
      if (ticket !== generation) return;
      status = 'ready';
      startFeatures();
      emitter.emit('ready');
    },

    destroy() {
      generation += 1;
      stopFeatures();
      const etait = status;
      status = 'idle';
      adapter.destroy();
      if (etait === 'ready') emitter.emit('destroy');
    },

    listBlocks: () => blocks.list(),
    getBlock: (blockId) => blocks.get(blockId),

    addBlock(blockId, options = {}) {
      requireReady('addBlock');
      const block = blocks.get(blockId);
      if (!block || !block.mjml) throw new Error(`EmailEditor: unknown block "${blockId}"`);
      return adapter.addBlock(block, options);
    },

    remove(id = null) {
      requireReady('remove');
      return adapter.remove(targetOf(id, 'remove'));
    },

    duplicate(id = null) {
      requireReady('duplicate');
      return adapter.duplicate(targetOf(id, 'duplicate'));
    },

    move(direction, id = null) {
      requireReady('move');
      if (direction !== -1 && direction !== 1) throw new Error('EmailEditor: invalid move direction');
      return adapter.move(targetOf(id, 'move'), direction);
    },

    select(id) {
      requireReady('select');
      adapter.select(id);
    },

    getSelection() {
      return status === 'ready' ? toEmailSelection(adapter.getSelection()) : null;
    },

    getElement(id) {
      return status === 'ready' && id ? toEmailSelection(adapter.describe(id)) : null;
    },

    /** The email body: page background and width, edited without a selection. */
    getRootId: () => (status === 'ready' ? adapter.getRootId() : null),

    updateProperties(values, id = null) {
      requireReady('updateProperties');
      adapter.updateProperties(targetOf(id, 'updateProperties'), toAttributes(values));
    },

    setContent(content, id = null) {
      requireReady('setContent');
      adapter.setContent(targetOf(id, 'setContent'), content);
    },

    insertText(text) {
      requireReady('insertText');
      return adapter.insertText(String(text ?? ''));
    },

    /**
     * Link at the caret of the text being edited, at the end of the selected
     * text, or as the selected button's URL. False if nothing fits.
     */
    insertLink(href, label) {
      requireReady('insertLink');
      return adapter.insertLink(String(href || ''), String(label || href || ''));
    },

    undo() {
      requireReady('undo');
      adapter.undo();
    },
    redo() {
      requireReady('redo');
      adapter.redo();
    },
    canUndo: () => status === 'ready' && adapter.canUndo(),
    canRedo: () => status === 'ready' && adapter.canRedo(),

    getDocument() {
      requireReady('getDocument');
      return createDocument({
        engine: adapter.name,
        engineVersion: adapter.version,
        project: adapter.getProject(),
      });
    },

    loadDocument(raw) {
      requireReady('loadDocument');
      const document = readDocument(raw);
      if (document.engine !== adapter.name) {
        throw new Error(
          `EmailEditor: document written for engine "${document.engine}", ` +
            `editor runs on "${adapter.name}"`
        );
      }
      adapter.loadProject(document.project);
      // A reloaded document has no history: undo must not bring back the
      // state before the load.
      adapter.clearHistory();
    },

    loadMjml(mjml) {
      requireReady('loadMjml');
      adapter.loadMjml(String(mjml || ''));
      adapter.clearHistory();
    },

    exportMjml() {
      requireReady('exportMjml');
      return adapter.exportMjml();
    },

    exportHtml() {
      requireReady('exportHtml');
      return adapter.exportHtml();
    },

    setDevice(device) {
      requireReady('setDevice');
      if (!EMAIL_DEVICES.includes(device)) throw new Error(`EmailEditor: unknown device "${device}"`);
      adapter.setDevice(device);
    },

    getDevice: () => (status === 'ready' ? adapter.getDevice() : 'desktop'),

    startBlockDrag(blockId, event) {
      requireReady('startBlockDrag');
      const block = blocks.get(blockId);
      if (!block || !block.mjml) throw new Error(`EmailEditor: unknown block "${blockId}"`);
      adapter.startBlockDrag(block, event);
    },

    endBlockDrag(cancel = false) {
      if (status === 'ready') adapter.endBlockDrag(cancel);
    },

    /**
     * Keyboard shortcut that also works INSIDE the canvas (an iframe: page
     * listeners hear nothing there). `keys`: `mod+s` (Ctrl, or ⌘ on Mac),
     * several combinations separated by commas.
     */
    addShortcut(id, keys, handler) {
      requireReady('addShortcut');
      return adapter.addShortcut(id, keys, handler);
    },

    on: (event, listener) => emitter.on(event, listener),
  };

  return editor;
}
