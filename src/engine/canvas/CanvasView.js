// @ts-check
/**
 * CANVAS VIEW — the email on screen, and every gesture made on it.
 *
 *   ┌ host (the builder's canvas area) ───────────────────────────────┐
 *   │  ┌ frame (iframe: the email's own document) ─────────────────┐  │
 *   │  │  <head>  the compiled email's styles                       │  │
 *   │  │  <body>  the compiled email (mjml-browser), morphed in     │  │
 *   │  │  #eb-ui  our layer: boxes, labels, toolbars, drop line     │  │
 *   │  └────────────────────────────────────────────────────────────┘  │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * The frame shows the real compiled HTML: what is seen is what is sent. Each
 * model element is found in it by its marker class (`canvasMjml.js`).
 *
 * Gestures, all handled here and reported to the adapter as intentions:
 *   click            select the element under the pointer
 *   double-click     edit a text in place (or a click on a selected text)
 *   toolbar          select the parent, move (drag), duplicate, delete
 *   drag and drop    from the sidebar, or the ✥ handle of the selection:
 *                    a line shows where the element will land, the frame
 *                    scrolls near its edges, Esc cancels
 *   text toolbar     bold, italic, underline, strike, link, unlink, clear
 *
 * Owns no email data: it reads the tree through `getRoot()` and asks the
 * adapter for every change.
 */

import { canvasMjml, markedAncestor } from '../canvasMjml.js';
import { dropTargetFor } from '../placement.js';
import { cleanRichText } from '../richText.js';
import { findTags, removalSpan, textMap } from '../mergeTags.js';
import { morphChildren, syncAttributes } from './morph.js';
import { CANVAS_CSS, GHOST_STYLE } from './canvasStyles.js';
import { ICONS } from './icons.js';
import { NO_FORMAT } from '../../core/textFormat.js';

/** @typedef {import('../model.js').EmailNode} EmailNode */
/** @typedef {import('../placement.js').DropTarget} DropTarget */
/** @typedef {{kind: 'content'|'layout', nodeId?: string|null, block?: any}} DragPayload */
/** @typedef {import('../../core/EmailEditor.js').TextFormat} TextFormat */

/** Elements edited as rich text in the canvas. */
export const EDITABLE_TAGS = new Set(['mj-text']);


/** Elements whose words may hold merge tags that the × on a tag takes out. */
const TAGGED_TAGS = new Set(['mj-text', 'mj-button', 'mj-navbar-link']);

const MOBILE_WIDTH = 375;
const EDGE = 56;

/**
 * @param {{
 *   container: HTMLElement,
 *   compile: (mjml: string) => Promise<{html: string, errors: any[]}>,
 *   getRoot: () => EmailNode,
 *   t: (key: string, values?: Record<string, any>) => string,
 *   imageUrl?: ((path: string) => string)|null,
 *   info: (id: string) => {label: string, tag: string, canRemove: boolean, canDuplicate: boolean, canMove: boolean, canStep: boolean, canStepBack: boolean, canStepForward: boolean, vertical: boolean, hasParent: boolean, parentLabel: string}|null,
 *   onSelect: (id: string|null) => void,
 *   onAction: (action: 'parent'|'duplicate'|'remove'|'back'|'forward', id: string) => void,
 *   onRemoveTag: (id: string, index: number) => void,
 *   onDrop: (payload: DragPayload, target: DropTarget) => void,
 *   onEditStart: (id: string) => void,
 *   onEditInput: (id: string, html: string) => void,
 *   onEditEnd: (id: string, html: string) => void,
 *   onFormat?: (format: TextFormat) => void,
 *   onKeyDown: (event: KeyboardEvent) => void,
 * }} options
 *   `onFormat`: the formatting at the caret of the text being edited changed
 *   (and `editing: false` when no text is edited any more).
 */
export function createCanvasView(options) {
  const { container, compile, getRoot, t, info, imageUrl = null } = options;
  const parentDocument = container.ownerDocument;

  const host = parentDocument.createElement('div');
  host.className = 'eb-native-canvas';
  host.style.cssText = 'position:relative;width:100%;height:100%;display:flex;justify-content:center;overflow:hidden;';
  const frame = parentDocument.createElement('iframe');
  frame.className = 'eb-canvas-frame';
  frame.title = t('Email canvas');
  frame.setAttribute('data-testid', 'eb-canvas-frame');
  frame.style.cssText =
    'display:block;border:0;width:100%;height:100%;background:transparent;transition:width .35s ease, box-shadow .35s ease;';
  host.appendChild(frame);
  container.appendChild(host);

  const win = /** @type {Window & typeof globalThis} */ (frame.contentWindow);
  const doc = /** @type {Document} */ (frame.contentDocument);
  doc.open();
  doc.write('<!doctype html><html><head></head><body></body></html>');
  doc.close();

  /* ── Our layer ─────────────────────────────────────────────────────────── */
  const ui = doc.createElement('div');
  ui.id = 'eb-ui';
  ui.setAttribute('contenteditable', 'false');
  const style = doc.createElement('style');
  style.textContent = CANVAS_CSS;
  ui.appendChild(style);
  doc.documentElement.appendChild(ui);

  // CSS variables do not inherit into an iframe. Theme the editing layer only.
  const syncAccent = () => {
    const accent = parentDocument.defaultView?.getComputedStyle(container).getPropertyValue('--eb-primary').trim();
    if (accent) doc.documentElement.style.setProperty('--eb-canvas-primary', accent);
  };
  syncAccent();
  const themeObserver = new MutationObserver(syncAccent);
  for (let ancestor = /** @type {HTMLElement|null} */ (container); ancestor; ancestor = ancestor.parentElement) {
    themeObserver.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  const make = (className) => {
    const el = doc.createElement('div');
    el.className = className;
    el.hidden = true;
    ui.appendChild(el);
    return el;
  };
  const hoverBox = make('eb-ui-box eb-ui-hover');
  const hoverChip = make('eb-ui-chip eb-ui-hover-chip');
  const selectBox = make('eb-ui-box eb-ui-select');
  const selectChip = make('eb-ui-chip');
  selectChip.setAttribute('data-testid', 'eb-canvas-label');
  const tools = make('eb-ui-tools');
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', t('Element actions'));
  const dropLine = make('eb-ui-drop');
  const textTools = make('eb-ui-text');
  textTools.setAttribute('role', 'toolbar');
  textTools.setAttribute('aria-label', t('Text formatting'));
  // A merge tag under the pointer: drawn again in swapped colours, a piece
  // per line it runs over, with a × that takes it out (rather than erasing it
  // letter by letter).
  const tagPieces = doc.createElement('div');
  ui.appendChild(tagPieces);
  const tagClear = doc.createElement('button');
  tagClear.type = 'button';
  tagClear.className = 'eb-ui-tag-clear';
  tagClear.hidden = true;
  tagClear.innerHTML = ICONS.x;
  ui.appendChild(tagClear);
  // A text the AI is working on: a shimmer over it until its new words come.
  const workBox = make('eb-ui-box eb-ui-working');
  workBox.setAttribute('data-testid', 'eb-canvas-working');

  /** @type {string|null} */ let selectedId = null;
  /** Ctrl+A: the sections drawn as selected, and their boxes. */
  /** @type {string[]} */ let multiIds = [];
  /** @type {HTMLElement[]} */ const multiBoxes = [];
  /** @type {string|null} */ let hoverId = null;
  /** The merge tag under the pointer: its element, and which of its tags. */
  /** @type {{id: string, index: number}|null} */ let tagHover = null;
  /** @type {string|null} */ let editingId = null;
  /** @type {HTMLElement|null} */ let editingEl = null;
  /** @type {Range|null} */ let savedRange = null;
  /** @type {null | {payload: DragPayload, target: DropTarget|null, cancel: () => void}} */ let drag = null;
  /** @type {string|null} */ let workingId = null;
  /** The text whose words come in at the next render (the AI's answer), until when. */
  /** @type {{id: string, until: number}|null} */ let revealNext = null;
  /** Words coming in: the text nodes cut into them, and the timer that puts them back. */
  /** @type {{swaps: {node: Text, parts: Node[]}[], timer: number}|null} */ let reveal = null;
  let renderToken = 0;
  let destroyed = false;
  let lastHead = '';
  let overlayFrame = 0;
  /** @type {'desktop'|'mobile'} */ let device = 'desktop';

  /* ── Geometry ──────────────────────────────────────────────────────────── */

  /** @param {string} id */
  const elementOf = (id) => /** @type {HTMLElement|null} */ (doc.querySelector(`.eb-id-${id}`));

  /** Box in frame viewport coordinates. @param {string} id */
  const boxOf = (id) => {
    const el = elementOf(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };

  /** @param {HTMLElement} el @param {{top: number, left: number, width: number, height: number}} r */
  const place = (el, r) => {
    el.style.top = `${r.top}px`;
    el.style.left = `${r.left}px`;
    el.style.width = `${Math.max(0, r.width)}px`;
    el.style.height = `${Math.max(0, r.height)}px`;
  };

  /** Box in document coordinates (what our absolute layer uses). @param {string} id */
  const docBoxOf = (id) => {
    const box = boxOf(id);
    if (!box) return null;
    return { top: box.top + win.scrollY, left: box.left + win.scrollX, width: box.right - box.left, height: box.bottom - box.top };
  };

  /** Chip above a box, or inside it when there is no room above. */
  const placeChip = (chip, box, text) => {
    chip.textContent = text;
    chip.hidden = false;
    const above = box.top - win.scrollY > 22;
    chip.style.top = `${above ? box.top - 21 : box.top + 2}px`;
    chip.style.left = `${box.left + (above ? 0 : 2)}px`;
  };

  /* ── Overlays ──────────────────────────────────────────────────────────── */

  function drawHover() {
    const box = hoverId && hoverId !== selectedId && !drag && !multiIds.length ? docBoxOf(hoverId) : null;
    hoverBox.hidden = hoverChip.hidden = !box;
    if (!box || !hoverId) return;
    place(hoverBox, box);
    placeChip(hoverChip, box, info(hoverId)?.label || '');
  }

  function drawSelection() {
    const box = selectedId ? docBoxOf(selectedId) : null;
    const details = selectedId ? info(selectedId) : null;
    selectBox.hidden = selectChip.hidden = tools.hidden = !box;
    if (!box || !details || !selectedId) return;
    place(selectBox, box);
    placeChip(selectChip, box, details.label);
    // While a text is edited its formatting bar takes that place.
    if (editingId) selectChip.hidden = true;
    // Toolbar: top-right, above the element when there is room. The first
    // button climbs to the parent and says which one ("⤴ Column"): an arrow
    // alone read as "move up". What cannot leave its parent (a column, a
    // social icon, a menu link) gets two arrows instead of the drag handle.
    const [backLabel, forwardLabel] = details.vertical ? [t('Move up'), t('Move down')] : [t('Move left'), t('Move right')];
    const buttons = [
      details.hasParent && ['parent', `${t('Select the parent')}: ${details.parentLabel}`],
      details.canMove && ['move', t('Drag to move')],
      details.canStep && ['back', backLabel, details.vertical ? 'arrowUp' : 'arrowLeft'],
      details.canStep && ['forward', forwardLabel, details.vertical ? 'arrowDown' : 'arrowRight'],
      details.canDuplicate && ['duplicate', t('Duplicate')],
      details.canRemove && ['remove', t('Delete')],
    ].filter(Boolean);
    const signature = buttons.map((b) => b && b[1]).join(',');
    if (tools.dataset.signature !== signature || tools.dataset.lang !== t('Delete')) {
      tools.textContent = '';
      for (const button of buttons) {
        if (!button) continue;
        const [action, label, icon = action] = button;
        const el = doc.createElement('button');
        el.type = 'button';
        el.dataset.action = action;
        el.title = label;
        el.setAttribute('aria-label', label);
        el.innerHTML = ICONS[icon];
        if (action === 'parent') {
          el.classList.add('eb-ui-parent');
          const name = doc.createElement('span');
          name.textContent = details.parentLabel;
          el.appendChild(name);
        }
        tools.appendChild(el);
      }
      tools.dataset.signature = signature;
      tools.dataset.lang = t('Delete');
    }
    for (const button of tools.querySelectorAll('button[data-action="back"], button[data-action="forward"]')) {
      /** @type {HTMLButtonElement} */ (button).disabled =
        button.getAttribute('data-action') === 'back' ? !details.canStepBack : !details.canStepForward;
    }
    tools.hidden = editingId !== null || buttons.length === 0;
    const toolsWidth = tools.offsetWidth || buttons.length * 27 + 4;
    const above = box.top - win.scrollY > 30;
    tools.style.top = `${above ? box.top - 28 : box.top + 2}px`;
    // Right-aligned on the element, but never over its name.
    const afterChip = selectChip.hidden ? box.left : box.left + selectChip.offsetWidth + 4;
    tools.style.left = `${Math.max(afterChip, box.left + box.width - toolsWidth)}px`;
  }

  function drawTextTools() {
    if (!editingId || !editingEl) {
      textTools.hidden = true;
      return;
    }
    const box = docBoxOf(editingId);
    if (!box) return;
    textTools.hidden = false;
    const height = 34;
    const above = box.top - win.scrollY > height + 8;
    textTools.style.top = `${above ? box.top - height - 6 : box.top + box.height + 6}px`;
    textTools.style.left = `${box.left}px`;
    refreshTextState();
  }

  function drawWorking() {
    const box = workingId ? docBoxOf(workingId) : null;
    workBox.hidden = !box;
    if (box) place(workBox, box);
  }

  function drawMulti() {
    while (multiBoxes.length < multiIds.length) {
      const box = make('eb-ui-box eb-ui-select');
      box.setAttribute('data-testid', 'eb-canvas-multi');
      multiBoxes.push(box);
    }
    multiBoxes.forEach((box, i) => {
      const r = i < multiIds.length ? docBoxOf(multiIds[i]) : null;
      box.hidden = !r;
      if (r) place(box, r);
    });
  }

  function refreshOverlays() {
    if (destroyed) return;
    drawMulti();
    drawSelection();
    drawHover();
    drawTextTools();
    drawTag();
    drawWorking();
    // A text only selected: the ribbon shows the format of all its words.
    if (!editingEl) reportFormat(selectedTextFormat());
  }

  function scheduleOverlays() {
    if (overlayFrame) return;
    overlayFrame = win.requestAnimationFrame(() => {
      overlayFrame = 0;
      refreshOverlays();
    });
  }

  /* ── Rendering ─────────────────────────────────────────────────────────── */

  /**
   * Compiles the tree and brings the frame up to date. The latest call wins:
   * an older compilation that finishes later is dropped.
   */
  async function render() {
    const token = ++renderToken;
    const source = canvasMjml(getRoot(), { t, imageUrl });
    let result;
    try {
      result = await compile(source);
    } catch (error) {
      console.warn('[best-email-builder] canvas compilation failed', error);
      return;
    }
    if (destroyed || token !== renderToken) return;
    const parsed = new DOMParser().parseFromString(result.html, 'text/html');
    const head = parsed.head.innerHTML;
    if (head !== lastHead) {
      doc.head.innerHTML = head;
      lastHead = head;
    }
    settleReveal();
    syncAttributes(doc.body, parsed.body);
    morphChildren(doc.body, parsed.body, (element) => element === editingEl);
    if (preview && !preview.el.isConnected) dropPreview();
    // The edited text may have been replaced (its element moved): find it again.
    if (editingId && editingEl && !editingEl.isConnected) {
      const again = editableOf(editingId);
      if (again) {
        again.setAttribute('contenteditable', 'true');
        editingEl = again;
      } else finishEditing();
    }
    if (revealNext) {
      const { id, until } = revealNext;
      revealNext = null;
      const el = Date.now() < until ? elementOf(id) : null;
      if (el) revealWords(el);
    }
    refreshOverlays();
  }

  /**
   * A text the AI just wrote comes in word by word, each fading in after the
   * one before. The words are spans only while they come: then the text
   * nodes they were cut from are put back, so nothing of it is ever edited
   * or saved.
   * @param {HTMLElement} el
   */
  function revealWords(el) {
    settleReveal();
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    /** @type {Text[]} */
    const texts = [];
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/\S/.test(/** @type {Text} */ (node).data)) texts.push(/** @type {Text} */ (node));
    const count = texts.reduce((sum, node) => sum + (node.data.match(/\S+/g) || []).length, 0);
    if (!count) return;
    // A long text comes in no slower than a short one: about a second in all.
    const step = Math.min(70, 1100 / count);
    let index = 0;
    const swaps = texts.map((node) => {
      const parts = node.data
        .split(/(\s+)/)
        .filter(Boolean)
        .map((part) => {
          if (!/\S/.test(part)) return doc.createTextNode(part);
          const word = doc.createElement('span');
          word.className = 'eb-reveal';
          word.style.animationDelay = `${Math.round(index++ * step)}ms`;
          word.textContent = part;
          return word;
        });
      node.replaceWith(...parts);
      return { node, parts };
    });
    reveal = { swaps, timer: win.setTimeout(settleReveal, Math.round(index * step) + 600) };
  }

  /** The words that came in become the text again. */
  function settleReveal() {
    if (!reveal) return;
    win.clearTimeout(reveal.timer);
    for (const { node, parts } of reveal.swaps) {
      if (!parts[0]?.isConnected) continue;
      parts[0].parentNode?.insertBefore(node, parts[0]);
      for (const part of parts) part.parentNode?.removeChild(part);
    }
    reveal = null;
  }

  /* ── Selection and hover ───────────────────────────────────────────────── */

  /** @param {EventTarget|null} target */
  const nodeIdAt = (target) => {
    const el = target && /** @type {any} */ (target).nodeType === 1 ? /** @type {Element} */ (target) : /** @type {any} */ (target)?.parentElement;
    if (!el || ui.contains(el)) return null;
    return markedAncestor(el)?.id || null;
  };

  const bodyId = () => {
    const root = getRoot();
    const body = root.children.find((c) => c.tag === 'mj-body');
    return body ? body.id : null;
  };

  doc.addEventListener('mousemove', (event) => {
    // On the ×: the tag stays as it is.
    if (drag || tagClear.contains(/** @type {Node} */ (event.target))) return;
    const id = nodeIdAt(event.target);
    if (id !== hoverId) {
      hoverId = id;
      drawHover();
    }
    const tag = tagAt(id, event.clientX, event.clientY);
    if (tag?.id !== tagHover?.id || tag?.index !== tagHover?.index) {
      tagHover = tag;
      drawTag();
    }
  });
  doc.addEventListener('mouseleave', () => {
    hoverId = null;
    tagHover = null;
    drawHover();
    drawTag();
  });

  doc.addEventListener('click', (event) => {
    const target = /** @type {Element|null} */ (event.target);
    // Links never navigate in the canvas.
    if (target && target.closest && target.closest('a')) event.preventDefault();
    if (!target || ui.contains(target)) return;
    if (editingEl && editingEl.contains(target)) return;
    // The page around the sections: nothing selected, the panel shows the
    // whole email's settings (name, subject, page).
    const hit = nodeIdAt(target);
    const id = hit && hit !== bodyId() ? hit : null;
    const wasSelected = id !== null && id === selectedId;
    if (editingId && editingId !== id) finishEditing();
    options.onSelect(id);
    const node = id ? findTag(id) : null;
    if (wasSelected && id && node && EDITABLE_TAGS.has(node) && !editingId) {
      startEditing(id, { x: event.clientX, y: event.clientY });
    }
  });

  doc.addEventListener('dblclick', (event) => {
    const target = /** @type {Element|null} */ (event.target);
    if (!target || ui.contains(target) || (editingEl && editingEl.contains(target))) return;
    const id = nodeIdAt(target);
    if (id && EDITABLE_TAGS.has(findTag(id) || '')) {
      options.onSelect(id);
      startEditing(id, { x: event.clientX, y: event.clientY });
    }
  });

  // Native drag of images and links would fight ours.
  doc.addEventListener('dragstart', (event) => event.preventDefault());
  doc.addEventListener('submit', (event) => event.preventDefault());
  doc.addEventListener('keydown', (event) => options.onKeyDown(event));
  doc.addEventListener('load', scheduleOverlays, true); // images arriving change heights
  win.addEventListener('resize', scheduleOverlays);
  const resizeObserver = new ResizeObserver(scheduleOverlays);
  resizeObserver.observe(doc.documentElement);

  /** @param {string} id */
  function findTag(id) {
    /** @param {EmailNode} node @returns {string|null} */
    const search = (node) => {
      if (node.id === id) return node.tag;
      for (const child of node.children) {
        const found = search(child);
        if (found) return found;
      }
      return null;
    };
    return search(getRoot());
  }

  /* ── Merge tags ────────────────────────────────────────────────────────── */

  /** Where an element's words are: a text's content, a button's or a link's label. @param {string} id */
  const wordsOf = (id) => (findTag(id) === 'mj-text' ? editableOf(id) : elementOf(id));
  /** The preview of an AI answer is not part of the text. @param {Element} el */
  const isPreview = (el) => el.classList.contains(PREVIEW_CLASS);

  /** The tags of an element's words, each with its range in the frame. @param {string} id */
  function tagsOf(id) {
    const words = wordsOf(id);
    if (!words) return null;
    const map = textMap(words, isPreview);
    const tags = findTags(map.text).map((tag) => {
      const start = map.pointOf(tag.start);
      const end = map.pointOf(tag.end, true);
      const range = doc.createRange();
      if (start && end) {
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
      }
      return { ...tag, range };
    });
    return { map, tags };
  }

  /**
   * The tag under the pointer (frame viewport coordinates) in the element
   * `id`. The one already shown keeps a margin around it, so that the pointer
   * reaches its × without losing it.
   * @param {string|null} id @param {number} x @param {number} y
   */
  function tagAt(id, x, y) {
    if (!id || !TAGGED_TAGS.has(findTag(id) || '')) return null;
    const found = tagsOf(id);
    if (!found) return null;
    const index = found.tags.findIndex((tag, i) => {
      const margin = tagHover && tagHover.id === id && tagHover.index === i ? 12 : 0;
      return [...tag.range.getClientRects()].some(
        (r) => x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin
      );
    });
    return index === -1 ? null : { id, index };
  }

  /** The first colour painted behind an element (white when none is). @param {Element|null} el */
  function backgroundOf(el) {
    for (let node = el; node; node = node.parentElement) {
      const color = win.getComputedStyle(node).backgroundColor;
      if (color && color !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(color)) return color;
    }
    return '#ffffff';
  }

  /**
   * The pieces of a tag, one per line it runs over: each one's box (frame
   * viewport) and its characters. Measured letter by letter, so a piece
   * holds the tag's letters only, never the words beside them.
   * @param {ReturnType<typeof textMap>} map @param {{start: number, end: number}} tag
   */
  function piecesOf(map, tag) {
    /** @type {{top: number, bottom: number, left: number, right: number, text: string}[]} */
    const pieces = [];
    const range = doc.createRange();
    for (let at = tag.start; at < tag.end; at++) {
      const start = map.pointOf(at);
      const end = map.pointOf(at + 1, true);
      if (!start || !end) continue;
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const r = range.getBoundingClientRect();
      const last = pieces.at(-1);
      // A space where the line breaks has no box: it ends the piece before.
      if (!r.width || !r.height) {
        if (last) last.text += map.text[at];
      } else if (last && r.top < (last.top + last.bottom) / 2) {
        Object.assign(last, { top: Math.min(last.top, r.top), bottom: Math.max(last.bottom, r.bottom), right: Math.max(last.right, r.right) });
        last.text += map.text[at];
      } else pieces.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: map.text[at] });
    }
    return pieces.map((piece) => ({ ...piece, text: piece.text.trim() }));
  }

  function drawTag() {
    const found = tagHover && !drag ? tagsOf(tagHover.id) : null;
    const tag = found && tagHover ? found.tags[tagHover.index] : null;
    const pieces = found && tag ? piecesOf(found.map, tag) : [];
    tagPieces.replaceChildren();
    tagClear.hidden = !tag || !pieces.length;
    if (!tag || !pieces.length) return;
    const textEl = tag.range.startContainer.parentElement;
    const style = textEl ? win.getComputedStyle(textEl) : null;
    // The tag again, in the colours swapped (white on dark becomes dark on white).
    for (const piece of pieces) {
      const box = doc.createElement('div');
      box.className = 'eb-ui-tag';
      box.setAttribute('data-testid', 'eb-canvas-tag');
      place(box, { top: piece.top + win.scrollY, left: piece.left + win.scrollX - 2, width: piece.right - piece.left + 4, height: piece.bottom - piece.top });
      box.textContent = piece.text;
      if (style) {
        box.style.background = style.color;
        box.style.color = backgroundOf(textEl);
        box.style.font = style.font;
        box.style.letterSpacing = style.letterSpacing;
      }
      box.style.lineHeight = `${piece.bottom - piece.top}px`;
      tagPieces.appendChild(box);
    }
    // At the end of the tag, top right: on its last line when it runs over two.
    const end = pieces[pieces.length - 1];
    tagClear.style.top = `${end.top + win.scrollY - 9}px`;
    tagClear.style.left = `${end.right + win.scrollX - 6}px`;
    const label = t('Remove the variable');
    if (tagClear.title !== label) {
      tagClear.title = label;
      tagClear.setAttribute('aria-label', label);
    }
  }

  // The × keeps the caret and the selection where they are.
  tagClear.addEventListener('mousedown', (event) => event.preventDefault());
  tagClear.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const at = tagHover;
    tagHover = null;
    drawTag();
    if (!at) return;
    const found = tagsOf(at.id);
    const tag = found?.tags[at.index];
    if (!found || !tag) return;
    if (editingEl && editingEl.contains(tag.range.startContainer)) {
      // In the text being edited: deleted like a selection, and committed by
      // the input that follows.
      const span = removalSpan(found.map.text, tag.start, tag.end);
      const start = found.map.pointOf(span.start);
      const end = found.map.pointOf(span.end, true);
      const selection = win.getSelection();
      if (!start || !end || !selection) return;
      const range = doc.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      selection.removeAllRanges();
      selection.addRange(range);
      doc.execCommand('delete');
      savedRange = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    } else options.onRemoveTag(at.id, at.index);
  });

  /* ── Element toolbar ───────────────────────────────────────────────────── */

  tools.addEventListener('click', (event) => {
    const button = /** @type {Element} */ (event.target).closest('button');
    if (!button || !selectedId) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.getAttribute('data-action');
    if (action === 'parent' || action === 'duplicate' || action === 'remove' || action === 'back' || action === 'forward') {
      options.onAction(action, selectedId);
    }
  });
  tools.addEventListener('pointerdown', (event) => {
    const button = /** @type {Element} */ (event.target).closest('button[data-action="move"]');
    if (!button || !selectedId || event.button !== 0) return;
    event.preventDefault();
    const tag = findTag(selectedId) || '';
    const kind = tag === 'mj-section' || tag === 'mj-wrapper' || tag === 'mj-hero' ? 'layout' : 'content';
    startDrag({
      payload: { kind, nodeId: selectedId },
      label: info(selectedId)?.label || '',
      source: 'frame',
      pointerId: event.pointerId,
      captureTarget: /** @type {Element} */ (button),
      x: event.clientX,
      y: event.clientY,
    });
  });

  /* ── Text editing ──────────────────────────────────────────────────────── */

  /** The element holding a text's content: MJML's `<td class=…><div>…</div></td>`. @param {string} id */
  function editableOf(id) {
    const cell = elementOf(id);
    const inner = cell && cell.firstElementChild;
    return inner && inner.tagName === 'DIV' ? /** @type {HTMLElement} */ (inner) : null;
  }

  /** @param {{x: number, y: number}|null} at */
  function placeCaret(at) {
    if (!editingEl) return;
    const selection = win.getSelection();
    if (!selection) return;
    /** @type {Range|null} */
    let range = null;
    if (at) {
      const anyDoc = /** @type {any} */ (doc);
      if (anyDoc.caretRangeFromPoint) range = anyDoc.caretRangeFromPoint(at.x, at.y);
      else if (anyDoc.caretPositionFromPoint) {
        const position = anyDoc.caretPositionFromPoint(at.x, at.y);
        if (position) {
          range = doc.createRange();
          range.setStart(position.offsetNode, position.offset);
        }
      }
      if (range && !editingEl.contains(range.startContainer)) range = null;
    }
    if (!range) {
      range = doc.createRange();
      range.selectNodeContents(editingEl);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
  }

  /**
   * @param {string} id
   * @param {{x: number, y: number}|null} [at]  where the caret goes (click point)
   */
  function startEditing(id, at = null) {
    if (editingId === id) return;
    finishEditing();
    dropPreview();
    settleReveal();
    const el = editableOf(id);
    if (!el) return;
    editingId = id;
    editingEl = el;
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    el.focus({ preventScroll: true });
    try {
      doc.execCommand('styleWithCSS', false, 'false');
    } catch {
      /* not supported: tags are written anyway */
    }
    placeCaret(at);
    options.onEditStart(id);
    refreshOverlays();
  }

  function contentOfEditing() {
    if (!editingEl) return '';
    let source = editingEl;
    if (preview && editingEl.contains(preview.el)) {
      source = /** @type {HTMLElement} */ (editingEl.cloneNode(true));
      source.querySelectorAll(`.${PREVIEW_CLASS}`).forEach((el) => el.remove());
    }
    return cleanRichText(source.innerHTML, doc);
  }

  function finishEditing() {
    if (!editingId || !editingEl) return;
    dropPreview();
    const id = editingId;
    const html = contentOfEditing();
    editingEl.removeAttribute('contenteditable');
    editingEl.removeAttribute('spellcheck');
    editingId = null;
    editingEl = null;
    savedRange = null;
    hideLinkInput();
    textTools.hidden = true;
    options.onEditEnd(id, html);
    refreshOverlays();
  }

  doc.addEventListener('input', (event) => {
    if (!editingEl || !editingId || !editingEl.contains(/** @type {Node} */ (event.target))) return;
    options.onEditInput(editingId, contentOfEditing());
    scheduleOverlays();
  });

  doc.addEventListener('keydown', (event) => {
    if (!editingEl) return;
    if (event.key === 'Enter') {
      // A line break, not a new block: renders the same in every client.
      event.preventDefault();
      if (!doc.execCommand('insertLineBreak')) doc.execCommand('insertHTML', false, '<br>');
    }
  });

  doc.addEventListener('paste', (event) => {
    if (!editingEl || !editingEl.contains(/** @type {Node} */ (event.target))) return;
    // Plain text only: no foreign styles or tags in the email.
    event.preventDefault();
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    doc.execCommand('insertText', false, text);
  });

  doc.addEventListener('selectionchange', () => {
    if (!editingEl) return;
    const selection = win.getSelection();
    if (selection && selection.rangeCount && editingEl.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      savedRange = selection.getRangeAt(0).cloneRange();
      refreshTextState();
    }
  });

  /** Puts the caret back where it was (the host page may have taken the focus). */
  function restoreCaret() {
    if (!editingEl) return false;
    editingEl.focus({ preventScroll: true });
    const selection = win.getSelection();
    if (!selection) return false;
    if (savedRange && editingEl.contains(savedRange.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    } else placeCaret(null);
    return true;
  }

  /* ── Text preview ──────────────────────────────────────────────────────── */

  /**
   * A text shown where `insertText` would put it, before it is chosen (a
   * variable under the pointer): typed in, then wiped out. At the caret of the
   * text being edited, else at the end of the selected text or button. Never
   * part of the email: the next render redraws the element it lives in, and
   * the edited text is read without it.
   */
  /** @type {null | {el: HTMLElement, prefix: string, shown: string, target: string, timer: number}} */
  let preview = null;
  const PREVIEW_CLASS = 'eb-preview-text';

  /** Where the text would go, or null when nothing takes it. */
  function previewSpot() {
    if (editingEl) {
      const range = savedRange && editingEl.contains(savedRange.commonAncestorContainer) ? savedRange.cloneRange() : null;
      if (range) {
        range.collapse(false);
        return { range, prefix: '' };
      }
      return { parent: editingEl, prefix: '' };
    }
    const tag = selectedId ? info(selectedId)?.tag : null;
    if (!selectedId || (tag !== 'mj-text' && tag !== 'mj-button')) return null;
    // A button's label is its link (or its paragraph without one).
    const parent = tag === 'mj-text' ? editableOf(selectedId) : elementOf(selectedId)?.querySelector('a, p');
    return parent ? { parent, prefix: ' ' } : null;
  }

  function stepPreview() {
    if (!preview) return;
    const current = preview;
    const { shown, target } = current;
    // Wipe back to what both share, then type the rest: a character at a
    // time, an emoji being one.
    const typed = characters(shown);
    const next = !target.startsWith(shown)
      ? typed.slice(0, -1).join('')
      : shown.length < target.length
        ? characters(target).slice(0, typed.length + 1).join('')
        : null;
    if (next === null) {
      current.timer = 0;
      current.el.removeAttribute('data-typing');
      if (!target) dropPreview();
      return;
    }
    current.shown = next;
    current.el.textContent = next;
    current.el.setAttribute('data-typing', '');
    current.timer = win.setTimeout(stepPreview, next.length < shown.length ? 12 : 22);
    scheduleOverlays();
  }

  function animatePreview() {
    if (!preview || preview.timer) return;
    if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      preview.shown = preview.target;
      preview.el.textContent = preview.target;
      if (!preview.target) dropPreview();
      scheduleOverlays();
      return;
    }
    stepPreview();
  }

  /** @param {string} text @returns {boolean} false when nothing would take it */
  function previewText(text) {
    if (!text) {
      hidePreview();
      return false;
    }
    if (preview && !preview.el.isConnected) dropPreview();
    if (!preview) {
      const spot = previewSpot();
      if (!spot) return false;
      const el = doc.createElement('span');
      el.className = PREVIEW_CLASS;
      el.setAttribute('contenteditable', 'false');
      el.setAttribute('data-testid', 'eb-canvas-preview');
      if (spot.range) spot.range.insertNode(el);
      else spot.parent?.appendChild(el);
      preview = { el, prefix: spot.prefix, shown: '', target: '', timer: 0 };
    }
    preview.target = preview.prefix + text;
    animatePreview();
    return true;
  }

  /** Wipes the preview out. */
  function hidePreview() {
    if (!preview) return;
    preview.target = '';
    animatePreview();
  }

  /** Removes the preview at once. */
  function dropPreview() {
    if (!preview) return;
    win.clearTimeout(preview.timer);
    preview.el.remove();
    preview = null;
    scheduleOverlays();
  }

  /**
   * The preview becomes what was inserted: it stays, whole, until the render
   * that draws the real text replaces it (no blink in between).
   */
  function settlePreview() {
    if (!preview) return;
    win.clearTimeout(preview.timer);
    preview.el.textContent = preview.target;
    preview.el.removeAttribute('data-typing');
    preview = null;
  }

  /* Text toolbar: built once. */
  const TEXT_BUTTONS = [
    ['bold', t('Bold (Ctrl+B)')],
    ['italic', t('Italic (Ctrl+I)')],
    ['underline', t('Underline (Ctrl+U)')],
    ['strike', t('Strikethrough')],
    ['sep'],
    ['link', t('Link')],
    ['unlink', t('Remove the link')],
    ['sep'],
    ['clear', t('Clear formatting')],
  ];
  const linkInput = doc.createElement('input');
  linkInput.type = 'url';
  linkInput.placeholder = 'https://';
  linkInput.setAttribute('aria-label', t('Link URL'));
  linkInput.hidden = true;
  const linkConfirm = doc.createElement('button');
  linkConfirm.type = 'button';
  linkConfirm.dataset.command = 'link-confirm';
  linkConfirm.title = t('Apply the link');
  linkConfirm.setAttribute('aria-label', t('Apply the link'));
  linkConfirm.innerHTML = ICONS.check;
  linkConfirm.hidden = true;

  for (const [command, label] of TEXT_BUTTONS) {
    if (command === 'sep') {
      const sep = doc.createElement('span');
      sep.className = 'eb-ui-sep';
      textTools.appendChild(sep);
      continue;
    }
    const button = doc.createElement('button');
    button.type = 'button';
    button.dataset.command = command;
    button.title = /** @type {string} */ (label);
    button.setAttribute('aria-label', /** @type {string} */ (label));
    button.innerHTML = ICONS[/** @type {keyof typeof ICONS} */ (command)];
    textTools.appendChild(button);
  }
  textTools.appendChild(linkInput);
  textTools.appendChild(linkConfirm);

  // Keep the text's selection: a toolbar press must not take the focus.
  textTools.addEventListener('mousedown', (event) => {
    if (event.target !== linkInput) event.preventDefault();
  });

  const NATIVE = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough', unlink: 'unlink', clear: 'removeFormat' };

  textTools.addEventListener('click', (event) => {
    const button = /** @type {Element} */ (event.target).closest('button');
    if (!button || !editingEl) return;
    event.preventDefault();
    event.stopPropagation();
    const command = button.getAttribute('data-command') || '';
    if (command === 'link') {
      showLinkInput();
      return;
    }
    if (command === 'link-confirm') {
      applyLink(linkInput.value.trim());
      return;
    }
    runTextCommand(command);
  });

  /**
   * Bold, italic, underline, strike, unlink or clear on the text being
   * edited, where its caret or selection was.
   * @param {string} command
   */
  function runTextCommand(command) {
    const native = /** @type {Record<string, string>} */ (NATIVE)[command];
    if (!native || !editingEl) return false;
    restoreCaret();
    if (command === 'unlink') selectLinkUnderCaret();
    doc.execCommand(native);
    if (command === 'clear') doc.execCommand('unlink');
    options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
    refreshTextState();
    return true;
  }

  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink(linkInput.value.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideLinkInput();
      restoreCaret();
    }
    event.stopPropagation();
  });

  function linkUnderCaret() {
    if (!savedRange || !editingEl) return null;
    let node = /** @type {Node|null} */ (savedRange.startContainer);
    while (node && node !== editingEl) {
      if (node.nodeType === 1 && /** @type {Element} */ (node).tagName === 'A') return /** @type {HTMLAnchorElement} */ (node);
      node = node.parentNode;
    }
    return null;
  }

  function selectLinkUnderCaret() {
    const link = linkUnderCaret();
    const selection = win.getSelection();
    if (!link || !selection || !savedRange || !savedRange.collapsed) return;
    const range = doc.createRange();
    range.selectNodeContents(link);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function showLinkInput() {
    const link = linkUnderCaret();
    linkInput.value = link ? link.getAttribute('href') || '' : '';
    linkInput.hidden = false;
    linkConfirm.hidden = false;
    linkInput.focus();
    linkInput.select();
  }

  function hideLinkInput() {
    linkInput.hidden = true;
    linkConfirm.hidden = true;
  }

  /** @param {string} href */
  function applyLink(href) {
    hideLinkInput();
    restoreCaret();
    if (!href || !editingEl) return;
    const safe = /^(https?:\/\/|mailto:|tel:|#|\{\{)/i.test(href) ? href : `https://${href}`;
    const existing = linkUnderCaret();
    if (existing) existing.setAttribute('href', safe);
    else if (savedRange && !savedRange.collapsed) doc.execCommand('createLink', false, safe);
    else doc.execCommand('insertHTML', false, `<a href="${escapeAttribute(safe)}">${escapeHtml(safe)}</a>`);
    options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
    refreshTextState();
  }

  /** @type {TextFormat} */
  let reported = NO_FORMAT;

  /** Tells the builder (its ribbon) what the caret is in, when that changed. @param {TextFormat} format */
  function reportFormat(format) {
    if (Object.keys(format).every((key) => format[key] === reported[key])) return;
    reported = format;
    options.onFormat?.(format);
  }

  /**
   * The format of every word of the selected text, when it is not being
   * edited: bold when all of it is bold, the link when all of it is one.
   * @returns {TextFormat}
   */
  function selectedTextFormat() {
    const el = selectedId && EDITABLE_TAGS.has(findTag(selectedId) || '') ? editableOf(selectedId) : null;
    if (!el) return NO_FORMAT;
    const all = { bold: true, italic: true, underline: true, strike: true };
    /** @type {string|null|undefined} */
    let href;
    let words = 0;
    const walker = doc.createTreeWalker(el, win.NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!node.nodeValue?.trim() || !parent || parent.closest(`.${PREVIEW_CLASS}`)) continue;
      words += 1;
      const style = win.getComputedStyle(parent);
      if (!(Number(style.fontWeight) >= 600 || style.fontWeight === 'bold')) all.bold = false;
      if (style.fontStyle === 'normal') all.italic = false;
      // Text decorations are not inherited: they come from any element above.
      let lines = '';
      for (let up = /** @type {HTMLElement|null} */ (parent); up && el.contains(up); up = up.parentElement) lines += ` ${win.getComputedStyle(up).textDecorationLine}`;
      if (!lines.includes('underline')) all.underline = false;
      if (!lines.includes('line-through')) all.strike = false;
      const link = parent.closest('a');
      const at = link && el.contains(link) ? link.getAttribute('href') || '' : null;
      href = href === undefined || href === at ? at : null;
    }
    if (!words) return NO_FORMAT;
    return { ...NO_FORMAT, ...all, link: href || null };
  }

  function refreshTextState() {
    if (!editingEl) return;
    /** @type {TextFormat} */
    const format = { ...NO_FORMAT, editing: true, link: linkUnderCaret()?.getAttribute('href') || null };
    for (const [command, native] of Object.entries({ bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' })) {
      const button = textTools.querySelector(`[data-command="${command}"]`);
      let on;
      try {
        on = doc.queryCommandState(native);
      } catch {
        on = false;
      }
      button?.setAttribute('aria-pressed', on ? 'true' : 'false');
      format[command] = on;
    }
    reportFormat(format);
  }

  /* ── Drag and drop ─────────────────────────────────────────────────────── */

  /**
   * @param {{
   *   payload: DragPayload,
   *   label: string,
   *   source: 'host'|'frame',
   *   pointerId: number,
   *   captureTarget: Element,
   *   x: number,
   *   y: number,
   * }} start
   */
  function startDrag(start) {
    cancelDrag();
    finishEditing();
    const { payload, source, captureTarget } = start;
    const ghost = parentDocument.createElement('div');
    ghost.setAttribute('style', GHOST_STYLE);
    ghost.setAttribute('data-testid', 'eb-drag-ghost');
    ghost.textContent = start.label;
    parentDocument.body.appendChild(ghost);
    try {
      captureTarget.setPointerCapture(start.pointerId);
    } catch {
      /* the pointer is gone already */
    }
    let last = { x: start.x, y: start.y };
    let scrollFrame = 0;

    /** Pointer → frame viewport coordinates, or null when outside the frame. */
    const toFrame = (x, y) => {
      if (source === 'frame') {
        const inside = x >= 0 && y >= 0 && x <= win.innerWidth && y <= win.innerHeight;
        return inside ? { x, y } : null;
      }
      const rect = frame.getBoundingClientRect();
      const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      return inside ? { x: x - rect.left, y: y - rect.top } : null;
    };
    /** Pointer → host page coordinates (for the label). */
    const toHost = (x, y) => {
      if (source === 'host') return { x, y };
      const rect = frame.getBoundingClientRect();
      return { x: x + rect.left, y: y + rect.top };
    };

    const update = () => {
      const position = toHost(last.x, last.y);
      ghost.style.left = `${position.x}px`;
      ghost.style.top = `${position.y}px`;
      const point = toFrame(last.x, last.y);
      if (!drag) return;
      if (!point) {
        drag.target = null;
        dropLine.hidden = true;
        return;
      }
      const hit = doc.elementFromPoint(point.x, point.y);
      const hitId = hit && !ui.contains(hit) ? markedAncestor(hit)?.id || null : null;
      const target = dropTargetFor(getRoot(), payload, point, hitId, boxOf);
      drag.target = target;
      if (!target) {
        dropLine.hidden = true;
        return;
      }
      dropLine.hidden = false;
      dropLine.style.top = `${target.line.y + win.scrollY}px`;
      dropLine.style.left = `${target.line.x + win.scrollX}px`;
      dropLine.style.width = `${Math.max(24, target.line.width)}px`;
    };

    // Near the top or bottom edge, the frame scrolls by itself.
    const autoscroll = () => {
      scrollFrame = 0;
      if (!drag) return;
      const point = toFrame(last.x, last.y);
      if (point) {
        const height = win.innerHeight;
        const speed = point.y < EDGE ? -(EDGE - point.y) / 3 : point.y > height - EDGE ? (point.y - (height - EDGE)) / 3 : 0;
        if (speed) {
          win.scrollBy(0, speed);
          update();
        }
        if (speed) scrollFrame = win.requestAnimationFrame(autoscroll);
      }
    };

    const onMove = (/** @type {PointerEvent} */ event) => {
      if (event.pointerId !== start.pointerId) return;
      last = { x: event.clientX, y: event.clientY };
      update();
      if (!scrollFrame) scrollFrame = win.requestAnimationFrame(autoscroll);
    };
    const onUp = (/** @type {PointerEvent} */ event) => {
      if (event.pointerId !== start.pointerId) return;
      last = { x: event.clientX, y: event.clientY };
      update();
      const target = drag?.target || null;
      end();
      if (target) options.onDrop(payload, target);
    };
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        end();
      }
    };
    const end = () => {
      captureTarget.removeEventListener('pointermove', /** @type {any} */ (onMove));
      captureTarget.removeEventListener('pointerup', /** @type {any} */ (onUp));
      captureTarget.removeEventListener('pointercancel', /** @type {any} */ (end));
      captureTarget.removeEventListener('lostpointercapture', /** @type {any} */ (end));
      parentDocument.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('keydown', onKey, true);
      if (scrollFrame) win.cancelAnimationFrame(scrollFrame);
      try {
        captureTarget.releasePointerCapture(start.pointerId);
      } catch {
        /* already released */
      }
      ghost.remove();
      dropLine.hidden = true;
      drag = null;
      refreshOverlays();
    };

    captureTarget.addEventListener('pointermove', /** @type {any} */ (onMove));
    captureTarget.addEventListener('pointerup', /** @type {any} */ (onUp));
    captureTarget.addEventListener('pointercancel', /** @type {any} */ (end));
    captureTarget.addEventListener('lostpointercapture', /** @type {any} */ (end));
    parentDocument.addEventListener('keydown', onKey, true);
    doc.addEventListener('keydown', onKey, true);
    drag = { payload, target: null, cancel: end };
    hoverId = null;
    tagHover = null;
    refreshOverlays();
    update();
  }

  function cancelDrag() {
    drag?.cancel();
  }

  /* ── Public ────────────────────────────────────────────────────────────── */

  return {
    frame,
    document: doc,
    render,
    refresh: refreshOverlays,
    /** @param {string|null} id */
    setSelection(id) {
      if (editingId && editingId !== id) finishEditing();
      if (id !== selectedId) dropPreview();
      selectedId = id;
      refreshOverlays();
      if (id) {
        const el = elementOf(id);
        // Bring a selected element into view (added by click below the fold).
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > win.innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    },
    /** Ctrl+A: boxes on every given element (empty array: none). @param {string[]} ids */
    setMultiSelection(ids) {
      multiIds = [...ids];
      refreshOverlays();
    },
    /** @param {'desktop'|'mobile'} next */
    setDevice(next) {
      device = next;
      frame.style.width = next === 'mobile' ? `${MOBILE_WIDTH}px` : '100%';
      frame.style.boxShadow = next === 'mobile' ? '0 0 0 1px #dfe3ea, 0 12px 30px -16px rgba(16,24,40,.35)' : 'none';
      frame.dataset.device = next;
    },
    getDevice: () => device,
    startDrag,
    cancelDrag,
    isDragging: () => drag !== null,
    /** @param {string} id @param {{x: number, y: number}|null} [at] */
    startEditing,
    finishEditing,
    editingId: () => editingId,
    /**
     * A command of the text toolbar, from outside the frame (the builder's
     * ribbon): bold, italic, underline, strike, link (`value`: its address),
     * unlink or clear. On the selection of the text being edited; on a text
     * only selected, on all of it, which stays selected and not edited (what
     * comes next goes at its end, it does not replace it).
     * @param {string} command @param {string} [value]
     */
    formatText(command, value = '') {
      const apply = () => {
        if (command !== 'link') return runTextCommand(command);
        applyLink(value.trim());
        return true;
      };
      if (editingId) return apply();
      if (!selectedId || !EDITABLE_TAGS.has(findTag(selectedId) || '')) return false;
      startEditing(selectedId);
      if (!editingEl) return false;
      const range = doc.createRange();
      range.selectNodeContents(editingEl);
      const selection = win.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      savedRange = range.cloneRange();
      const done = apply();
      finishEditing();
      win.getSelection()?.removeAllRanges();
      return done;
    },
    /** @param {string} text */
    insertText(text) {
      dropPreview();
      if (!restoreCaret()) return false;
      doc.execCommand('insertText', false, text);
      options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
      return true;
    },
    /** @param {string} html */
    insertHtml(html) {
      dropPreview();
      if (!restoreCaret()) return false;
      doc.execCommand('insertHTML', false, html);
      options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
      return true;
    },
    previewText,
    hidePreview,
    settlePreview,
    /** A shimmer over the element while the AI works on it (null: none). @param {string|null} id */
    setWorking(id) {
      workingId = id;
      drawWorking();
    },
    /** The element's words come in, one after the other, at the next render. @param {string} id */
    revealOnRender(id) {
      revealNext = { id, until: Date.now() + 5000 };
    },
    destroy() {
      destroyed = true;
      dropPreview();
      settleReveal();
      cancelDrag();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      if (overlayFrame) win.cancelAnimationFrame(overlayFrame);
      host.remove();
    },
  };
}

const graphemes = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** The characters a reader sees: "👍🏽" is one, not four code units. @param {string} text */
function characters(text) {
  return graphemes ? Array.from(graphemes.segment(text), (part) => part.segment) : Array.from(text);
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} text */
function escapeAttribute(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
