// @ts-check
/**
 * MJML ⇄ MODEL — reading MJML into the builder's tree, writing it back.
 *
 * MJML is close enough to XML to be read by a small scanner, and only two
 * kinds of element exist:
 *   - containers (`mj-section`, `mj-column`…), made of other MJML elements;
 *   - "ending" elements (`mj-text`, `mj-button`…), whose inside is HTML kept
 *     as is, up to the matching closing tag.
 * Anything else between containers (stray text, comments, HTML outside an
 * ending element) is not MJML and is dropped.
 *
 * Attribute values are DECODED in the model (`&amp;` → `&`) and encoded again
 * on write: the model holds what the attribute means, the MJML how to write
 * it.
 *
 * Two model attributes are written as wrappers in MJML:
 * `margin` on a section becomes the padding of an `eb-section-margin`
 * wrapper, outside the section's border and its own padding.
 * `content-background-color` on
 * `mj-body`, the color painted under the content, at the email's width. A
 * section with rounded corners shows it in its corners instead of the page
 * background. MJML has no such attribute: it is written as an `mj-wrapper`
 * around the sections (`eb-content-layer`), and read back into the body.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { ENDING_TAGS, createNode, findFirst } from './model.js';

/** @typedef {import('./model.js').EmailNode} EmailNode */

/** The color under the content, kept on `mj-body` in the model. */
export const CONTENT_BACKGROUND = 'content-background-color';
/** The class of the `mj-wrapper` it is written as. */
export const CONTENT_LAYER_CLASS = 'eb-content-layer';
/** A section's outside spacing, written as valid MJML rather than a margin attribute. */
export const SECTION_MARGIN_CLASS = 'eb-section-margin';

/**
 * Sections the layer goes under. A band across the whole screen cannot be in
 * an `mj-wrapper` (it would shrink to the content's width), nor can another
 * wrapper: they split the layer in two.
 * @param {EmailNode} node
 */
const underLayer = (node) =>
  (node.tag === 'mj-section' && !node.attributes.margin && node.attributes['full-width'] !== 'full-width') || node.tag === 'mj-hero';

/** @param {EmailNode} node */
const isContentLayer = (node) =>
  node.tag === 'mj-wrapper' && String(node.attributes['css-class'] || '').split(/\s+/).includes(CONTENT_LAYER_CLASS);

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** @param {string} value */
export function decodeAttribute(value) {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    const named = /** @type {Record<string, string>} */ (NAMED_ENTITIES)[entity.toLowerCase()];
    return named ?? match;
  });
}

/** @param {string} value */
export function encodeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Reads the attributes of an opening tag, from `start` (just after the name)
 * to its `>`. Quotes may contain `>`.
 * @param {string} source @param {number} start
 * @returns {{attributes: Record<string, string>, end: number, selfClosing: boolean}}
 */
function readAttributes(source, start) {
  /** @type {Record<string, string>} */
  const attributes = {};
  let i = start;
  const n = source.length;
  while (i < n) {
    while (i < n && /\s/.test(source[i])) i += 1;
    if (source[i] === '>') return { attributes, end: i + 1, selfClosing: false };
    if (source[i] === '/' && source[i + 1] === '>') return { attributes, end: i + 2, selfClosing: true };
    if (i >= n) break;
    const nameMatch = /^[^\s=/>"']+/.exec(source.slice(i, i + 200));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    i += nameMatch[0].length;
    while (i < n && /\s/.test(source[i])) i += 1;
    let value = '';
    if (source[i] === '=') {
      i += 1;
      while (i < n && /\s/.test(source[i])) i += 1;
      const quote = source[i];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, i + 1);
        const stop = close === -1 ? n : close;
        value = source.slice(i + 1, stop);
        i = stop + 1;
      } else {
        let bare = /^[^\s>]*/.exec(source.slice(i))?.[0] || '';
        // `width=100/>`: the slash closes the tag, it is not in the value.
        if (bare.endsWith('/') && source[i + bare.length] === '>') bare = bare.slice(0, -1);
        value = bare;
        i += bare.length;
      }
    }
    attributes[name] = decodeAttribute(value);
  }
  return { attributes, end: n, selfClosing: false };
}

/**
 * MJML elements of a fragment (no `<mjml>` needed): `<mj-section>…</mj-section><mj-section>…`.
 * @param {string} source
 * @returns {EmailNode[]}
 */
export function parseMjmlFragment(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  /** @type {EmailNode} */
  const top = createNode('mj-fragment');
  /** @type {EmailNode[]} */
  const stack = [top];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const close = text.indexOf('-->', i + 4);
      i = close === -1 ? n : close + 3;
      continue;
    }
    if (text.startsWith('<?', i) || text.startsWith('<!', i)) {
      const close = text.indexOf('>', i);
      i = close === -1 ? n : close + 1;
      continue;
    }
    const closing = text[i + 1] === '/';
    const nameMatch = /^[a-z][a-z0-9-]*/i.exec(text.slice(i + (closing ? 2 : 1), i + 60));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    const tag = nameMatch[0].toLowerCase();
    const afterName = i + (closing ? 2 : 1) + nameMatch[0].length;
    const isMjml = tag === 'mjml' || tag.startsWith('mj-');

    if (closing) {
      const close = text.indexOf('>', afterName);
      i = close === -1 ? n : close + 1;
      if (!isMjml) continue;
      // Close up to the matching element (tolerates a forgotten closing tag).
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        if (stack[depth].tag === tag) {
          stack.length = depth;
          break;
        }
      }
      continue;
    }

    const { attributes, end, selfClosing } = readAttributes(text, afterName);
    i = end;
    if (!isMjml) continue;

    const parent = stack[stack.length - 1];
    if (ENDING_TAGS.has(tag)) {
      let content = '';
      if (!selfClosing) {
        const closeRe = new RegExp(`</${tag}\\s*>`, 'ig');
        closeRe.lastIndex = i;
        const close = closeRe.exec(text);
        const stop = close ? close.index : n;
        content = text.slice(i, stop).trim();
        i = close ? close.index + close[0].length : n;
      }
      parent.children.push(createNode(tag, { attributes, content }));
      continue;
    }
    const node = createNode(tag, { attributes });
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return top.children;
}

/**
 * A whole email. Always returns an `mjml` root holding an `mj-body`: a bare
 * fragment is wrapped, a missing body is added.
 * @param {string} source
 * @returns {EmailNode}
 */
export function parseMjml(source) {
  const nodes = parseMjmlFragment(source);
  let root = nodes.find((node) => node.tag === 'mjml') || null;
  if (!root) {
    const body = nodes.find((node) => node.tag === 'mj-body');
    const head = nodes.find((node) => node.tag === 'mj-head');
    root = createNode('mjml', {
      children: [
        ...(head ? [head] : []),
        body || createNode('mj-body', { children: nodes.filter((node) => node.tag !== 'mj-head') }),
      ],
    });
  }
  const body = findFirst(root, 'mj-body');
  if (!body) root.children.push(createNode('mj-body'));
  else {
    const layer = body.children.find((child) => isContentLayer(child) ||
      (child.tag === 'mj-wrapper' && child.attributes['css-class'] === SECTION_MARGIN_CLASS && child.attributes['background-color']));
    const color = layer?.attributes['background-color'];
    if (color) body.attributes[CONTENT_BACKGROUND] = color;
    body.children = body.children.flatMap((child) => (isContentLayer(child) ? child.children : [child]));
  }
  const restoreMargins = (/** @type {EmailNode} */ parent) => {
    parent.children = parent.children.flatMap((child) => {
      if (child.tag === 'mj-wrapper' && String(child.attributes['css-class'] || '').split(/\s+/).includes(SECTION_MARGIN_CLASS) &&
          child.children.length === 1 && child.children[0].tag === 'mj-section') {
        const section = child.children[0];
        section.attributes.margin = child.attributes.padding || '0px';
        if (child.attributes['full-width']) section.attributes['full-width'] = child.attributes['full-width'];
        return [section];
      }
      restoreMargins(child);
      return [child];
    });
  };
  restoreMargins(root);
  return root;
}

/**
 * The MJML of a tree. `pretty`: one element per line, indented (what is
 * stored and downloaded); otherwise on one line.
 * @param {EmailNode} node
 * @param {{pretty?: boolean, attributes?: (node: EmailNode) => Record<string, string>, extraChildren?: (node: EmailNode) => string}} [options]
 *   `attributes`: replaces a node's attributes on write (the canvas adds its
 *   markers there); `extraChildren`: MJML appended inside a container.
 */
export function serializeMjml(node, options = {}) {
  const { pretty = true } = options;
  /** @param {Record<string, string>} attributes */
  const attrsOf = (attributes) =>
    Object.entries(attributes)
      .map(([key, value]) => ` ${key}="${encodeAttribute(value)}"`)
      .join('');
  /** @param {string} tag @param {Record<string, string>} attributes @param {string[]} inner @param {number} depth */
  const element = (tag, attributes, inner, depth) => {
    const indent = pretty ? '  '.repeat(depth) : '';
    const attrs = attrsOf(attributes);
    if (!inner.length) return `${indent}<${tag}${attrs} />`;
    return pretty ? `${indent}<${tag}${attrs}>\n${inner.join('\n')}\n${indent}</${tag}>` : `<${tag}${attrs}>${inner.join('')}</${tag}>`;
  };
  /** The body's children, each run of sections under the layer in its `mj-wrapper`. @param {EmailNode} body @param {number} depth */
  const layered = (body, depth) => {
    const layer = { 'css-class': CONTENT_LAYER_CLASS, 'background-color': body.attributes[CONTENT_BACKGROUND], padding: '0px' };
    /** @type {string[]} */
    const out = [];
    /** @type {EmailNode[]} */
    let run = [];
    const flush = () => {
      if (run.length) out.push(element('mj-wrapper', layer, run.map((child) => write(child, depth + 2)), depth + 1));
      run = [];
    };
    for (const child of body.children) {
      if (underLayer(child)) run.push(child);
      else {
        flush();
        out.push(write(child, depth + 1));
      }
    }
    flush();
    return out;
  };
  /** @param {EmailNode} current @param {number} depth @returns {string} */
  const write = (current, depth) => {
    let attributes = options.attributes ? options.attributes(current) : current.attributes;
    const margin = current.tag === 'mj-section' ? attributes.margin : null;
    if (margin) {
      const { margin: _margin, 'full-width': _fullWidth, ...sectionAttributes } = attributes;
      /** @type {Record<string, string>} */
      const wrapperAttributes = { 'css-class': SECTION_MARGIN_CLASS, padding: margin };
      if (attributes['full-width']) wrapperAttributes['full-width'] = attributes['full-width'];
      const background = findFirst(node, 'mj-body')?.attributes[CONTENT_BACKGROUND];
      if (background && !attributes['full-width']) wrapperAttributes['background-color'] = background;
      return element('mj-wrapper', wrapperAttributes, [
        element(current.tag, sectionAttributes, current.children.map((child) => write(child, depth + 2)), depth + 1),
      ], depth);
    }
    if (current.tag === 'mj-body' && CONTENT_BACKGROUND in attributes) {
      const { [CONTENT_BACKGROUND]: _layer, ...mjml } = attributes;
      attributes = mjml;
    }
    if (current.content !== null) {
      return `${pretty ? '  '.repeat(depth) : ''}<${current.tag}${attrsOf(attributes)}>${current.content}</${current.tag}>`;
    }
    const inner =
      current.tag === 'mj-body' && current.attributes[CONTENT_BACKGROUND]
        ? layered(current, depth)
        : current.children.map((child) => write(child, depth + 1));
    const extra = options.extraChildren ? options.extraChildren(current) : '';
    if (extra) inner.push(pretty ? `${'  '.repeat(depth + 1)}${extra}` : extra);
    return element(current.tag, attributes, inner, depth);
  };
  return write(node, 0);
}
