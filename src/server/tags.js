// @ts-check
/**
 * TAGS — the workspace's colored labels, at most three on a template, shared
 * by every user like the custom variables. The rules: features/tags/tags.js.
 *
 * Storage is a REPOSITORY supplied by the application, apart from the
 * templates' own: a table of tags and a table of links (template, tag).
 * `createMemoryTagRepository` is the reference implementation.
 */

import { identity } from '../i18n/index.js';
import { MAX_TAGS, checkTemplateTags, sortTags, validateTag } from '../features/tags/tags.js';
import { HttpError } from './errors.js';

/**
 * @typedef {import('../features/tags/tags.js').TemplateTag} TemplateTag
 *
 * `insert` gives the tag its id. `remove` removes the tag's links too, and
 * `setLinks` replaces all the links of one template.
 *
 * @typedef {{
 *   list: () => Promise<TemplateTag[]>,
 *   insert: (tag: {label: string, color: string, createdBy: string|null}) => Promise<TemplateTag>,
 *   update: (id: string, tag: {label: string, color: string, updatedBy: string|null}) => Promise<boolean>,
 *   remove: (id: string) => Promise<boolean>,
 *   listLinks: () => Promise<{templateId: string, tagId: string}[]>,
 *   setLinks: (templateId: string, tagIds: string[]) => Promise<void>,
 * }} TagRepository
 */

const actorName = (user) => (user ? String(user.name ?? user.id ?? '') || null : null);

/** Public shape (no audit fields). @param {any} row @returns {TemplateTag} */
const toTag = (row) => ({ id: String(row.id), label: row.label, color: row.color });

/**
 * @param {{repository?: TagRepository|null, t?: import('../i18n/index.js').Translate}} options
 */
export function createTagService({ repository = null, t = identity }) {
  const requireRepository = () => {
    if (!repository) throw new HttpError(501, t('Tags are not configured'), 'NO_TAG_STORE');
    return repository;
  };
  const invalid = (errors) => Object.assign(new HttpError(400, Object.values(errors)[0], 'INVALID_TAG'), { issues: errors });

  /** templateId → its tag ids, in the list's order. */
  async function links() {
    const [tags, pairs] = await Promise.all([service.list(), requireRepository().listLinks()]);
    const order = new Map(tags.map((tag, index) => [tag.id, index]));
    /** @type {Map<string, string[]>} */
    const byTemplate = new Map();
    for (const { templateId, tagId } of pairs) {
      if (!order.has(String(tagId))) continue;
      const ids = byTemplate.get(String(templateId)) || [];
      byTemplate.set(String(templateId), [...ids, String(tagId)]);
    }
    for (const ids of byTemplate.values()) ids.sort((a, b) => Number(order.get(a)) - Number(order.get(b)));
    return byTemplate;
  }

  const service = {
    enabled: Boolean(repository),

    /** The tags, by name. */
    async list() {
      return repository ? sortTags((await repository.list()).map(toTag)) : [];
    },

    /** @param {any} input @param {any} [user] */
    async create(input, user = null) {
      const store = requireRepository();
      const existing = await service.list();
      if (existing.length >= MAX_TAGS) throw new HttpError(400, t('{max} tags at most', { max: MAX_TAGS }), 'TOO_MANY_TAGS');
      const { tag, errors } = validateTag(input, { existing, t });
      if (errors) throw invalid(errors);
      return toTag(await store.insert({ ...tag, createdBy: actorName(user) }));
    },

    /** @param {string} id @param {any} input @param {any} [user] */
    async update(id, input, user = null) {
      const store = requireRepository();
      const existing = await service.list();
      const current = existing.find((tag) => tag.id === String(id));
      if (!current) throw new HttpError(404, t('Tag not found'), 'NOT_FOUND');
      const { tag, errors } = validateTag({ ...current, ...input }, { existing, editing: current.id, t });
      if (errors) throw invalid(errors);
      if (!(await store.update(current.id, { ...tag, updatedBy: actorName(user) }))) {
        throw new HttpError(404, t('Tag not found'), 'NOT_FOUND');
      }
      return { id: current.id, ...tag };
    },

    /** @param {string} id */
    async remove(id) {
      if (!(await requireRepository().remove(String(id)))) throw new HttpError(404, t('Tag not found'), 'NOT_FOUND');
      return { id: String(id) };
    },

    /**
     * Templates (API objects) with their tag ids — unchanged without a repository.
     * @template {{id: string|number}} T
     * @param {T[]} templates
     * @returns {Promise<(T & {tags?: string[]})[]>}
     */
    async decorate(templates) {
      if (!repository) return templates;
      const byTemplate = await links();
      return templates.map((template) => ({ ...template, tags: byTemplate.get(String(template.id)) || [] }));
    },

    /** @param {string|number} templateId @param {unknown} tagIds */
    async setTemplateTags(templateId, tagIds) {
      const store = requireRepository();
      const { ids, error } = checkTemplateTags(tagIds, await service.list(), { t });
      if (error) throw new HttpError(400, error.message, error.code);
      await store.setLinks(String(templateId), ids);
      return ids;
    },

    /** A deleted template's links. @param {string|number} templateId */
    async forget(templateId) {
      if (repository) await repository.setLinks(String(templateId), []);
    },
  };
  return service;
}

/** @returns {TagRepository} */
export function createMemoryTagRepository() {
  /** @type {Map<string, any>} */
  const rows = new Map();
  /** @type {Map<string, string[]>} */
  const links = new Map();
  let nextId = 1;
  return {
    async list() {
      return [...rows.values()].map((row) => ({ ...row }));
    },
    async insert(tag) {
      const row = { ...tag, id: String(nextId++), createdAt: new Date() };
      rows.set(row.id, row);
      return { ...row };
    },
    async update(id, tag) {
      if (!rows.has(id)) return false;
      rows.set(id, { ...rows.get(id), ...tag, id, updatedAt: new Date() });
      return true;
    },
    async remove(id) {
      if (!rows.delete(id)) return false;
      for (const [templateId, ids] of links) links.set(templateId, ids.filter((tagId) => tagId !== id));
      return true;
    },
    async listLinks() {
      return [...links].flatMap(([templateId, ids]) => ids.map((tagId) => ({ templateId, tagId })));
    },
    async setLinks(templateId, tagIds) {
      if (tagIds.length) links.set(templateId, [...tagIds]);
      else links.delete(templateId);
    },
  };
}
