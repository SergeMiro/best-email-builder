// @ts-check
/**
 * What a PROJECT (the editor's project data) may contain.
 *
 * The project is reloaded as-is into the editor canvas — an iframe of the host
 * page. It does NOT go through the editor engine's HTML parser (which drops
 * scripts and `on*` attributes): it is already structured data. The check must
 * therefore happen here, on save; otherwise a tampered project would run code
 * in the browser of the next user who opens it.
 *
 * The walk is generic (any object, any array) rather than modelled on the
 * engine's format: with another engine or another version, the rule still
 * holds.
 */

import { readDocument } from '../core/document.js';
import { identity } from '../i18n/index.js';
import { IMAGE_ATTRIBUTES, LINK_ATTRIBUTES, isSafeUrl } from './urls.js';

/** Maximum size of a project's JSON. */
export const PROJECT_MAX_LENGTH = 2 * 1024 * 1024;

const MAX_DEPTH = 200;
/** Forbidden HTML/MJML tags (a component's `tagName`). */
const DANGEROUS_TAGS = /^(script|iframe|frame|object|embed|form|base|link|meta|svg|math|mj-include|mj-raw)$/i;
/**
 * Forbidden component types (`type`). Shorter list than the tags: for the
 * engine, `link` is the type of an `<a>` link — unrelated to the `<link>` tag
 * (external style sheet), which is still rejected through its `tagName`.
 */
const DANGEROUS_TYPES = /^(script|iframe|frame|object|embed|form|svg|mj-include|mj-raw)$/i;

/**
 * @typedef {import('./mjmlValidator.js').ValidationIssue} ValidationIssue
 */

/**
 * @param {unknown} raw  envelope (object or JSON string)
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 * @returns {{ok: boolean, issues: ValidationIssue[], document: import('../core/document.js').EmailDocument|null, json: string}}
 */
export function validateProject(raw, { t = identity } = {}) {
  /** @type {ValidationIssue[]} */
  const issues = [];
  let document;
  try {
    document = readDocument(raw);
  } catch (error) {
    return {
      ok: false,
      issues: [{ code: 'ENVELOPE', message: /** @type {Error} */ (error).message }],
      document: null,
      json: '',
    };
  }

  const json = JSON.stringify(document);
  if (json.length > PROJECT_MAX_LENGTH) {
    issues.push({
      code: 'TOO_LARGE',
      message: t('project too large ({size} KB, maximum {max} KB)', {
        size: Math.round(json.length / 1024),
        max: PROJECT_MAX_LENGTH / 1024,
      }),
    });
  }

  /** @param {any} node @param {number} depth */
  function walk(node, depth) {
    if (depth > MAX_DEPTH) {
      issues.push({ code: 'TOO_DEEP', message: t('project too deep') });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (!node || typeof node !== 'object') return;

    // `tag`: the builder's own project; `type` / `tagName`: projects of other engines.
    for (const [key, pattern] of /** @type {[string, RegExp][]} */ ([['type', DANGEROUS_TYPES], ['tagName', DANGEROUS_TAGS], ['tag', DANGEROUS_TAGS]])) {
      const value = node[key];
      if (typeof value === 'string' && pattern.test(value)) {
        issues.push({ code: 'FORBIDDEN_TAG', message: t('forbidden element in project: {tag}', { tag: value }), tag: value });
      }
    }
    for (const key of ['script', 'script-export', 'script-props']) {
      const value = node[key];
      if (value && (typeof value !== 'object' || Object.keys(value).length > 0)) {
        issues.push({ code: 'SCRIPT', message: t('component script not allowed') });
      }
    }
    for (const key of ['content', 'components']) {
      const value = node[key];
      if (typeof value === 'string' && /<\s*(script|iframe|object|embed)\b|javascript:/i.test(value)) {
        issues.push({ code: 'UNSAFE_CONTENT', message: t('executable content not allowed') });
      }
    }
    const attributes = node.attributes;
    if (attributes && typeof attributes === 'object' && !Array.isArray(attributes)) {
      for (const [name, value] of Object.entries(attributes)) {
        const lower = name.toLowerCase();
        if (lower.startsWith('on')) {
          issues.push({ code: 'EVENT_ATTRIBUTE', message: t('attribute {name} not allowed', { name }), attribute: name });
        } else if (LINK_ATTRIBUTES.has(lower) && !isSafeUrl(String(value ?? ''), 'link')) {
          issues.push({ code: 'UNSAFE_URL', message: t('URL rejected ({name})', { name }), attribute: name });
        } else if (IMAGE_ATTRIBUTES.has(lower) && !isSafeUrl(String(value ?? ''), 'image')) {
          issues.push({ code: 'UNSAFE_IMAGE', message: t('image rejected ({name})', { name }), attribute: name });
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== 'attributes' && value && typeof value === 'object') walk(value, depth + 1);
    }
  }

  walk(document.project, 0);
  return { ok: issues.length === 0, issues, document, json };
}

/**
 * Validates and throws a readable 422 error listing the first rejections.
 * @param {unknown} raw
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 */
export function assertValidProject(raw, { t = identity } = {}) {
  const result = validateProject(raw, { t });
  if (result.ok && result.document) return { document: result.document, json: result.json };
  const shown = result.issues.slice(0, 3).map((i) => i.message).join('; ');
  const error = /** @type {Error & {status?: number, issues?: ValidationIssue[]}} */ (
    new Error(t('Project rejected: {issues}', { issues: shown }))
  );
  error.status = 422;
  error.issues = result.issues;
  throw error;
}
