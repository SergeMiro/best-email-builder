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
import { morphChildren, syncAttributes } from './morph.js';
import { CANVAS_CSS, GHOST_STYLE } from './canvasStyles.js';
import { ICONS } from './icons.js';

/** @typedef {import('../model.js').EmailNode} EmailNode */
/** @typedef {import('../placement.js').DropTarget} DropTarget */
/** @typedef {{kind: 'content'|'layout', nodeId?: string|null, block?: any}} DragPayload */

/** Elements edited as rich text in the canvas. */
export const EDITABLE_TAGS = new Set(['mj-text']);

const MOBILE_WIDTH = 375;
const EDGE = 56;

/**
 * @param {{
 *   container: HTMLElement,
 *   compile: (mjml: string) => Promise<{html: string, errors: any[]}>,
 *   getRoot: () => EmailNode,
 *   t: (key: string, values?: Record<string, any>) => string,
 *   info: (id: string) => {label: string, tag: string, canRemove: boolean, canDuplicate: boolean, canMove: boolean, hasParent: boolean, parentLabel: string}|null,
 *   onSelect: (id: string|null) => void,
 *   onAction: (action: 'parent'|'duplicate'|'remove', id: string) => void,
 *   onDrop: (payload: DragPayload, target: DropTarget) => void,
 *   onEditStart: (id: string) => void,
 *   onEditInput: (id: string, html: string) => void,
 *   onEditEnd: (id: string, html: string) => void,
 *   onKeyDown: (event: KeyboardEvent) => void,
 * }} options
 */
export function createCanvasView(options) {
  const { container, compile, getRoot, t, info } = options;
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

  /** @type {string|null} */ let selectedId = null;
  /** Ctrl+A: the sections drawn as selected, and their boxes. */
  /** @type {string[]} */ let multiIds = [];
  /** @type {HTMLElement[]} */ const multiBoxes = [];
  /** @type {string|null} */ let hoverId = null;
  /** @type {string|null} */ let editingId = null;
  /** @type {HTMLElement|null} */ let editingEl = null;
  /** @type {Range|null} */ let savedRange = null;
  /** @type {null | {payload: DragPayload, target: DropTarget|null, cancel: () => void}} */ let drag = null;
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
    // alone read as "move up".
    const buttons = [
      details.hasParent && ['parent', `${t('Select the parent')}: ${details.parentLabel}`],
      details.canMove && ['move', t('Drag to move')],
      details.canDuplicate && ['duplicate', t('Duplicate')],
      details.canRemove && ['remove', t('Delete')],
    ].filter(Boolean);
    const signature = buttons.map((b) => b && b[1]).join(',');
    if (tools.dataset.signature !== signature || tools.dataset.lang !== t('Delete')) {
      tools.textContent = '';
      for (const button of buttons) {
        if (!button) continue;
        const [action, label] = button;
        const el = doc.createElement('button');
        el.type = 'button';
        el.dataset.action = action;
        el.title = label;
        el.setAttribute('aria-label', label);
        el.innerHTML = ICONS[action];
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
    const source = canvasMjml(getRoot(), { t });
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
    syncAttributes(doc.body, parsed.body);
    morphChildren(doc.body, parsed.body, (element) => element === editingEl);
    // The edited text may have been replaced (its element moved): find it again.
    if (editingId && editingEl && !editingEl.isConnected) {
      const again = editableOf(editingId);
      if (again) {
        again.setAttribute('contenteditable', 'true');
        editingEl = again;
      } else finishEditing();
    }
    refreshOverlays();
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
    if (drag) return;
    const id = nodeIdAt(event.target);
    if (id !== hoverId) {
      hoverId = id;
      drawHover();
    }
  });
  doc.addEventListener('mouseleave', () => {
    hoverId = null;
    drawHover();
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

  /* ── Element toolbar ───────────────────────────────────────────────────── */

  tools.addEventListener('click', (event) => {
    const button = /** @type {Element} */ (event.target).closest('button');
    if (!button || !selectedId) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.getAttribute('data-action');
    if (action === 'parent' || action === 'duplicate' || action === 'remove') options.onAction(action, selectedId);
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
    return editingEl ? cleanRichText(editingEl.innerHTML, doc) : '';
  }

  function finishEditing() {
    if (!editingId || !editingEl) return;
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
      applyLink();
      return;
    }
    restoreCaret();
    const native = /** @type {Record<string, string>} */ (NATIVE)[command];
    if (native) {
      if (command === 'unlink') selectLinkUnderCaret();
      doc.execCommand(native);
      if (command === 'clear') doc.execCommand('unlink');
    }
    options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
    refreshTextState();
  });

  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink();
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

  function applyLink() {
    const href = linkInput.value.trim();
    hideLinkInput();
    restoreCaret();
    if (!href || !editingEl) return;
    const safe = /^(https?:\/\/|mailto:|tel:|#|\{\{)/i.test(href) ? href : `https://${href}`;
    const existing = linkUnderCaret();
    if (existing) existing.setAttribute('href', safe);
    else if (savedRange && !savedRange.collapsed) doc.execCommand('createLink', false, safe);
    else doc.execCommand('insertHTML', false, `<a href="${escapeAttribute(safe)}">${escapeHtml(safe)}</a>`);
    options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
  }

  function refreshTextState() {
    if (!editingEl) return;
    for (const [command, native] of Object.entries({ bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' })) {
      const button = textTools.querySelector(`[data-command="${command}"]`);
      let on;
      try {
        on = doc.queryCommandState(native);
      } catch {
        on = false;
      }
      button?.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
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
    /** @param {string} text */
    insertText(text) {
      if (!restoreCaret()) return false;
      doc.execCommand('insertText', false, text);
      options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
      return true;
    },
    /** @param {string} html */
    insertHtml(html) {
      if (!restoreCaret()) return false;
      doc.execCommand('insertHTML', false, html);
      options.onEditInput(/** @type {string} */ (editingId), contentOfEditing());
      return true;
    },
    destroy() {
      destroyed = true;
      cancelDrag();
      resizeObserver.disconnect();
      if (overlayFrame) win.cancelAnimationFrame(overlayFrame);
      host.remove();
    },
  };
}

/** @param {string} text */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} text */
function escapeAttribute(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
