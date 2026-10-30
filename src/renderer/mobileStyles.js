// @ts-check
/**
 * PHONE STYLES — the `mobile-*` values of the elements, in the sent email.
 *
 * MJML has no attribute per screen. So the email is compiled twice, once as a
 * computer shows it and once as a phone does (each element's `mobile-*`
 * values in place of its own), and every tag whose styles differ between the
 * two gets a class and, under the breakpoint, the phone's styles with
 * `!important` (they beat the inline ones). Whatever MJML turns an attribute
 * into — a style on a cell, on a link, on a picture — the phone gets it,
 * with no table of what goes where.
 *
 * Only styles change between the two: the attributes that would change the
 * markup itself (an address, a picture, full width) are the same on every
 * screen (see mobileAllowed). If the two still differ in their tags, the
 * phone keeps the computer's look rather than a wrong one.
 */

import { parseMjml, serializeMjml } from '../engine/mjml.js';
import { findFirst, walk } from '../engine/model.js';
import { attributeOf, mobileOverrides, withMobile, withoutMobile } from '../core/mjmlAttributes.js';

/**
 * The editor's box controls are added around an element only when it has one,
 * and MJML adds a table inside a column only when it has a padding: both
 * versions must have the same.
 * @param {string} tag @param {string} key
 */
const isBox = (tag, key) => key === 'margin' || key.startsWith('box-') || (tag === 'mj-column' && key === 'padding');

/**
 * The email as a computer shows it and as a phone does, or null when no
 * element has a phone value.
 * @param {string} source
 * @returns {{desktop: string, mobile: string, breakpoint: number}|null}
 */
export function splitDevices(source) {
  if (!/\smobile-[a-z-]+\s*=/.test(source)) return null;
  const root = parseMjml(source);
  /** @type {[import('../engine/model.js').EmailNode, Record<string, string>][]} */
  const phones = [];
  walk(root, (node) => {
    const overrides = mobileOverrides(node.attributes);
    if (!overrides.size) return;
    const own = withoutMobile(node.attributes);
    for (const key of overrides) {
      if (isBox(node.tag, key) && !Object.keys(own).some((name) => attributeOf(name) === key)) own[key] = key.includes('border') ? 'none' : '0px';
    }
    phones.push([node, withMobile({ ...node.attributes, ...own })]);
    node.attributes = own;
  });
  const desktop = serializeMjml(root);
  for (const [node, attributes] of phones) node.attributes = attributes;
  const width = Number.parseFloat(findFirst(root, 'mj-breakpoint')?.attributes.width || '') || 480;
  return { desktop, mobile: serializeMjml(root), breakpoint: width };
}

const TAGS = /<!--[\s\S]*?-->|<([a-z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** @param {string} attributes @param {string} name */
const attribute = (attributes, name) => new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(attributes)?.[1];

/** An attribute's text as the stylesheet must have it (`&quot;Arial&quot;` → `"Arial"`). @param {string} value */
const decoded = (value) =>
  value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/**
 * The phone's styles leave the cells for a stylesheet: nothing in them may
 * close a rule, open another or reach a script.
 * @param {string} property @param {string} value
 */
const safe = (property, value) => /^-?[a-z][a-z-]*$/.test(property) && !/[{}<>@\\]|expression\s*\(|javascript:|behavior\s*:/i.test(value);

/** `a:1;b:2` → {a: '1', b: '2'}, with the sizing attributes of old HTML as the styles they are. @param {string} attributes */
function stylesOf(attributes) {
  /** @type {Map<string, string>} */
  const styles = new Map();
  for (const [name, property] of [['width', 'width'], ['height', 'height'], ['bgcolor', 'background-color']]) {
    const value = attribute(attributes, name);
    if (value) styles.set(property, /^\d+(?:\.\d+)?$/.test(value) ? `${value}px` : decoded(value));
  }
  for (const declaration of decoded(attribute(attributes, 'style') || '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon > 0) styles.set(declaration.slice(0, colon).trim().toLowerCase(), declaration.slice(colon + 1).trim());
  }
  for (const [property, value] of styles) {
    if (!safe(property, value)) styles.delete(property);
  }
  return styles;
}

/** @param {string} html */
function tagsOf(html) {
  return [...html.matchAll(TAGS)].filter((match) => match[1]).map((match) => ({ index: /** @type {number} */ (match.index), text: match[0], name: match[1].toLowerCase(), attributes: match[2] }));
}

/**
 * The computer's HTML, its tags that look different on a phone marked, and the
 * phone's styles for them under the breakpoint.
 * @param {string} desktop @param {string} mobile @param {number} breakpoint
 */
export function mergeDevices(desktop, mobile, breakpoint) {
  const computer = tagsOf(desktop);
  const phone = tagsOf(mobile);
  if (computer.length !== phone.length || computer.some((tag, index) => tag.name !== phone[index].name)) return desktop;
  const rules = [];
  let html = desktop;
  for (let index = computer.length - 1; index >= 0; index -= 1) {
    const tag = computer[index];
    if (tag.attributes === phone[index].attributes) continue;
    const before = stylesOf(tag.attributes);
    const after = stylesOf(phone[index].attributes);
    const declarations = [...after].filter(([property, value]) => before.get(property) !== value).map(([property, value]) => `${property}:${value}!important`);
    for (const property of before.keys()) if (!after.has(property)) declarations.push(`${property}:initial!important`);
    const name = `eb-m${index}`;
    // An alignment is an attribute of the cell: its text, and the table in it (a button, a picture).
    const align = attribute(phone[index].attributes, 'align');
    if (align && align !== attribute(tag.attributes, 'align') && /^(?:left|center|right)$/.test(align)) {
      declarations.push(`text-align:${align}!important`);
      rules.unshift(`.${name}>table{margin-left:${align === 'left' ? '0' : 'auto'}!important;margin-right:${align === 'right' ? '0' : 'auto'}!important}`);
    }
    if (!declarations.length) continue;
    const marked = /\sclass="/i.test(tag.text) ? tag.text.replace(/(\sclass=")/i, `$1${name} `) : tag.text.replace(/^(<[a-z][\w:-]*)/i, `$1 class="${name}"`);
    html = html.slice(0, tag.index) + marked + html.slice(tag.index + tag.text.length);
    rules.unshift(`.${name}{${declarations.join(';')}}`);
  }
  if (!rules.length) return desktop;
  const style = `<style type="text/css">@media only screen and (max-width:${breakpoint - 1}px){${rules.join('')}}</style>`;
  return html.includes('</head>') ? html.replace('</head>', `${style}</head>`) : style + html;
}
