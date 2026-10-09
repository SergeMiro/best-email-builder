// @ts-check
/**
 * URLs accepted in an email template.
 *
 *   link   (`href`)                     https, http, mailto:, tel:, `#…` anchor,
 *                                       or a `{{ … }}` merge tag (unsubscribe,
 *                                       variable) replaced at render time;
 *   image  (`src`, `background-url`…)   https only: an http image is blocked or
 *                                       flagged by most email clients, and
 *                                       `data:` bloats the message until Gmail
 *                                       clips it. Or an UPLOADED image (asset
 *                                       path, see `isAssetPath`), made absolute
 *                                       at render time (renderer/links.js).
 *
 * Everything else (`javascript:`, `data:`, `vbscript:`, `file:`…) is rejected.
 * The scheme is read AFTER decoding entities and stripping whitespace and
 * control characters: `java&#x09;script:` and `&#106;avascript:` are classics.
 */
import { isAssetPath } from '../renderer/links.js';

/** Attributes carrying a LINK URL. */
export const LINK_ATTRIBUTES = new Set(['href', 'action', 'formaction', 'xlink:href']);

/** Attributes carrying an IMAGE URL (MJML and HTML). */
export const IMAGE_ATTRIBUTES = new Set([
  'src',
  'srcset',
  'background-url',
  'background',
  'poster',
  'icon-unwrapped-url',
  'icon-wrapped-url',
]);

const NAMED_ENTITIES = {
  colon: ':',
  tab: '\t',
  newline: '\n',
  lpar: '(',
  rpar: ')',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
};

/** Decodes the HTML entities of an attribute value. @param {string} value */
export function decodeEntities(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, body) => {
    const key = String(body).toLowerCase();
    if (key.startsWith('#x')) return String.fromCodePoint(Number.parseInt(key.slice(2), 16) || 0);
    if (key.startsWith('#')) return String.fromCodePoint(Number.parseInt(key.slice(1), 10) || 0);
    return NAMED_ENTITIES[key] ?? whole;
  });
}

/** A `{{ … }}` merge tag (variable, unsubscribe, web version). @param {string} value */
export function isMergeTag(value) {
  return /^\{\{\s*[a-zA-Z][\w.]*\s*\}\}$/.test(String(value || '').trim());
}

/**
 * @param {string} raw
 * @param {'link'|'image'} kind
 * @returns {boolean}
 */
export function isSafeUrl(raw, kind) {
  const value = decodeEntities(raw).trim();
  if (!value) return true;
  if (isMergeTag(value)) return true;
  // Scheme read without whitespace or control characters ("java\tscript:").
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is stripped
  const compact = value.replace(/[\s\u0000-\u001f\u007f]+/g, '').toLowerCase();
  if (kind === 'image') return compact.startsWith('https://') || isAssetPath(value);
  if (compact.startsWith('#')) return true;
  return /^(https?:\/\/|mailto:|tel:)/.test(compact);
}
