// @ts-check
import { parseMjml, serializeMjml, encodeAttribute } from '../engine/mjml.js';
import { boxKeys } from '../core/blockBox.js';
import { createNode, findFirst, walk } from '../engine/model.js';
import { toValues, parseBorder, parseSpacing } from '../core/mjmlAttributes.js';
import { MJML_DEFAULTS } from '../core/mjmlDefaults.js';
import { prepareColumnAlignment } from './columnAlignment.js';

/** Only lengths may become outside or inside spacing. @param {string} value */
const spacing = (value) => parseSpacing(value || '0px').map((part) => {
  const number = Number.parseFloat(part);
  return Number.isFinite(number) && number >= 0 ? `${number}${part.endsWith('%') ? '%' : 'px'}` : '0px';
}).join(' ');

/** @param {string} value */
function borderStyle(value) {
  const border = parseBorder(value);
  if (!border) return 'border:0;';
  // A border color cannot add declarations, external resources or markup.
  const color = /^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(border.color) ? border.color : '#cbd5e1';
  return `border-width:${border.widths.map((width) => `${width}px`).join(' ')};border-style:${border.style};border-color:${color};`;
}

/** Prepare model-only box controls without sending unsupported attributes to MJML. @param {string} source */
function prepareBoxes(source) {
  /** @type {{marker: string, margin: string, padding: string, border: string, gutter: boolean}[]} */
  const boxes = [];
  if (!/(?:eb-box-[a-f0-9]+|\bbox-(?:padding|border)\s*=|\bmargin\s*=)/.test(source)) return { mjml: source, boxes };
  const root = parseMjml(source);
  walk(root, (node) => {
    if (node.tag === 'mj-section' || !Object.keys(node.attributes).some((key) => key === 'margin' || key.startsWith('box-'))) return;
    const keys = boxKeys(node.tag);
    const properties = Object.values(keys).map((key) => ({ key }));
    const values = toValues({ ...MJML_DEFAULTS[node.tag], ...node.attributes }, properties);
    const marker = `eb-render-box-${boxes.length}`;
    const margin = spacing(values[keys.margin]);
    const padding = spacing(values[keys.padding]);
    const widths = parseBorder(values[keys.border])?.widths || [0, 0, 0, 0];
    const contextPadding = parseSpacing(margin).map((side, index) => Number.parseFloat(side) + Number.parseFloat(parseSpacing(padding)[index]) + widths[index]);
    boxes.push({ marker, margin, padding, border: borderStyle(values[keys.border]), gutter: node.tag === 'mj-column' && contextPadding.some(Boolean) });
    for (const key of Object.values(keys)) {
      delete node.attributes[key];
      for (const side of ['top', 'right', 'bottom', 'left']) delete node.attributes[`${key}-${side}`];
    }
    // Suppress MJML's default padding: the email table below now supplies it.
    node.attributes.padding = '0px';
    // MJML also uses padding to calculate fixed image widths for Outlook.
    // Reserve the actual box width during compilation, then replace its
    // gutter with the independent layers below.
    if (node.tag === 'mj-image' || node.tag === 'mj-column') node.attributes.padding = contextPadding.map((side) => `${side}px`).join(' ');
    node.attributes['css-class'] = `${node.attributes['css-class'] || ''} ${marker}`.trim();
  });
  return { mjml: boxes.length ? serializeMjml(root) : source, boxes };
}

/** Find the complete marked element without counting Outlook's conditional HTML as DOM. @param {string} html @param {string} marker */
function markedElement(html, marker) {
  const tokens = /<!--[\s\S]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  let start = -1;
  let tag = '';
  let opening = '';
  let depth = 0;
  for (const token of html.matchAll(tokens)) {
    if (!token[1]) continue;
    const closing = token[0].startsWith('</');
    if (start < 0) {
      const classes = /\bclass="([^"]*)"/.exec(token[0])?.[1].split(/\s+/) || [];
      if (closing || !classes.includes(marker)) continue;
      start = token.index;
      tag = token[1].toLowerCase();
      opening = token[0];
      depth = 1;
    } else if (token[1].toLowerCase() === tag) {
      depth += closing ? -1 : 1;
      if (!depth) return { start, end: token.index + token[0].length, opening, tag, inner: html.slice(start + opening.length, token.index), closing: token[0] };
    }
  }
  return null;
}

const table = (inner) => `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="width:100%;border-collapse:separate;"><tbody><tr>${inner}</tr></tbody></table>`;

/** @param {string} opening @param {string} style */
function styled(opening, style) {
  const safe = encodeAttribute(style);
  return /\bstyle="/.test(opening) ? opening.replace(/\bstyle="([^"]*)"/, (_, previous) => `style="${previous};${safe}"`) : opening.replace(/>$/, ` style="${safe}">`);
}

/**
 * An image given a height (those side by side, fitted to the first) is
 * cropped to it, not stretched; on a phone, where the columns stack, it keeps
 * its own proportions. Outlook on Windows has no `object-fit`: it stretches.
 * @param {string} source
 */
function prepareImageHeights(source) {
  if (!/<mj-image\b[^>]*\sheight="\d/.test(source)) return source;
  const root = parseMjml(source);
  walk(root, (node) => {
    if (node.tag === 'mj-image' && /^\d+(?:\.\d+)?px$/.test(node.attributes.height || '')) {
      node.attributes['css-class'] = `${node.attributes['css-class'] || ''} eb-fill`.trim();
    }
  });
  let head = findFirst(root, 'mj-head');
  if (!head) {
    head = createNode('mj-head');
    root.children.unshift(head);
  }
  const width = Number.parseFloat(findFirst(head, 'mj-breakpoint')?.attributes.width || '') || 480;
  head.children.push(createNode('mj-style', { content:
    '.eb-fill img {object-fit:cover;}' +
    `@media only screen and (max-width:${width - 1}px) {.eb-fill img {height:auto!important;}}` }));
  return serializeMjml(root);
}

/** Compile both native MJML and the editor's independent box controls. @param {string} source @param {(source: string, options: any) => any} compile @param {any} [options] */
export async function compileEditorMjml(source, compile, options = {}) {
  const prepared = prepareBoxes(source);
  const result = await compile(prepareColumnAlignment(prepareImageHeights(prepared.mjml)), options);
  let html = String(result.html || '');
  // Children first: outer wrappers retain every nested canvas marker.
  for (const box of prepared.boxes.reverse()) {
    const element = markedElement(html, box.marker);
    if (!element) continue;
    const inside = `padding:${box.padding};${box.border}`;
    let replacement;
    if (element.tag === 'td') {
      const original = styled(element.opening, inside) + element.inner + element.closing;
      replacement = `<td style="padding:${box.margin};font-size:0;">${table(original)}</td>`;
    } else if (element.tag === 'a') {
      replacement = `<span style="display:inline-block;padding:${box.margin};"><span style="display:inline-block;${inside}">${element.opening}${element.inner}${element.closing}</span></span>`;
    } else {
      const inner = box.gutter ? element.inner.replace(/<td\b(?:[^>"']|"[^"]*"|'[^']*')*>/i, (opening) => styled(opening, 'padding:0;')) : element.inner;
      replacement = element.opening + table(`<td style="padding:${box.margin};">${table(`<td style="${inside}">${inner}</td>`)}</td>`) + element.closing;
    }
    html = html.slice(0, element.start) + replacement + html.slice(element.end);
  }
  return { ...result, html };
}
