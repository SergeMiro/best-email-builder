// @ts-check
/**
 * TAGS — colored labels on templates, to sort a library at a glance.
 *
 * The workspace keeps one list of tags, shared by every user like the custom
 * variables; a template carries at most `MAX_TEMPLATE_TAGS` of them, by id.
 * A tag's name is unique (case aside) and its color is one of `TAG_COLORS`,
 * so every tag reads well in the light and the dark theme.
 *
 * The same rules run in the browser (the tags dialog, the memory storage) and
 * on the server (`best-email-builder/server`).
 */

import { identity } from '../../i18n/index.js';

/** @typedef {{id: string, label: string, color: string}} TemplateTag */

export const MAX_TEMPLATE_TAGS = 3;
/** Tags in a workspace. */
export const MAX_TAGS = 100;
export const TAG_LIMITS = { label: 24 };
export const TAG_COLORS = ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];

const sameName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/**
 * @param {any} input  `{label, color}`
 * @param {{existing?: TemplateTag[], editing?: string|null, t?: import('../../i18n/index.js').Translate}} [options]
 *   `editing`: the id of the tag being edited (its own name is not a duplicate)
 * @returns {{tag: {label: string, color: string}, errors?: undefined} | {tag?: undefined, errors: Record<string, string>}}
 */
export function validateTag(input, { existing = [], editing = null, t = identity } = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const label = String(input?.label ?? '').replace(/\s+/g, ' ').trim();
  const color = String(input?.color ?? '');
  if (!label) errors.label = t('Name is required');
  else if (label.length > TAG_LIMITS.label) errors.label = t('{max} characters at most', { max: TAG_LIMITS.label });
  else if (existing.some((tag) => String(tag.id) !== String(editing) && sameName(tag.label, label))) {
    errors.label = t('A tag with this name already exists');
  }
  if (!TAG_COLORS.includes(color)) errors.color = t('Choose a color');
  if (Object.keys(errors).length) return { errors };
  return { tag: { label, color } };
}

/**
 * The tags a template may carry: known ids, each once, `MAX_TEMPLATE_TAGS`
 * at most, in the list's order.
 *
 * @param {unknown} ids
 * @param {TemplateTag[]} catalog
 * @param {{t?: import('../../i18n/index.js').Translate}} [options]
 * @returns {{ids: string[], error?: undefined} | {ids?: undefined, error: {code: string, message: string}}}
 */
export function checkTemplateTags(ids, catalog, { t = identity } = {}) {
  if (!Array.isArray(ids)) return { error: { code: 'INVALID_TAGS', message: t('A list of tags is expected') } };
  const wanted = new Set(ids.map(String));
  if (wanted.size > MAX_TEMPLATE_TAGS) {
    return { error: { code: 'TOO_MANY_TAGS', message: t('{max} tags at most per template', { max: MAX_TEMPLATE_TAGS }) } };
  }
  const known = new Set(catalog.map((tag) => String(tag.id)));
  if ([...wanted].some((id) => !known.has(id))) return { error: { code: 'UNKNOWN_TAG', message: t('Tag not found') } };
  return { ids: catalog.map((tag) => String(tag.id)).filter((id) => wanted.has(id)) };
}

/** The list's order: by name. @param {TemplateTag[]} tags */
export const sortTags = (tags) => [...tags].sort((a, b) => a.label.localeCompare(b.label));
