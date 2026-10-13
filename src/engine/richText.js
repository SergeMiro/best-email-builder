// @ts-check
/**
 * RICH TEXT — what a text typed in the canvas may keep.
 *
 * The canvas edits text with the browser's own editing (contenteditable):
 * it can produce, or receive by paste, anything. Before it enters the model
 * the HTML is reduced to what an email and the server's validator accept:
 * the formatting tags of `INLINE_TAGS`, a few harmless attributes, safe
 * links. Other tags are unwrapped (their text stays), scripts and styles are
 * dropped with their content.
 *
 * Needs a DOM (the canvas frame's document).
 */

import { INLINE_TAGS } from '../validation/mjmlValidator.js';
import { isSafeUrl } from '../validation/urls.js';

const DROPPED_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'head', 'title', 'meta', 'link']);

/** Attributes kept, per tag (`*`: every allowed tag). */
const KEPT_ATTRIBUTES = {
  '*': new Set(['style']),
  a: new Set(['href', 'target', 'title', 'rel']),
  font: new Set(['color', 'face', 'size']),
};

/** CSS properties kept in a `style` attribute (formatting only, no layout tricks). */
const KEPT_STYLES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'font-size',
  'font-family',
  'text-decoration',
  'text-align',
  'line-height',
  'letter-spacing',
]);

/** @param {string} style */
function cleanStyle(style) {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      if (colon === -1) return null;
      const name = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim();
      if (!KEPT_STYLES.has(name) || /expression|url\s*\(|javascript:/i.test(value)) return null;
      return `${name}:${value}`;
    })
    .filter(Boolean)
    .join(';');
}

/**
 * @param {Element} element
 */
function cleanAttributes(element) {
  const tag = element.tagName.toLowerCase();
  const own = /** @type {Record<string, Set<string>>} */ (KEPT_ATTRIBUTES)[tag];
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (!KEPT_ATTRIBUTES['*'].has(name) && !(own && own.has(name))) {
      element.removeAttribute(attribute.name);
      continue;
    }
    if (name === 'href' && !isSafeUrl(attribute.value, 'link')) element.removeAttribute(attribute.name);
    if (name === 'style') {
      const style = cleanStyle(attribute.value);
      if (style) element.setAttribute('style', style);
      else element.removeAttribute('style');
    }
  }
  if (tag === 'a' && element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener');
}

/** @param {Node} node */
function cleanChildren(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 8) {
      child.remove(); // comment
      continue;
    }
    if (child.nodeType !== 1) continue;
    const element = /** @type {Element} */ (child);
    const tag = element.tagName.toLowerCase();
    if (DROPPED_WITH_CONTENT.has(tag)) {
      element.remove();
      continue;
    }
    cleanChildren(element);
    if (!INLINE_TAGS.has(tag)) {
      // Unknown tag: keep its text, drop the tag.
      element.replaceWith(...element.childNodes);
      continue;
    }
    cleanAttributes(element);
  }
}

/**
 * @param {string} html
 * @param {Document} document  any document (to parse without running anything)
 */
export function cleanRichText(html, document) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  cleanChildren(template.content);
  return template.innerHTML
    .replace(/<br>/g, '<br />')
    .replace(/(<br \/>)+$/, '')
    .trim();
}

/**
 * Plain text, escaped, for a label (button, menu link).
 * @param {string} text
 */
export function escapeText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The text of an HTML fragment (`<br>` as a space), entities decoded.
 * @param {string} html
 */
export function textOfHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}
