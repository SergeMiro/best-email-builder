// @ts-check
/**
 * NATIVE ADAPTER — the builder's own engine behind the `EmailEditorAdapter`
 * contract (core/EmailEditor.js).
 *
 *   model.js        the email: an MJML tree with ids, changed by pure functions
 *   mjml.js         MJML ⇄ tree
 *   placement.js    where a block goes (click, drop)
 *   canvasMjml.js   the tree as the canvas compiles it (markers, placeholders)
 *   canvas/         the canvas: compiled email in a frame, gestures, toolbars
 *
 * MJML is the only converter: the tree is written as MJML, and MJML (the
 * server's `mjml`, the canvas's `mjml-browser`) turns it into the HTML that
 * Outlook, Gmail and Apple Mail receive. Nothing else interprets the email.
 *
 * History: every change keeps the previous tree (trees share their unchanged
 * branches, so this is cheap). Typing in a text, or nudging one field of the
 * panel, is merged into one step while it goes on.
 */

import { EMAIL_BUILDER_VERSION } from '../core/constants.js';
import {
  LOCKED_TAGS,
  SECTION_TAGS,
  cloneWithNewIds,
  createNode,
  findFirst,
  findNode,
  fromProject,
  insertNodes,
  moveNode,
  parentOf,
  positionOf,
  removeNode,
  setAttributes,
  setContent,
  toProject,
} from './model.js';
import { parseMjml, parseMjmlFragment, serializeMjml } from './mjml.js';
import { placementFor, sectionOf } from './placement.js';
import { escapeText, textOfHtml } from './richText.js';
import { withoutTag, withoutTagInText } from './mergeTags.js';
import { EDITABLE_TAGS, createCanvasView } from './canvas/CanvasView.js';
import { functionExport } from './unwrapModule.js';

/**
 * @typedef {import('../core/EmailEditor.js').EmailEditorAdapter} EmailEditorAdapter
 * @typedef {import('../core/EmailEditor.js').EmailBlock} EmailBlock
 * @typedef {import('../core/EmailEditor.js').EngineSelection} EngineSelection
 * @typedef {import('./model.js').EmailNode} EmailNode
 */

export const ENGINE_NAME = 'beb-mjml';
export const ENGINE_VERSION = EMAIL_BUILDER_VERSION;

export const EMPTY_MJML = '<mjml><mj-body background-color="#eceff4" width="600px"></mj-body></mjml>';

/** Elements whose content is a plain label, edited in the panel. */
const LABEL_TAGS = new Set(['mj-button', 'mj-navbar-link']);

/**
 * Elements that only live inside one parent (an icon in its social bar, a
 * link in its menu): moved, duplicated and pasted among their siblings only,
 * never dragged elsewhere.
 */
const BOUND_TAGS = new Set(['mj-social-element', 'mj-navbar-link', 'mj-column', 'mj-group']);

/** Elements a text or a link can be inserted into, when no text is being edited. */
const TEXT_TAGS = new Set(['mj-text', 'mj-button']);

const HISTORY_LIMIT = 300;
const MERGE_MS = 1000;

/**
 * The canvas compiler, loaded on the first `initialize` (1.2 MB). A
 * CommonJS package: bundlers hand it over wrapped once or twice (webpack /
 * Next.js, Vite), `functionExport` gets the function out either way.
 */
async function defaultLoadCompiler() {
  const mjml2html = /** @type {any} */ (functionExport(await import('mjml-browser')));
  if (!mjml2html) throw new Error('mjml-browser did not load');
  return async (/** @type {string} */ mjml) => {
    const result = await mjml2html(mjml, { validationLevel: 'soft', keepComments: false });
    return {
      html: String(result.html || ''),
      errors: (result.errors || []).map((/** @type {any} */ e) => ({
        line: e.line,
        message: String(e.formattedMessage || e.message || e),
        tagName: e.tagName,
      })),
    };
  };
}

/**
 * @param {{
 *   loadCompiler?: () => Promise<(mjml: string) => Promise<{html: string, errors: any[]}>>,
 *   imageUrl?: ((path: string) => string)|null,
 * }} [options]
 *   `imageUrl`: where the canvas shows an uploaded image from (the storage's `imageUrl`).
 * @returns {EmailEditorAdapter & {readonly view: any, readonly root: EmailNode|null}}
 */
export function createNativeAdapter({ loadCompiler = defaultLoadCompiler, imageUrl = null } = {}) {
  /** @type {EmailNode|null} */ let root = null;
  /** @type {string|null} */ let selectedId = null;
  /** @type {ReturnType<typeof createCanvasView>|null} */ let view = null;
  /** @type {(mjml: string) => Promise<{html: string, errors: any[]}>} */ let compile = async () => ({ html: '', errors: [] });
  /** @type {(type: string, payload?: any) => void} */ let emit = () => {};
  /** @type {(key: string, values?: Record<string, any>) => string} */ let t = (key) => key;
  /** @type {(selection: EngineSelection) => string} */ let labelOf = (s) => s.tagName;
  /** @type {HTMLElement|null} */ let container = null;
  let generation = 0;
  /** @type {{past: {root: EmailNode, selectedId: string|null}[], future: {root: EmailNode, selectedId: string|null}[], key: string|null, at: number}} */
  let history = { past: [], future: [], key: null, at: 0 };
  /** @type {Map<string, {keys: string[], handler: () => void}>} */
  const shortcuts = new Map();
  /** @type {EmailNode|null} */ let clipboard = null;
  /**
   * Ctrl+A: every section of the email selected at once (their ids), or null.
   * Any other selection, change or load ends it.
   */
  /** @type {string[]|null} */ let selectedAll = null;
  /** @type {(() => void)|null} */ let removeHostKeys = null;

  function requireRoot() {
    if (!root || !view) throw new Error('NativeAdapter: engine not initialized');
    return root;
  }

  const body = () => /** @type {EmailNode} */ (findFirst(requireRoot(), 'mj-body'));

  /* ── Describing ──────────────────────────────────────────────────────── */

  /** @param {string|null} id @returns {EngineSelection|null} */
  function describe(id) {
    if (!root || !id) return null;
    const node = findNode(root, id);
    if (!node || node.tag === 'mjml' || node.tag === 'mj-head') return null;
    const { index, count } = positionOf(root, id);
    const locked = LOCKED_TAGS.has(node.tag);
    return {
      id: node.id,
      tagName: node.tag,
      attributes: { ...node.attributes },
      content: LABEL_TAGS.has(node.tag) ? textOfHtml(node.content || '') : null,
      html: node.tag === 'mj-text' ? node.content || '' : null,
      canRemove: !locked,
      canDuplicate: !locked,
      canMoveUp: !locked && index > 0,
      canMoveDown: !locked && index >= 0 && index < count - 1,
      ...(node.tag === 'mj-section' && node.children.length && node.children.every((c) => c.tag === 'mj-column')
        ? { columnCount: node.children.length }
        : {}),
    };
  }

  /** What the canvas shows about an element. @param {string} id */
  function canvasInfo(id) {
    const selection = describe(id);
    if (!selection) return null;
    const parent = root ? parentOf(root, id) : null;
    return {
      label: labelOf(selection),
      tag: selection.tagName,
      canRemove: selection.canRemove,
      canDuplicate: selection.canDuplicate,
      // Dragged: content of a column, and sections. Columns, social icons and
      // menu links stay in their parent: arrows swap them with a neighbour.
      canMove: selection.canRemove && !BOUND_TAGS.has(selection.tagName),
      canStep: selection.canRemove && BOUND_TAGS.has(selection.tagName),
      canStepBack: selection.canMoveUp,
      canStepForward: selection.canMoveDown,
      // Side by side, except the icons of a social block set vertical.
      vertical: selection.tagName === 'mj-social-element' && parent?.attributes.mode === 'vertical',
      // A section's parent is the page: "select the parent" would only show
      // the page settings, which a click beside the email does already.
      hasParent: Boolean(parent && parent.tag !== 'mjml' && parent.tag !== 'mj-body'),
      parentLabel: parent && parent.tag !== 'mjml' && parent.tag !== 'mj-body' ? labelOf(/** @type {EngineSelection} */ (describe(parent.id))) : '',
    };
  }

  /**
   * The whole email selected (Ctrl+A): described as the body, with the
   * number of sections it holds (`multiple`); only "delete" applies.
   * @returns {EngineSelection|null}
   */
  function describeAll() {
    if (!root || !selectedAll) return null;
    const node = findFirst(root, 'mj-body');
    if (!node) return null;
    return {
      id: node.id,
      tagName: 'mj-body',
      attributes: { ...node.attributes },
      content: null,
      html: null,
      canRemove: true,
      canDuplicate: false,
      canMoveUp: false,
      canMoveDown: false,
      multiple: selectedAll.length,
    };
  }

  const currentSelection = () => (selectedAll ? describeAll() : describe(selectedId));
  const emitSelection = () => emit('selection', currentSelection());

  /** Ctrl+A: every section of the email. */
  function selectAll() {
    if (!root || !view) return;
    view.finishEditing();
    const ids = body().children.map((child) => child.id);
    if (!ids.length) return;
    selectedAll = ids;
    selectedId = null;
    view.setSelection(null);
    view.setMultiSelection(ids);
    emitSelection();
  }

  /** Ends a Ctrl+A selection (without emitting). */
  function clearAll() {
    if (!selectedAll) return;
    selectedAll = null;
    view?.setMultiSelection([]);
  }

  /** Delete with everything selected: the email's sections, in one step. */
  function removeAll() {
    const current = requireRoot();
    const all = selectedAll || [];
    clearAll();
    let next = current;
    for (const id of all) next = removeNode(next, id);
    commit(next, { select: null });
    if (next === current) emitSelection();
  }
  const emitHistory = () => emit('history', { canUndo: history.past.length > 0, canRedo: history.future.length > 0 });

  /* ── Changing ────────────────────────────────────────────────────────── */

  /**
   * One step of history.
   * @param {EmailNode} next
   * @param {{merge?: string|null, select?: string|null, render?: boolean}} [options]
   *   `merge`: steps with the same key, close in time, become one;
   *   `select`: the element to select afterwards (undefined: unchanged);
   *   `render`: false while a text is typed (the browser already shows it).
   */
  function commit(next, { merge = null, select, render = true } = {}) {
    const current = requireRoot();
    if (next === current) return;
    clearAll();
    const now = Date.now();
    const merged = merge !== null && merge === history.key && now - history.at < MERGE_MS;
    if (!merged) {
      history.past.push({ root: current, selectedId });
      if (history.past.length > HISTORY_LIMIT) history.past.shift();
    }
    history.future = [];
    history.key = merge;
    history.at = now;
    root = next;
    if (select !== undefined) selectedId = select;
    if (selectedId && !findNode(root, selectedId)) selectedId = null;
    view?.setSelection(selectedId);
    emit('change');
    emitHistory();
    emitSelection();
    if (render) void view?.render();
  }

  /**
   * Replaces the email without history (load).
   * @param {EmailNode} next
   */
  function replace(next) {
    view?.finishEditing();
    clearAll();
    root = next;
    selectedId = null;
    history = { past: [], future: [], key: null, at: 0 };
    view?.setSelection(null);
    emit('load');
    emitSelection();
    emitHistory();
    void view?.render();
  }

  /** @param {'undo'|'redo'} direction */
  function travel(direction) {
    view?.finishEditing();
    clearAll();
    const from = direction === 'undo' ? history.past : history.future;
    const to = direction === 'undo' ? history.future : history.past;
    const step = from.pop();
    if (!step || !root) return;
    to.push({ root, selectedId });
    root = step.root;
    selectedId = step.selectedId && findNode(root, step.selectedId) ? step.selectedId : null;
    history.key = null;
    view?.setSelection(selectedId);
    emit('change');
    emitHistory();
    emitSelection();
    void view?.render();
  }

  /**
   * Inserts MJML at a placement; returns the element to focus.
   * @param {EmailBlock} block
   * @param {{parentId: string, index: number, wrap: boolean}} placement
   */
  function insertBlock(block, placement) {
    const source = placement.wrap
      ? /** @type {string} */ (block.sectionMjml) || `<mj-section><mj-column>${block.mjml}</mj-column></mj-section>`
      : /** @type {string} */ (block.mjml);
    const nodes = parseMjmlFragment(source);
    if (!nodes.length) return null;
    const focus = placement.wrap ? findFirst(nodes[0], block.tagName) || nodes[0] : nodes[0];
    commit(insertNodes(requireRoot(), placement.parentId, placement.index, nodes), { select: focus.id });
    return focus.id;
  }

  /**
   * Moves an element where it was dropped. A content element dropped between
   * two sections gets a new one-column section of its own.
   * @param {string} id @param {{parentId: string, index: number, wrap: boolean}} target
   */
  function moveTo(id, target) {
    const current = requireRoot();
    const node = findNode(current, id);
    if (!node) return;
    if (!target.wrap) {
      commit(moveNode(current, id, target.parentId, target.index), { select: id });
      return;
    }
    const section = createNode('mj-section', {
      attributes: { 'background-color': '#ffffff', 'padding-top': '0px', 'padding-bottom': '0px' },
      children: [createNode('mj-column', { children: [node] })],
    });
    commit(insertNodes(removeNode(current, id), target.parentId, target.index, [section]), { select: id });
  }

  /**
   * A column given a share of its section: the other columns share the rest
   * equally (MJML would give each of them its equal share of the WHOLE
   * section, leaving a gap or overflowing). Back to "equal": all equal again.
   * @param {EmailNode} tree @param {string} id @param {string|null|undefined} width
   */
  function balanceColumns(tree, id, width) {
    const parent = parentOf(tree, id);
    if (!parent) return tree;
    const others = parent.children.filter((c) => c.tag === 'mj-column' && c.id !== id);
    const share = Number.parseFloat(String(width || ''));
    let next = tree;
    for (const other of others) {
      const value =
        Number.isFinite(share) && share > 0 && share < 100 && String(width).trim().endsWith('%')
          ? `${Math.round(((100 - share) / others.length) * 100) / 100}%`
          : null;
      next = setAttributes(next, other.id, { width: value });
    }
    return next;
  }

  /** @param {string} id */
  function duplicateNode(id) {
    const current = requireRoot();
    const node = findNode(current, id);
    const parent = parentOf(current, id);
    if (!node || !parent || LOCKED_TAGS.has(node.tag)) return null;
    const copy = cloneWithNewIds(node);
    const index = parent.children.findIndex((c) => c.id === id) + 1;
    commit(insertNodes(current, parent.id, index, [copy]), { select: copy.id });
    return copy.id;
  }

  /** @param {string} id */
  function removeById(id) {
    const current = requireRoot();
    const node = findNode(current, id);
    if (!node || LOCKED_TAGS.has(node.tag)) return false;
    view?.finishEditing();
    commit(removeNode(current, id), { select: null });
    return true;
  }

  /** Paste: after the selected element of the same level, else by placement. */
  function paste() {
    if (!clipboard || !root) return;
    const copy = cloneWithNewIds(clipboard);
    const isSection = SECTION_TAGS.has(copy.tag);
    const selected = selectedId ? findNode(root, selectedId) : null;
    if (BOUND_TAGS.has(copy.tag)) {
      // A column, a social icon, a menu link: only beside one of its kind.
      const parent = selected && selected.tag === copy.tag ? parentOf(root, selected.id) : null;
      if (!parent) return;
      const index = parent.children.findIndex((c) => c.id === selected?.id) + 1;
      commit(insertNodes(root, parent.id, index, [copy]), { select: copy.id });
      return;
    }
    if (isSection) {
      const section = selected ? sectionOf(root, selected.id, body()) : null;
      const index = section ? body().children.findIndex((c) => c.id === section.id) + 1 : body().children.length;
      commit(insertNodes(root, body().id, index, [copy]), { select: copy.id });
      return;
    }
    const placement = placementFor(root, 'content', selectedId);
    const nodes = placement.wrap
      ? [createNode('mj-section', { attributes: { 'background-color': '#ffffff' }, children: [createNode('mj-column', { children: [copy] })] })]
      : [copy];
    commit(insertNodes(root, placement.parentId, placement.index, nodes), { select: copy.id });
  }

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  /** `mod+s` → ['ctrl+s', 'meta+s']. @param {string} keys */
  function parseKeys(keys) {
    return keys
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean)
      .flatMap((k) => (k.startsWith('mod+') ? [`ctrl+${k.slice(4)}`, `meta+${k.slice(4)}`] : [k]));
  }

  /** @param {KeyboardEvent} event */
  function comboOf(event) {
    const parts = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.metaKey) parts.push('meta');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(event.key.toLowerCase());
    return parts.join('+');
  }

  /**
   * @param {KeyboardEvent} event
   * @param {'frame'|'host'} origin
   */
  function onKey(event, origin) {
    if (!root || !view || event.defaultPrevented) return;
    const combo = comboOf(event);
    for (const { keys, handler } of shortcuts.values()) {
      if (keys.includes(combo)) {
        event.preventDefault();
        handler();
        return;
      }
    }
    const editing = view.editingId() !== null;
    if (editing) {
      if (event.key === 'Escape') {
        event.preventDefault();
        view.finishEditing();
      }
      return; // typing belongs to the text
    }
    if (origin === 'host' && !hostKeyTarget(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z' && !event.shiftKey) {
      event.preventDefault();
      travel('undo');
    } else if (mod && ((key === 'z' && event.shiftKey) || key === 'y')) {
      event.preventDefault();
      travel('redo');
    } else if (mod && key === 'a' && !event.shiftKey) {
      // The whole email (inside a text being edited, Ctrl+A stays the text's).
      event.preventDefault();
      selectAll();
    } else if (!mod && (event.key === 'Delete' || event.key === 'Backspace') && selectedAll) {
      event.preventDefault();
      removeAll();
    } else if (!mod && (event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      event.preventDefault();
      removeById(selectedId);
    } else if (mod && key === 'c' && selectedId) {
      const node = findNode(root, selectedId);
      if (node && !LOCKED_TAGS.has(node.tag)) clipboard = node;
    } else if (mod && key === 'v' && clipboard) {
      event.preventDefault();
      paste();
    } else if (mod && key === 'd' && selectedId) {
      event.preventDefault();
      duplicateNode(selectedId);
    } else if (event.key === 'Escape' && selectedAll) {
      event.preventDefault();
      adapter.select(null);
    } else if (event.key === 'Escape' && selectedId) {
      event.preventDefault();
      const parent = parentOf(root, selectedId);
      adapter.select(parent && parent.tag !== 'mjml' && parent.tag !== 'mj-body' ? parent.id : null);
    } else if (event.key === 'Enter' && selectedId && EDITABLE_TAGS.has(findNode(root, selectedId)?.tag || '')) {
      event.preventDefault();
      view.startEditing(selectedId);
    }
  }

  /**
   * A key pressed in the host page acts on the canvas only from inside the
   * builder, and never from a field (a field has its own Delete and Ctrl+Z).
   * @param {EventTarget|null} target
   */
  function hostKeyTarget(target) {
    const el = /** @type {HTMLElement|null} */ (target && /** @type {any} */ (target).nodeType === 1 ? target : null);
    if (!el || !container) return false;
    if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]')) {
      return false;
    }
    const builder = container.closest('.eb-root') || container;
    return builder.contains(el) || el === el.ownerDocument.body;
  }

  /* ── Contract ────────────────────────────────────────────────────────── */

  /** @type {EmailEditorAdapter & {readonly view: any, readonly root: EmailNode|null}} */
  const adapter = {
    name: ENGINE_NAME,
    version: ENGINE_VERSION,

    get view() {
      return view;
    },

    /** The current tree, read-only (inspection, tests). */
    get root() {
      return root;
    },

    async initialize({ container: host, document, onEvent, t: translate, labelOf: label }) {
      if (view) throw new Error('NativeAdapter: already initialized');
      const ticket = ++generation;
      const loaded = await loadCompiler();
      if (ticket !== generation) return;

      emit = onEvent;
      if (translate) t = translate;
      if (label) labelOf = label;
      compile = loaded;
      container = host;
      root = document ? fromProject(document.project) : parseMjml(EMPTY_MJML);
      selectedId = null;
      history = { past: [], future: [], key: null, at: 0 };

      view = createCanvasView({
        container: host,
        compile,
        getRoot: () => /** @type {EmailNode} */ (root),
        t,
        imageUrl,
        info: canvasInfo,
        onSelect: (id) => adapter.select(id),
        onAction: (action, id) => {
          if (action === 'parent') {
            const parent = root ? parentOf(root, id) : null;
            adapter.select(parent && parent.tag !== 'mjml' && parent.tag !== 'mj-body' ? parent.id : null);
          } else if (action === 'duplicate') duplicateNode(id);
          else if (action === 'remove') removeById(id);
          else if (action === 'back' || action === 'forward') adapter.move(id, action === 'back' ? -1 : 1);
        },
        onRemoveTag: (id, index) => {
          const current = requireRoot();
          const node = findNode(current, id);
          if (!node || node.content === null) return;
          const content = LABEL_TAGS.has(node.tag)
            ? escapeText(withoutTagInText(textOfHtml(node.content), index))
            : withoutTag(node.content, index, host.ownerDocument);
          if (content !== node.content) commit(setContent(current, id, content));
        },
        onDrop: (payload, target) => {
          if (payload.nodeId) moveTo(payload.nodeId, target);
          else if (payload.block) insertBlock(payload.block, target);
        },
        onEditStart: () => {
          history.key = null;
        },
        onEditInput: (id, html) => {
          const current = requireRoot();
          const node = findNode(current, id);
          if (!node || node.content === html) return;
          commit(setContent(current, id, html), { merge: `text:${id}`, render: false });
        },
        onEditEnd: (id, html) => {
          const current = requireRoot();
          const node = findNode(current, id);
          if (node && node.content !== html) commit(setContent(current, id, html), { merge: `text:${id}` });
          else void view?.render();
          history.key = null;
        },
        onFormat: (format) => emit('format', format),
        onKeyDown: (event) => onKey(event, 'frame'),
      });
      const onHostKey = (/** @type {KeyboardEvent} */ event) => onKey(event, 'host');
      host.ownerDocument.addEventListener('keydown', onHostKey);
      removeHostKeys = () => host.ownerDocument.removeEventListener('keydown', onHostKey);

      await view.render();
      if (ticket !== generation) return;
      emitHistory();
    },

    destroy() {
      generation += 1;
      removeHostKeys?.();
      removeHostKeys = null;
      view?.destroy();
      view = null;
      root = null;
      selectedId = null;
      container = null;
      emit = () => {};
    },

    addBlock(block, { targetId = null } = {}) {
      const current = requireRoot();
      view?.finishEditing();
      const target = targetId && findNode(current, targetId) ? targetId : selectedId;
      const placement = placementFor(current, block.kind === 'layout' ? 'layout' : 'content', target);
      return insertBlock(block, placement);
    },

    remove(id) {
      // With everything selected, removing the body means removing its content.
      if (selectedAll && root && id === findFirst(root, 'mj-body')?.id) {
        removeAll();
        return true;
      }
      return removeById(id);
    },
    duplicate: (id) => duplicateNode(id),

    move(id, direction) {
      const current = requireRoot();
      const node = findNode(current, id);
      const { parent, index, count } = positionOf(current, id);
      if (!node || !parent || LOCKED_TAGS.has(node.tag)) return false;
      const to = index + direction;
      if (to < 0 || to >= count) return false;
      view?.finishEditing();
      commit(moveNode(current, id, parent.id, direction > 0 ? to + 1 : to), { select: id });
      return true;
    },

    select(id) {
      if (!root) return;
      const next = id && findNode(root, id) && describe(id) ? id : null;
      if (selectedAll) {
        clearAll();
        selectedId = next;
        view?.setSelection(next);
        emitSelection();
        return;
      }
      if (next === selectedId) {
        view?.setSelection(next);
        return;
      }
      selectedId = next;
      view?.setSelection(next);
      emitSelection();
    },

    selectAll: () => selectAll(),

    getSelection: () => currentSelection(),
    describe: (id) => describe(id),
    getRootId: () => (root ? findFirst(root, 'mj-body')?.id || null : null),

    updateProperties(id, attributes) {
      const current = requireRoot();
      const node = findNode(current, id);
      if (!node) return;
      if (view?.editingId() === id) view.finishEditing();
      const keys = Object.keys(attributes).sort().join(',');
      let next = setAttributes(current, id, attributes);
      if (node.tag === 'mj-column' && 'width' in attributes) next = balanceColumns(next, id, attributes.width);
      commit(next, { merge: `attributes:${id}:${keys}` });
    },

    setContent(id, content, { reveal = false } = {}) {
      const current = requireRoot();
      const node = findNode(current, id);
      if (!node || node.content === null) return;
      const value = LABEL_TAGS.has(node.tag) ? escapeText(content) : String(content || '');
      if (view?.editingId() === id) view.finishEditing();
      if (reveal && value !== node.content) view?.revealOnRender(id);
      commit(setContent(requireRoot(), id, value), { merge: `content:${id}` });
    },

    setContents(entries) {
      const editing = view?.editingId();
      if (editing && entries.some((entry) => entry.id === editing)) view?.finishEditing();
      let next = requireRoot();
      for (const { id, content } of entries) {
        const node = findNode(next, id);
        if (!node || node.content === null) continue;
        next = setContent(next, id, LABEL_TAGS.has(node.tag) ? escapeText(content) : String(content || ''));
      }
      commit(next);
    },

    insertText(text) {
      if (!view || !root) return false;
      if (view.editingId()) return view.insertText(text);
      const node = selectedId ? findNode(root, selectedId) : null;
      if (!node || !TEXT_TAGS.has(node.tag)) return false;
      view.settlePreview();
      commit(setContent(root, node.id, `${node.content || ''} ${escapeText(text)}`));
      return true;
    },

    previewText(text) {
      return view ? view.previewText(text) : false;
    },

    clearPreview() {
      view?.hidePreview();
    },

    showWorking(id) {
      view?.setWorking(id);
    },

    formatText(command, value) {
      return view ? view.formatText(command, value) : false;
    },

    insertLink(href, label) {
      if (!view || !root) return false;
      const safeHref = escapeText(href).replace(/"/g, '&quot;');
      const html = `<a href="${safeHref}">${escapeText(label)}</a>`;
      if (view.editingId()) return view.insertHtml(html);
      const node = selectedId ? findNode(root, selectedId) : null;
      if (node && node.tag === 'mj-button') {
        commit(setAttributes(root, node.id, { href }));
        return true;
      }
      if (node && node.tag === 'mj-text') {
        commit(setContent(root, node.id, `${node.content || ''} ${html}`));
        return true;
      }
      return false;
    },

    undo: () => travel('undo'),
    redo: () => travel('redo'),
    canUndo: () => history.past.length > 0,
    canRedo: () => history.future.length > 0,
    clearHistory() {
      history = { past: [], future: [], key: null, at: 0 };
      emitHistory();
    },

    getProject: () => toProject(requireRoot()),

    loadProject(project) {
      requireRoot();
      replace(fromProject(project));
    },

    loadMjml(mjml) {
      requireRoot();
      replace(parseMjml(mjml || EMPTY_MJML));
    },

    setMjml(mjml) {
      requireRoot();
      view?.finishEditing();
      commit(parseMjml(mjml || EMPTY_MJML), { select: null });
    },

    exportMjml: () => serializeMjml(requireRoot()),

    async exportHtml(mjml = null) {
      return compile(mjml ?? serializeMjml(requireRoot()));
    },

    setDevice(device) {
      if (!view) return;
      view.setDevice(device);
      emit('device', device);
    },

    getDevice: () => (view ? view.getDevice() : 'desktop'),

    startBlockDrag(block, event) {
      if (!view) return;
      const pointer = /** @type {PointerEvent} */ (event);
      const target = /** @type {Element|null} */ (pointer.currentTarget || pointer.target);
      if (!target || typeof pointer.pointerId !== 'number') return;
      view.startDrag({
        payload: { kind: block.kind === 'layout' ? 'layout' : 'content', block },
        label: t(block.label),
        source: 'host',
        pointerId: pointer.pointerId,
        captureTarget: target,
        x: pointer.clientX,
        y: pointer.clientY,
      });
    },

    endBlockDrag() {
      view?.cancelDrag();
    },

    addShortcut(id, keys, handler) {
      shortcuts.set(id, { keys: parseKeys(keys), handler });
      return () => {
        if (shortcuts.get(id)?.handler === handler) shortcuts.delete(id);
      };
    },
  };

  return adapter;
}
