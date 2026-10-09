// @ts-check
/**
 * Variables service — replaces merge tags in compiled HTML (or in a subject).
 *
 * Only the tags of the catalog are touched, in their `{{key}}` or
 * `{{key|fallback}}` form (spaces allowed): other tags (an email provider's own
 * merge tags, `{{ mirror }}`) are left intact.
 *
 * Values are escaped in HTML: a first name "<b>Jo</b>" is displayed as typed,
 * it makes nothing bold — and cannot inject anything.
 *
 * Missing value → the tag's inline fallback → the variable's `fallback` → ''.
 * A raw tag never reaches a recipient.
 *
 * The unsubscribe link is NOT replaced here: only the sending pipeline knows
 * the right link (see `applyServiceLinks`).
 */

import { DEFAULT_VARIABLES } from './catalog.js';

/** @typedef {import('./catalog.js').EmailVariable} EmailVariable */
/** @typedef {Record<string, string|number|null|undefined>} VariableValues */

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Undoes the escaping the editor applied to an inline fallback. */
function decodeHtml(text) {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `{{ key }}` or `{{ key | fallback }}`. @param {string} key */
function patternOf(key) {
  return new RegExp(`\\{\\{\\s*${escapeRegExp(key)}\\s*(?:\\|([^{}]*))?\\}\\}`, 'g');
}

/** Any `{{ … }}` tag that looks like a variable. */
const ANY_TAG = /\{\{\s*([A-Za-z][\w.]*)\s*(?:\|[^{}]*)?\}\}/g;

/** @param {EmailVariable[]} variables */
const textVariables = (variables) => variables.filter((v) => v.kind !== 'link');

const present = (value) => value !== null && value !== undefined && String(value) !== '';

/**
 * @param {string} text
 * @param {VariableValues} values
 * @param {EmailVariable[]} variables
 * @param {boolean} html
 */
function replace(text, values, variables, html) {
  let out = String(text || '');
  for (const variable of textVariables(variables)) {
    out = out.replace(patternOf(variable.key), (_, inline) => {
      const value = values?.[variable.key];
      if (present(value)) return html ? escapeHtml(value) : String(value);
      const fallback = inline !== undefined ? (html ? decodeHtml(inline) : inline).trim() : variable.fallback || '';
      return html ? escapeHtml(fallback) : fallback;
    });
  }
  return out;
}

/**
 * Replaces the known tags with values (escaped) in HTML.
 *
 * @param {string} html
 * @param {VariableValues} values
 * @param {EmailVariable[]} [variables]
 */
export function applyVariables(html, values, variables = DEFAULT_VARIABLES) {
  return replace(html, values, variables, true);
}

/**
 * Same as `applyVariables` for PLAIN TEXT (subject line, preview text): no
 * HTML escaping.
 *
 * @param {string} text
 * @param {VariableValues} values
 * @param {EmailVariable[]} [variables]
 */
export function applyVariablesToText(text, values, variables = DEFAULT_VARIABLES) {
  return replace(text, values, variables, false);
}

/**
 * Replaces the known tags with RAW replacements — typically the merge tags of
 * an email provider (`{ 'contact.firstname': '{{ contact.FIRSTNAME }}' }`).
 * A tag without replacement is left untouched.
 *
 * @param {string} html
 * @param {Record<string, string>} mapping
 * @param {EmailVariable[]} [variables]
 */
export function mapVariables(html, mapping, variables = DEFAULT_VARIABLES) {
  let out = String(html || '');
  for (const variable of textVariables(variables)) {
    if (!Object.prototype.hasOwnProperty.call(mapping, variable.key)) continue;
    out = out.replace(patternOf(variable.key), () => String(mapping[variable.key]));
  }
  return out;
}

/**
 * Catalog keys present in a text.
 * @param {string} text
 * @param {EmailVariable[]} [variables]
 */
export function usedVariables(text, variables = DEFAULT_VARIABLES) {
  const source = String(text || '');
  return variables.filter((v) => patternOf(v.key).test(source)).map((v) => v.key);
}

/**
 * Tags that look like variables but are not in the catalog (typos such as
 * `{{contact.fistname}}`). `ignore` lists tags handled elsewhere.
 *
 * @param {string} text
 * @param {EmailVariable[]} [variables]
 * @param {string[]} [ignore]
 */
export function unknownVariables(text, variables = DEFAULT_VARIABLES, ignore = ['unsubscribe', 'mirror']) {
  const known = new Set([...variables.map((v) => v.key), ...ignore]);
  const found = new Set();
  for (const match of String(text || '').matchAll(ANY_TAG)) {
    if (!known.has(match[1])) found.add(match[1]);
  }
  return [...found];
}

/**
 * Sample values (preview, test), with optional overrides
 * (e.g. `{ 'contact.email': 'reviewer@example.com' }`).
 *
 * @param {EmailVariable[]} [variables]
 * @param {VariableValues} [overrides]
 */
export function sampleValues(variables = DEFAULT_VARIABLES, overrides = {}) {
  /** @type {Record<string, string>} */
  const values = Object.fromEntries(textVariables(variables).map((v) => [v.key, v.sample]));
  for (const [key, value] of Object.entries(overrides)) {
    if (present(value)) values[key] = String(value);
  }
  return values;
}
