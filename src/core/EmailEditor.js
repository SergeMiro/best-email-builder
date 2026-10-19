// @ts-check
/**
 * EmailEditor — THE email builder contract.
 *
 * ── THE ARCHITECTURE RULE ──────────────────────────────────────────────────
 *
 *     React UI ─► EmailEditor ─► adapter ─► engine (engine/) ─► MJML
 *
 * The UI (`ui/`), features (`features/`) and blocks (`blocks/`) talk ONLY to
 * this object. None of them knows the canvas or the model: everything
 * engine-related lives in `engine/`. Swapping the engine therefore means
 * writing another adapter that fulfils `EmailEditorAdapter`, rewriting
 * nothing above it.
 *
 * ── WHAT THIS LAYER ADDS TO THE ADAPTER ────────────────────────────────────
 *   - the lifecycle (idle → initializing → ready → idle), and a hard refusal
 *     of any call made before `initialize` or after `destroy`;
 *   - resolving blocks by id in the registry, with their texts translated;
 *   - naming elements (a section is named after its layout: "2 columns");
 *   - the versioned document envelope (`core/document.js`);
 *   - starting and stopping registered features.
 *
 * See `docs/ARCHITECTURE.md`.
 */

import { createEmitter } from './events.js';
import { EMAIL_DEVICES } from './constants.js';
import { createDocument, readDocument } from './document.js';
import { LONGHAND_SPACING, toAttributes, toValues } from './mjmlAttributes.js';
import { MJML_DEFAULTS } from './mjmlDefaults.js';
import { identity } from '../i18n/index.js';
import { applyBrandToFragment } from '../features/brand/brand.js';

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
 * section, for when it must go outside any column. Either may be a function
 * of the translator, so the texts a block brings arrive in the interface's
 * language; `tagName` identifies the
 * block of a selected element (`mj-text` → text).
 * `editableContent`: the content is editable (canvas for text, panel for a
 * button label).
 * `insertOnly`: a preset of another block's element (a Heading is an
 * `mj-text`): offered in the sidebar, but a selected element of that tag is
 * described by the main block.
 *
 * @typedef {{
 *   id: string,
 *   label: string,
 *   description?: string,
 *   icon: string,
 *   kind: 'content'|'layout'|'structure',
 *   tagName: string,
 *   order?: number,
 *   mjml?: string | ((t: import('../i18n/index.js').Translate) => string),
 *   sectionMjml?: string | ((t: import('../i18n/index.js').Translate) => string),
 *   properties: BlockProperty[],
 *   editableContent?: boolean,
 *   insertOnly?: boolean,
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
 *   html?: string|null,
 *   canRemove: boolean,
 *   canDuplicate: boolean,
 *   canMoveUp: boolean,
 *   canMoveDown: boolean,
 *   columnCount?: number,
 *   multiple?: number,
 * }} EngineSelection
 *   `content`: the label of a button or a menu link, as plain text.
 *   `html`: the HTML of a text (`mj-text`), as stored.
 *   `columnCount`: for a section, how many columns it holds (its name).
 *   `multiple`: the whole email is selected (Ctrl+A) — how many sections;
 *   the selection is then described as the body, and only removal applies.
 */

/**
 * Selected element, in the builder's vocabulary: its block, its property
 * values (padding recombined, see mjmlAttributes) and, for the properties left
 * empty, what MJML renders instead (`defaults`, see mjmlDefaults).
 *
 * @typedef {EngineSelection & {
 *   blockId: string|null,
 *   label: string,
 *   values: Record<string, string>,
 *   defaults: Record<string, string>,
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
 *     t?: import('../i18n/index.js').Translate,
 *     labelOf?: (selection: EngineSelection) => string,
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
 *   setContents?: (entries: {id: string, content: string}[]) => void,
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
 *   setMjml?: (mjml: string) => void,
 *   exportMjml: () => string,
 *   exportHtml: (mjml?: string|null) => Promise<HtmlExport>,
 *   setDevice: (device: EmailDevice) => void,
 *   getDevice: () => EmailDevice,
 *   startBlockDrag: (block: EmailBlock, event: Event) => void,
 *   endBlockDrag: (cancel?: boolean) => void,
 *   addShortcut: (id: string, keys: string, handler: () => void) => (() => void),
 *   selectAll?: () => void,
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
 *   selectAll: () => void,
 *   getSelection: () => EmailSelection|null,
 *   getElement: (id: string) => EmailSelection|null,
 *   getRootId: () => string|null,
 *   updateProperties: (values: Record<string, string|null>, id?: string|null) => void,
 *   setContent: (content: string, id?: string|null) => void,
 *   setContents: (entries: {id: string, content: string}[]) => void,
 *   insertText: (text: string) => boolean,
 *   insertLink: (href: string, label: string) => boolean,
 *   undo: () => void,
 *   redo: () => void,
 *   canUndo: () => boolean,
 *   canRedo: () => boolean,
 *   getDocument: () => EmailDocument,
 *   loadDocument: (document: unknown, options?: {mjml?: string|null}) => void,
 *   loadMjml: (mjml: string) => void,
 *   setMjml: (mjml: string) => void,
 *   exportMjml: () => string,
 *   exportHtml: (mjml?: string|null) => Promise<HtmlExport>,
 *   setBrand: (brand: import('../features/brand/brand.js').Brand|null) => void,
 *   setDevice: (device: EmailDevice) => void,
 *   getDevice: () => EmailDevice,
 *   startBlockDrag: (blockId: string, event: Event) => void,
 *   endBlockDrag: (cancel?: boolean) => void,
 *   addShortcut: (id: string, keys: string, handler: () => void) => (() => void),
 *   on: (event: string, listener: (payload?: any) => void) => () => void,
 * }} EmailEditor
 */

/**
 * A block with its MJML (and section MJML) as strings, its texts in the
 * translator's language.
 * @param {EmailBlock} block
 * @param {import('../i18n/index.js').Translate} [t]
 * @returns {EmailBlock & {mjml?: string, sectionMjml?: string}}
 */
export function resolveBlock(block, t = identity) {
  const text = (/** @type {any} */ value) => (typeof value === 'function' ? String(value(t)) : value);
  return { ...block, mjml: text(block.mjml), sectionMjml: text(block.sectionMjml) };
}

/**
 * @param {{
 *   adapter: EmailEditorAdapter,
 *   blocks: import('./registry.js').Registry<EmailBlock>,
 *   features?: import('./registry.js').Registry<EmailBuilderFeature> | null,
 *   t?: import('../i18n/index.js').Translate,
 * }} options
 *   `t`: the interface's translator — texts of inserted blocks, names shown
 *   in the canvas.
 * @returns {EmailEditor}
 */
export function createEmailEditor({ adapter, blocks, features = null, t = identity }) {
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

  /**
   * Block describing a tag: structure first (a section stays a section),
   * presets (`insertOnly`) never.
   */
  function blockForTag(tagName) {
    const all = blocks.list((b) => !b.insertOnly);
    return (
      all.find((b) => b.tagName === tagName && b.kind === 'structure') ||
      all.find((b) => b.tagName === tagName) ||
      null
    );
  }

  /**
   * Name of an element: its block's, and for a section the layout it was
   * made from ("2 columns"), counted from its columns.
   * @param {EngineSelection} selection @param {EmailBlock|null} block
   */
  function labelFor(selection, block) {
    if (selection.multiple) return 'All blocks';
    if (selection.tagName === 'mj-section' && typeof selection.columnCount === 'number') {
      const layout = blocks.get(`columns-${selection.columnCount}`);
      if (layout) return layout.label;
    }
    return block?.label || selection.tagName;
  }

  /**
   * Property values, and MJML's defaults for the empty ones. A padding set
   * on some sides only is completed with MJML's default for the others (a
   * text with only left and right paddings still gets 10 px above and below).
   * @param {EngineSelection} selection @param {EmailBlock|null} block
   */
  function valuesOf(selection, block) {
    const properties = block?.properties || [];
    const attributes = selection.attributes || {};
    const fallback = MJML_DEFAULTS[selection.tagName] || {};
    const values = toValues(attributes, properties);
    for (const property of properties) {
      if (LONGHAND_SPACING.has(property.key) && values[property.key]) {
        values[property.key] = toValues({ ...fallback, ...attributes }, [property])[property.key];
      }
    }
    return { values, defaults: toValues(fallback, properties) };
  }

  /** @param {EngineSelection|null} selection @returns {EmailSelection|null} */
  function toEmailSelection(selection) {
    if (!selection) return null;
    const block = blockForTag(selection.tagName);
    return {
      ...selection,
      blockId: block?.id || null,
      label: labelFor(selection, block),
      ...valuesOf(selection, block),
    };
  }

  /** The brand new blocks are painted in (setBrand). */
  /** @type {import('../features/brand/brand.js').Brand|null} */
  let brand = null;

  /** @param {EmailBlock} block */
  const resolved = (block) => {
    const result = resolveBlock(block, t);
    if (!brand) return result;
    return {
      ...result,
      mjml: result.mjml && applyBrandToFragment(result.mjml, brand),
      sectionMjml: result.sectionMjml && applyBrandToFragment(result.sectionMjml, brand),
    };
  };

  function startFeatures() {
    if (!features) return;
    for (const feature of features.list((f) => f.enabled !== false)) {
      try {
        const stop = feature.setup?.(editor);
        if (typeof stop === 'function') teardowns.push(stop);
      } catch (error) {
        // A broken feature must not prevent editing.
        console.warn(`[best-email-builder] feature "${feature.id}" failed`, error);
      }
    }
  }

  function stopFeatures() {
    for (const stop of teardowns.reverse()) {
      try {
        stop();
      } catch (error) {
        console.warn('[best-email-builder] feature teardown failed', error);
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
          t,
          labelOf: (selection) => t(labelFor(selection, blockForTag(selection.tagName))),
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
      return adapter.addBlock(resolved(block), options);
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

    /** Every section of the email at once (Ctrl+A); Delete then empties it. */
    selectAll() {
      requireReady('selectAll');
      adapter.selectAll?.();
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

    /** Several texts at once (a proofread email), as ONE step of the history when the engine can. */
    setContents(entries) {
      requireReady('setContents');
      const list = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && typeof entry.id === 'string' && entry.id)
        .map(({ id, content }) => ({ id, content: String(content ?? '') }));
      if (!list.length) return;
      if (adapter.setContents) adapter.setContents(list);
      else for (const { id, content } of list) adapter.setContent(id, content);
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

    /**
     * A stored document. One written by another engine (a template saved
     * before the builder had its own) cannot be read as a project: it is
     * opened from its MJML when `options.mjml` gives it, refused otherwise.
     */
    loadDocument(raw, { mjml = null } = {}) {
      requireReady('loadDocument');
      const document = readDocument(raw);
      if (document.engine !== adapter.name) {
        if (mjml) {
          adapter.loadMjml(String(mjml));
          adapter.clearHistory();
          return;
        }
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

    /** Replaces the whole email as ONE step: Ctrl+Z brings the previous one back. */
    setMjml(mjml) {
      requireReady('setMjml');
      if (adapter.setMjml) adapter.setMjml(String(mjml || ''));
      else adapter.loadMjml(String(mjml || ''));
    },

    /** Blocks inserted from now on take the brand's colors and font (null: the builder's own). */
    setBrand(value) {
      brand = value && Object.keys(value).length ? { ...value } : null;
    },

    exportMjml() {
      requireReady('exportMjml');
      return adapter.exportMjml();
    },

    /**
     * The email (or the given MJML) compiled by the CANVAS compiler — for
     * display only (thumbnails, inspection). The HTML that is stored and sent
     * is always compiled by the server. Asynchronous: MJML 5 compiles
     * asynchronously.
     */
    exportHtml(mjml = null) {
      requireReady('exportHtml');
      return adapter.exportHtml(mjml === null || mjml === undefined ? null : String(mjml));
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
      adapter.startBlockDrag(resolved(block), event);
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
