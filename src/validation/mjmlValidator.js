// @ts-check
/**
 * What an MJML document may contain before the server compiles it.
 *
 * The MJML comes from the browser (editor export). The server does not take it
 * at face value: it compiles it, stores it and will send it to recipients.
 * Three families of rejection:
 *
 *   1. tags that would take the template out of bounds: `mj-include` (would
 *      read a server FILE at compile time), `mj-raw` (free HTML, without any of
 *      MJML's guarantees), `mj-style` / `mj-font` (external CSS and fonts,
 *      outside the builder's scope);
 *   2. anything that executes or embeds: `<script>`, `<iframe>`, `<object>`,
 *      `<form>`, `on*` attributes, CSS `expression()`;
 *   3. dangerous URLs (see `urls.js`).
 *
 * Only tags from two closed lists pass: the MJML components produced by the
 * blocks, and the formatting HTML written by the rich text editor inside an
 * `mj-text` or `mj-button`.
 *
 * Dependency-free module (no parser): it can be tested outside a browser, and
 * runs before compilation, which alone truly parses the MJML.
 */

import { identity } from '../i18n/index.js';
import { IMAGE_ATTRIBUTES, LINK_ATTRIBUTES, decodeEntities, isSafeUrl } from './urls.js';

/** Maximum MJML size (UTF-16 units, approximated by the string length). */
export const MJML_MAX_LENGTH = 512 * 1024;

/** Accepted MJML components. */
export const MJML_TAGS = new Set([
  'mjml',
  'mj-head',
  'mj-body',
  'mj-attributes',
  'mj-all',
  'mj-class',
  'mj-preview',
  'mj-title',
  'mj-breakpoint',
  'mj-wrapper',
  'mj-section',
  'mj-group',
  'mj-column',
  'mj-text',
  'mj-image',
  'mj-button',
  'mj-divider',
  'mj-spacer',
  'mj-table',
  'mj-social',
  'mj-social-element',
  'mj-navbar',
  'mj-navbar-link',
  'mj-hero',
]);

/** Formatting HTML accepted inside a text or a button. */
export const INLINE_TAGS = new Set([
  'a',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'strike',
  'del',
  'br',
  'span',
  'p',
  'div',
  'font',
  'sup',
  'sub',
  'small',
  'big',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'hr',
  'img',
  'table',
  'tbody',
  'thead',
  'tr',
  'td',
  'th',
]);

/**
 * Tags rejected by name (explicit message rather than "tag not allowed").
 * Values are English message templates, translated when the issue is built.
 */
const FORBIDDEN_TAGS = new Map([
  ['mj-include', 'mj-include would read a file from the server'],
  ['mj-raw', 'mj-raw (free HTML) is not allowed'],
  ['mj-style', 'mj-style (free CSS) is outside the builder'],
  ['mj-font', 'mj-font (external font) is outside the builder'],
  ['script', 'script not allowed'],
  ['iframe', 'iframe not allowed'],
  ['frame', 'frame not allowed'],
  ['object', 'object not allowed'],
  ['embed', 'embed not allowed'],
  ['form', 'form not allowed'],
  ['input', 'form field not allowed'],
  ['button', 'HTML button not allowed (use the Button block)'],
  ['textarea', 'form field not allowed'],
  ['select', 'form field not allowed'],
  ['style', 'style sheet not allowed'],
  ['link', 'external resource not allowed'],
  ['meta', 'meta tag not allowed'],
  ['base', 'base tag not allowed'],
  ['svg', 'SVG not allowed'],
  ['math', 'MathML not allowed'],
]);

/**
 * @typedef {{code: string, message: string, tag?: string, attribute?: string}} ValidationIssue
 */

const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*)>/g;
const ATTR_RE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** @param {string} source */
function* attributesOf(source) {
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(source))) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    yield { name: match[1].toLowerCase(), value };
  }
}

/**
 * Inline style check: no `expression()`, no non-https `url()`.
 * @param {string} style
 */
function styleIsSafe(style) {
  const css = decodeEntities(style).toLowerCase().replace(/\s+/g, '');
  if (css.includes('expression(') || css.includes('javascript:') || css.includes('behavior:')) return false;
  const urls = css.match(/url\(([^)]*)\)/g) || [];
  return urls.every((u) => isSafeUrl(u.slice(4, -1).replace(/^['"]|['"]$/g, ''), 'image'));
}

/**
 * Validates an MJML document. Does not throw: returns the list of issues.
 *
 * @param {string} mjml
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 * @returns {{ok: boolean, issues: ValidationIssue[]}}
 */
export function validateMjml(mjml, { t = identity } = {}) {
  /** @type {ValidationIssue[]} */
  const issues = [];
  const source = typeof mjml === 'string' ? mjml : '';

  if (!source.trim()) {
    return { ok: false, issues: [{ code: 'EMPTY', message: t('Empty MJML') }] };
  }
  if (source.length > MJML_MAX_LENGTH) {
    issues.push({
      code: 'TOO_LARGE',
      message: t('MJML too large ({size} KB, maximum {max} KB)', {
        size: Math.round(source.length / 1024),
        max: MJML_MAX_LENGTH / 1024,
      }),
    });
  }

  // Comments are not parsed as tags, but an Outlook conditional comment
  // (`<!--[if mso]>`) has no business in MJML written by the builder.
  const withoutComments = source.replace(/<!--([\s\S]*?)-->/g, (whole, body) => {
    if (/\[if\s/i.test(body)) {
      issues.push({ code: 'CONDITIONAL_COMMENT', message: t('conditional comment not allowed') });
    }
    return '';
  });
  if (/<!\[CDATA\[/i.test(withoutComments)) {
    issues.push({ code: 'CDATA', message: t('CDATA section not allowed') });
  }

  const trimmed = withoutComments.trim();
  if (!/^<mjml[\s>]/i.test(trimmed)) {
    issues.push({ code: 'ROOT', message: t('the document must start with <mjml>') });
  }
  if (!/<mj-body[\s>]/i.test(trimmed)) {
    issues.push({ code: 'BODY', message: t('missing <mj-body>') });
  }

  TAG_RE.lastIndex = 0;
  let match;
  while ((match = TAG_RE.exec(withoutComments))) {
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      const template = FORBIDDEN_TAGS.get(tag);
      issues.push({ code: 'FORBIDDEN_TAG', message: template ? t(template) : tag, tag });
      continue;
    }
    if (!MJML_TAGS.has(tag) && !INLINE_TAGS.has(tag)) {
      issues.push({ code: 'UNKNOWN_TAG', message: t('tag not allowed: <{tag}>', { tag }), tag });
      continue;
    }
    if (closing) continue;

    for (const { name, value } of attributesOf(match[3])) {
      if (name.startsWith('on')) {
        issues.push({
          code: 'EVENT_ATTRIBUTE',
          message: t('attribute {name} not allowed', { name }),
          tag,
          attribute: name,
        });
      } else if (LINK_ATTRIBUTES.has(name) && !isSafeUrl(value, 'link')) {
        issues.push({ code: 'UNSAFE_URL', message: t('URL rejected ({name})', { name }), tag, attribute: name });
      } else if (IMAGE_ATTRIBUTES.has(name) && !isSafeUrl(value, 'image')) {
        issues.push({
          code: 'UNSAFE_IMAGE',
          message: t('image rejected ({name}): https only', { name }),
          tag,
          attribute: name,
        });
      } else if (name === 'style' && !styleIsSafe(value)) {
        issues.push({ code: 'UNSAFE_STYLE', message: t('inline style rejected'), tag, attribute: name });
      }
    }
  }

  return { ok: issues.length === 0, issues };
}

/**
 * Validates and throws a readable 422 error listing the first rejections.
 * @param {string} mjml
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 */
export function assertValidMjml(mjml, { t = identity } = {}) {
  const { ok, issues } = validateMjml(mjml, { t });
  if (ok) return;
  const shown = issues.slice(0, 3).map((i) => i.message).join('; ');
  const more = issues.length - 3;
  const error = /** @type {Error & {status?: number, issues?: ValidationIssue[]}} */ (
    new Error(
      more > 0
        ? t('Template rejected: {issues} (+{more})', { issues: shown, more })
        : t('Template rejected: {issues}', { issues: shown })
    )
  );
  error.status = 422;
  error.issues = issues;
  throw error;
}
