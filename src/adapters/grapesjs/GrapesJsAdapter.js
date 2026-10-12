// @ts-check
/**
 * GRAPESJS ADAPTER — the only file of the builder that talks to the engine.
 *
 * It fulfils the `EmailEditorAdapter` contract (core/EmailEditor.js) with
 * GrapesJS and its MJML plugin. Everything leaving this folder is expressed in
 * the email's vocabulary (blocks, MJML attributes, opaque ids), never in the
 * engine's: that is what makes the engine replaceable.
 *
 * ── LOADING ────────────────────────────────────────────────────────────────
 * GrapesJS and the MJML plugin (1.2 MB, `mjml-browser` included) touch
 * `window` as soon as they are evaluated: they are imported dynamically, on
 * the first `initialize`, never during server-side rendering.
 *
 * ── BLOCK PLACEMENT ────────────────────────────────────────────────────────
 * MJML enforces its hierarchy: body → section → column → content. A content
 * block added by click therefore goes:
 *   - INTO the selected column;
 *   - AFTER the selected element, in the same column;
 *   - otherwise into a NEW one-column section, after the selected section or
 *     at the end of the body.
 * A layout (N-column section) goes after the current section, or at the end.
 * On drag and drop, the MJML plugin's rules decide where the element can land.
 */

import { buildEngineConfig, EMPTY_MJML, IMAGE_PLACEHOLDER } from './engineConfig.js';
import { unwrapModule } from './unwrapModule.js';

/**
 * @typedef {import('../../core/EmailEditor.js').EmailEditorAdapter} EmailEditorAdapter
 * @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock
 * @typedef {import('../../core/EmailEditor.js').EngineSelection} EngineSelection
 * @typedef {import('../../core/constants.js').EmailDevice} EmailDevice
 */

export const ENGINE_NAME = 'grapesjs-mjml';
/** Engine version, copied into every document (exact package.json version). */
export const ENGINE_VERSION = '0.23.6';

/** Prefix of blocks registered with the engine — for drag and drop only. */
const BLOCK_PREFIX = 'eb-';

/** Structural elements that cannot be removed, duplicated or moved. */
const LOCKED_TYPES = new Set(['mjml', 'mj-head', 'mj-body', 'wrapper']);

/** Elements whose content is a plain label, edited in the panel. */
const LABEL_TYPES = new Set(['mj-button', 'mj-navbar-link']);

/** Elements whose content is edited in the canvas (rich text editor). */
const RICH_TYPES = new Set(['mj-text', 'mj-button']);

/**
 * Engine labels visible in the canvas (element badge), per locale. Static
 * import paths so bundlers can see them; English needs none (engine default).
 *
 * @type {Record<string, () => Promise<any[]>>}
 */
const ENGINE_LOCALES = {
  fr: () => Promise.all([import('grapesjs/locale/fr.mjs'), import('grapesjs-mjml/locale/fr')]),
};

/**
 * Engine loading, injectable for tests. The canvas stylesheets (GrapesJS +
 * `engine-overrides.css`) ship in `best-email-builder/styles.css`.
 *
 * @param {string} locale
 */
async function defaultLoadEngine(locale) {
  const loadLocales = Object.prototype.hasOwnProperty.call(ENGINE_LOCALES, locale) ? ENGINE_LOCALES[locale] : null;
  const [grapesjs, mjml, localeModules] = await Promise.all([
    import('grapesjs'),
    import('grapesjs-mjml'),
    loadLocales ? loadLocales() : Promise.resolve(null),
  ]);
  return {
    grapesjs: unwrapModule(grapesjs),
    mjmlPlugin: unwrapModule(mjml),
    locales: localeModules
      ? { engine: unwrapModule(localeModules[0]), mjml: unwrapModule(localeModules[1]) }
      : {},
  };
}

/**
 * Empty image: the canvas shows it as a banner (`IMAGE_PLACEHOLDER`, see
 * engineConfig) that never crosses the adapter boundary — it becomes "no
 * image" (`''`) in the MJML, the project and the selection. GrapesJS's
 * original SVG icon is handled the same way, in case an old project still
 * carries it.
 */
const ENGINE_SVG = /^\s*<svg[\s>]/i;
const PLACEHOLDER_SRC_ATTR = new RegExp(
  `\\ssrc="(?:${IMAGE_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\s*<svg[\\s\\S]*?<\\/svg>\\s*)"`,
  'g'
);
const PLACEHOLDER_SRC_STYLE = /src:\s*<svg[\s\S]*?<\/svg>;?/gi;

/** @param {unknown} value */
function isEnginePlaceholder(value) {
  return typeof value === 'string' && (value === IMAGE_PLACEHOLDER || ENGINE_SVG.test(value));
}

/**
 * Copy of the project without the engine's empty-image icon.
 * @param {any} node
 * @returns {any}
 */
function withoutPlaceholders(node) {
  if (Array.isArray(node)) return node.map(withoutPlaceholders);
  if (!node || typeof node !== 'object') return node;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'src' && isEnginePlaceholder(value)) out[key] = '';
    else if (key === 'style' && typeof value === 'string') {
      out[key] = value.replace(PLACEHOLDER_SRC_STYLE, '').split(`src:${IMAGE_PLACEHOLDER};`).join('');
    } else out[key] = withoutPlaceholders(value);
  }
  return out;
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Inserts HTML at the CARET of the text being edited, or returns false.
 *
 * ⚠️ `view.rte` is the editing MODULE (no `insertHTML`); the instance holding
 * the selection is `view.activeRte`. The content is then synced back into the
 * model (`syncContent`): otherwise the export would only see it once the user
 * leaves the text.
 */
function insertAtCaret(ed, html) {
  const view = ed.getEditing()?.view;
  const rte = view?.activeRte;
  if (!view || typeof rte?.insertHTML !== 'function') return false;
  rte.insertHTML(html);
  view.onInput?.();
  void view.syncContent?.();
  return true;
}

/**
 * @param {{
 *   locale?: string,
 *   loadEngine?: (locale: string) => Promise<{grapesjs: any, mjmlPlugin: any, locales?: {engine?: any, mjml?: any}}>,
 * }} [options]
 * @returns {EmailEditorAdapter & {readonly engine: any}}
 */
export function createGrapesJsAdapter({ locale = 'en', loadEngine = defaultLoadEngine } = {}) {
  /** @type {any} */
  let editor = null;
  /** @type {HTMLElement|null} */
  let host = null;
  /** @type {(type: string, payload?: any) => void} */
  let emit = () => {};
  /** Token: a `destroy` during engine loading invalidates the init. */
  let generation = 0;
  let selectionQueued = false;
  /**
   * Load in progress: GrapesJS reports changes through a DEFERRED `update`
   * (setTimeout 0). The one from a load would arrive late and look like user
   * input — the template would show as "modified" right after opening. It is
   * muted until the event-loop turn after the load.
   */
  let loading = false;

  function muteUntilFlushed() {
    loading = true;
    setTimeout(() => {
      loading = false;
    }, 0);
  }

  /* ── Model helpers ───────────────────────────────────────────────────── */

  function requireEditor() {
    if (!editor) throw new Error('GrapesJsAdapter: engine not initialized');
    return editor;
  }

  /** @param {string} id */
  function byId(id) {
    const all = requireEditor().Components.allById();
    return all[id] || null;
  }

  /** @param {any} component */
  function typeOf(component) {
    return component ? String(component.get('type') || '') : '';
  }

  function body() {
    const ed = requireEditor();
    return ed.getWrapper().findType('mj-body')[0] || null;
  }

  /**
   * First ancestor (or self) of one of the given types.
   * @param {any} component @param {string[]} types
   */
  function closest(component, types) {
    let current = component;
    while (current) {
      if (types.includes(typeOf(current))) return current;
      current = current.parent();
    }
    return null;
  }

  /**
   * An element's MJML attributes, as the export will see them: `src` read
   * from the model (see MJML plugin), engine icon cleared.
   * @param {any} component
   * @returns {Record<string, string>}
   */
  function attributesOf(component) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const [key, value] of Object.entries(component.getAttributes() || {})) {
      if (key === 'style' || key === 'id' || value === undefined || value === null) continue;
      out[key] = String(value);
    }
    if (component.get('src') !== undefined) out.src = String(component.get('src') || '');
    if (isEnginePlaceholder(out.src)) out.src = '';
    return out;
  }

  /** @param {any} component @returns {EngineSelection|null} */
  function describe(component) {
    if (!component) return null;
    const type = typeOf(component);
    const parent = component.parent();
    const index = parent ? parent.components().indexOf(component) : -1;
    const siblings = parent ? parent.components().length : 0;
    const locked = LOCKED_TYPES.has(type);
    return {
      id: component.getId(),
      tagName: type,
      attributes: attributesOf(component),
      content: LABEL_TYPES.has(type) ? textOf(component) : null,
      canRemove: !locked && component.get('removable') !== false,
      canDuplicate: !locked && component.get('copyable') !== false,
      canMoveUp: !locked && index > 0,
      canMoveDown: !locked && index >= 0 && index < siblings - 1,
    };
  }

  /** Plain text of an element (button label). @param {any} component */
  function textOf(component) {
    const html = component.getInnerHTML ? component.getInnerHTML() : '';
    return String(html)
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .trim();
  }

  function queueSelection() {
    if (selectionQueued) return;
    selectionQueued = true;
    queueMicrotask(() => {
      selectionQueued = false;
      if (editor) emit('selection', describe(editor.getSelected()));
    });
  }

  function emitHistory() {
    if (!editor) return;
    const um = editor.UndoManager;
    emit('history', { canUndo: um.hasUndo(), canRedo: um.hasRedo() });
  }

  /** @param {any} added */
  function firstOf(added) {
    return Array.isArray(added) ? added[0] : added;
  }

  /* ── Placement ───────────────────────────────────────────────────────── */

  /**
   * Where to put a block. Returns the target collection and index, or an
   * instruction to wrap the content in a new section.
   *
   * @param {EmailBlock} block @param {any} target
   */
  function placementFor(block, target) {
    const root = body();
    if (!root) throw new Error('GrapesJsAdapter: email body not found');

    const section = target ? closest(target, ['mj-section', 'mj-wrapper', 'mj-hero']) : null;
    const afterSection = () => {
      if (section && section.parent()) {
        const coll = section.parent().components();
        return { collection: coll, at: coll.indexOf(section) + 1, wrap: false };
      }
      return { collection: root.components(), at: root.components().length, wrap: false };
    };

    if (block.kind === 'layout') return afterSection();

    const type = typeOf(target);
    if (type === 'mj-column') {
      return { collection: target.components(), at: target.components().length, wrap: false };
    }
    const column = target ? closest(target, ['mj-column']) : null;
    if (column && target !== column) {
      // Walk up to the column's direct child: insert after it.
      let child = target;
      while (child.parent() && child.parent() !== column) child = child.parent();
      const coll = column.components();
      return { collection: coll, at: coll.indexOf(child) + 1, wrap: false };
    }
    return { ...afterSection(), wrap: true };
  }

  /* ── Contract ────────────────────────────────────────────────────────── */

  /** @type {EmailEditorAdapter & {readonly engine: any}} */
  const adapter = {
    name: ENGINE_NAME,
    version: ENGINE_VERSION,

    get engine() {
      return editor;
    },

    async initialize({ container, blocks: blockList, document, onEvent }) {
      if (editor) throw new Error('GrapesJsAdapter: already initialized');
      const ticket = ++generation;
      const { grapesjs, mjmlPlugin, locales } = await loadEngine(locale);
      if (ticket !== generation) return;

      emit = onEvent;
      host = createEngineHost(container);
      const instance = grapesjs.init(buildEngineConfig({ container: host, mjmlPlugin, locales, locale }));
      editor = instance;

      await new Promise((resolve) => instance.onReady(() => resolve(undefined)));
      if (ticket !== generation) return;

      // Blocks registered with the engine: only for its drag and drop
      // (`startBlockDrag`), never displayed by it.
      for (const block of blockList) {
        if (!block.mjml) continue;
        instance.Blocks.add(`${BLOCK_PREFIX}${block.id}`, {
          label: block.label,
          content: block.mjml,
          activate: true,
          select: true,
        });
      }

      muteUntilFlushed();
      if (document) instance.loadProjectData(document.project);
      else instance.setComponents(EMPTY_MJML);
      instance.UndoManager.clear();

      instance.on('update', () => {
        if (!loading) emit('change');
        emitHistory();
      });
      instance.on('undo', emitHistory);
      instance.on('redo', emitHistory);
      instance.on('component:toggled', queueSelection);
      instance.on('component:update', (/** @type {any} */ component) => {
        if (component && component === instance.getSelected()) queueSelection();
      });
      instance.on('change:device', () => emit('device', adapter.getDevice()));

      emitHistory();
    },

    destroy() {
      generation += 1;
      if (editor) {
        try {
          editor.destroy();
        } catch (error) {
          console.warn('[best-email-builder] engine destroy failed', error);
        }
      }
      editor = null;
      if (host?.parentNode) host.parentNode.removeChild(host);
      host = null;
      emit = () => {};
    },

    addBlock(block, { targetId = null } = {}) {
      const ed = requireEditor();
      if (!block.mjml) return null;
      const target = targetId ? byId(targetId) : ed.getSelected();
      const { collection, at, wrap } = placementFor(block, target);
      const source = wrap
        ? block.sectionMjml || `<mj-section><mj-column>${block.mjml}</mj-column></mj-section>`
        : block.mjml;
      const added = firstOf(collection.add(source, { at }));
      if (!added) return null;
      const focus = wrap ? added.findType(block.tagName)[0] || added : added;
      ed.select(focus);
      return focus.getId();
    },

    remove(id) {
      const component = byId(id);
      if (!component || LOCKED_TYPES.has(typeOf(component))) return false;
      if (component.get('removable') === false) return false;
      const ed = requireEditor();
      if (ed.getSelected() === component) ed.select(null);
      component.remove();
      return true;
    },

    duplicate(id) {
      const component = byId(id);
      if (!component || LOCKED_TYPES.has(typeOf(component)) || !component.parent()) return null;
      const collection = component.parent().components();
      const copy = firstOf(collection.add(component.clone(), { at: collection.indexOf(component) + 1 }));
      if (!copy) return null;
      requireEditor().select(copy);
      return copy.getId();
    },

    move(id, direction) {
      const component = byId(id);
      if (!component || LOCKED_TYPES.has(typeOf(component))) return false;
      const parent = component.parent();
      if (!parent) return false;
      const index = parent.components().indexOf(component);
      const to = index + direction;
      if (to < 0 || to >= parent.components().length) return false;
      // `at` is the position in the collection BEFORE the element is
      // removed: moving down must aim one step further.
      component.move(parent, { at: direction > 0 ? to + 1 : to });
      requireEditor().select(component);
      queueSelection();
      return true;
    },

    select(id) {
      const ed = requireEditor();
      ed.select(id ? byId(id) : null);
    },

    getSelection() {
      return editor ? describe(editor.getSelected()) : null;
    },

    describe(id) {
      return editor ? describe(byId(id)) : null;
    },

    getRootId() {
      return editor ? body()?.getId() || null : null;
    },

    updateProperties(id, attributes) {
      const component = byId(id);
      if (!component) return;
      /** @type {Record<string, string>} */
      const toSet = {};
      const toRemove = [];
      for (const [key, value] of Object.entries(attributes || {})) {
        // The image keeps its URL in the model (`src`), which the plugin
        // copies into the attributes: writing the attribute alone is undone.
        if (key === 'src' && component.get('src') !== undefined) {
          component.set('src', value || '');
        } else if (value === null || value === undefined || value === '') {
          toRemove.push(key);
        } else {
          toSet[key] = String(value);
        }
      }
      if (Object.keys(toSet).length) component.addAttributes(toSet);
      if (toRemove.length) {
        // The MJML plugin copies the style into the attributes: removing the
        // attribute alone would let it come back through the style.
        component.removeStyle?.(toRemove);
        component.removeAttributes(toRemove);
      }
      queueSelection();
    },

    setContent(id, content) {
      const component = byId(id);
      if (!component) return;
      if (LABEL_TYPES.has(typeOf(component))) {
        component.components(escapeHtml(content));
      } else if (RICH_TYPES.has(typeOf(component))) {
        component.components(String(content || ''));
      }
      queueSelection();
    },

    insertText(text) {
      const ed = requireEditor();
      if (insertAtCaret(ed, escapeHtml(text))) return true;
      const target = ed.getSelected();
      if (target && RICH_TYPES.has(typeOf(target))) {
        target.append({ type: 'textnode', content: ` ${text}` });
        queueSelection();
        return true;
      }
      return false;
    },

    insertLink(href, label) {
      const ed = requireEditor();
      const safeHref = escapeHtml(href).replace(/"/g, '&quot;');
      const html = `<a href="${safeHref}">${escapeHtml(label)}</a>`;
      if (insertAtCaret(ed, html)) return true;
      const target = ed.getSelected();
      if (target && typeOf(target) === 'mj-button') {
        target.addAttributes({ href });
        queueSelection();
        return true;
      }
      if (target && typeOf(target) === 'mj-text') {
        target.append(` ${html}`);
        queueSelection();
        return true;
      }
      return false;
    },

    undo() {
      requireEditor().UndoManager.undo();
      emitHistory();
    },
    redo() {
      requireEditor().UndoManager.redo();
      emitHistory();
    },
    canUndo: () => Boolean(editor?.UndoManager.hasUndo()),
    canRedo: () => Boolean(editor?.UndoManager.hasRedo()),
    clearHistory() {
      requireEditor().UndoManager.clear();
      emitHistory();
    },

    getProject() {
      return withoutPlaceholders(requireEditor().getProjectData());
    },

    loadProject(project) {
      const ed = requireEditor();
      ed.select(null);
      muteUntilFlushed();
      ed.loadProjectData(project);
      emit('load');
      queueSelection();
    },

    loadMjml(mjml) {
      const ed = requireEditor();
      ed.select(null);
      muteUntilFlushed();
      ed.setComponents(mjml || EMPTY_MJML);
      emit('load');
      queueSelection();
    },

    exportMjml() {
      return String(requireEditor().runCommand('mjml-code') || '')
        .replace(PLACEHOLDER_SRC_ATTR, '')
        .trim();
    },

    exportHtml(mjml = null) {
      const source = mjml ?? adapter.exportMjml();
      const result = requireEditor().runCommand('mjml-code-to-html', { mjml: source }) || {};
      return {
        html: String(result.html || ''),
        errors: (result.errors || []).map((/** @type {any} */ e) => ({
          line: e.line,
          message: String(e.formattedMessage || e.message || e),
          tagName: e.tagName,
        })),
      };
    },

    setDevice(device) {
      requireEditor().setDevice(device);
    },

    getDevice() {
      const name = editor?.getDevice?.();
      return name === 'mobile' ? 'mobile' : 'desktop';
    },

    startBlockDrag(block, event) {
      const ed = requireEditor();
      const engineBlock = ed.Blocks.get(`${BLOCK_PREFIX}${block.id}`);
      if (engineBlock) ed.Blocks.startDrag(engineBlock, event);
    },

    endBlockDrag(cancel = false) {
      editor?.Blocks.endDrag(cancel);
    },

    addShortcut(id, keys, handler) {
      const ed = requireEditor();
      const keymapId = `eb:${id}`;
      // `mod` = ⌘ on Mac, Ctrl elsewhere: both are registered.
      const engineKeys = keys
        .split(',')
        .map((k) => k.trim())
        .flatMap((k) => (k.startsWith('mod+') ? [`⌘+${k.slice(4)}`, `ctrl+${k.slice(4)}`] : [k]))
        .join(', ');
      ed.Keymaps.add(keymapId, engineKeys, () => handler(), { prevent: true });
      return () => {
        if (editor === ed) ed.Keymaps.remove(keymapId);
      };
    },
  };

  return adapter;
}

/**
 * GrapesJS empties and fills its container: it gets its own, a child of ours,
 * so React stays the sole owner of the node it rendered.
 *
 * @param {HTMLElement} container
 */
function createEngineHost(container) {
  const el = container.ownerDocument.createElement('div');
  el.className = 'eb-engine-host';
  el.style.height = '100%';
  container.appendChild(el);
  return el;
}
