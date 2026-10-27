// @ts-check
/**
 * CUSTOM VARIABLES — created by users in the builder, shared by every template.
 *
 * A custom variable can never take a key of the system variables (the
 * `variables` option of the handler). Users may still edit a system
 * variable's name, group, sample and value if empty: the edit is stored in the
 * same repository under its key (`update` inserts it the first time), laid over
 * the application's by `catalog()`, and removed — back to the application's —
 * by `remove`. Its tag stays the application's. A key never changes after
 * creation: templates contain it.
 *
 * Storage is a REPOSITORY supplied by the application;
 * `createMemoryVariableRepository` is the reference implementation.
 */

import { identity } from '../i18n/index.js';
import { DEFAULT_VARIABLES, mergeVariables, validateCustomVariable, validateVariableEdit } from '../features/variables/catalog.js';
import { HttpError } from './errors.js';

/**
 * @typedef {import('../features/variables/catalog.js').EmailVariable} EmailVariable
 *
 * @typedef {{
 *   list: () => Promise<EmailVariable[]>,
 *   insert: (variable: EmailVariable & {createdBy: string|null}) => Promise<void>,
 *   update: (key: string, variable: EmailVariable & {updatedBy: string|null}) => Promise<boolean>,
 *   remove: (key: string) => Promise<boolean>,
 *   listGroups?: () => Promise<string[]>,
 *   insertGroup?: (name: string) => Promise<boolean>,
 *   renameGroup?: (from: string, to: string) => Promise<boolean>,
 *   removeGroup?: (name: string) => Promise<void>,
 * }} VariableRepository
 */

const actorName = (user) => (user ? String(user.name ?? user.id ?? '') || null : null);

/** Public shape (no audit fields). @param {any} row @param {boolean} custom @returns {EmailVariable} */
const toVariable = (row, custom) => ({
  key: row.key,
  label: row.label,
  group: row.group,
  sample: row.sample || '',
  fallback: row.fallback || '',
  description: row.description || '',
  ...(custom ? { custom: true } : {}),
});

/**
 * @param {{
 *   repository?: VariableRepository|null,
 *   system?: EmailVariable[],
 *   t?: import('../i18n/index.js').Translate,
 * }} options
 */
export function createVariableService({ repository = null, system = DEFAULT_VARIABLES, t = identity }) {
  const requireRepository = () => {
    if (!repository) throw new HttpError(501, t('Custom variables are not configured'), 'NO_VARIABLE_STORE');
    return repository;
  };

  const systemKeys = new Set(system.map((v) => v.key));
  const editable = (/** @type {string} */ key) => system.find((v) => v.key === key) || null;

  const service = {
    async listGroups() {
      return [...new Set([...(await repository?.listGroups?.() || []), ...(await service.catalog()).map((variable) => variable.group)])];
    },
    /** @param {unknown} input */
    async createGroup(input) {
      const name = typeof input === 'string' ? input.trim() : '';
      if (!name || name.length > 40) throw new HttpError(400, t('Name is required'), 'INVALID_GROUP');
      const store = requireRepository();
      if (!store.insertGroup) throw new HttpError(501, t('Custom variables are not configured'), 'NO_GROUP_STORE');
      const existing = await service.listGroups();
      if (existing.some((group) => group.toLowerCase() === name.toLowerCase()) || !await store.insertGroup(name)) {
        throw new HttpError(409, t('This group already exists.'), 'DUPLICATE_GROUP');
      }
      return name;
    },
    /**
     * Renames a stored group, or stores `to` when `from` is not; its variables
     * are moved by the builder, one by one, as a drag moves them.
     * @param {string} from @param {unknown} input
     */
    async renameGroup(from, input) {
      const name = typeof input === 'string' ? input.trim() : '';
      if (!name || name.length > 40) throw new HttpError(400, t('Name is required'), 'INVALID_GROUP');
      const store = requireRepository();
      if (!store.renameGroup) throw new HttpError(501, t('Custom variables are not configured'), 'NO_GROUP_STORE');
      const others = (await service.listGroups()).filter((group) => group !== from);
      if (others.some((group) => group.toLowerCase() === name.toLowerCase()) || !await store.renameGroup(from, name)) {
        throw new HttpError(409, t('This group already exists.'), 'DUPLICATE_GROUP');
      }
      return name;
    },
    /** Forgets a stored group; the builder has moved its variables out first. @param {string} name */
    async removeGroup(name) {
      const store = requireRepository();
      if (!store.removeGroup) throw new HttpError(501, t('Custom variables are not configured'), 'NO_GROUP_STORE');
      await store.removeGroup(name);
      return { name };
    },
    /** Custom variables, and the edits of system ones (no `custom` flag). */
    async listCustom() {
      return repository ? (await repository.list()).map((row) => toVariable(row, !systemKeys.has(row.key))) : [];
    },

    /** System + custom: the catalog used for rendering. */
    async catalog() {
      return mergeVariables(system, await service.listCustom());
    },

    /** @param {any} input @param {any} [user] */
    async create(input, user = null) {
      const store = requireRepository();
      const existing = [...system, ...(await service.listCustom())];
      const { variable, errors } = validateCustomVariable(input, { existing, t });
      if (errors) throw Object.assign(new HttpError(400, Object.values(errors)[0], 'INVALID_VARIABLE'), { issues: errors });
      await store.insert({ ...variable, createdBy: actorName(user) });
      return variable;
    },

    /** @param {string} key @param {any} input @param {any} [user] */
    async update(key, input, user = null) {
      const store = requireRepository();
      const target = editable(key);
      if (target) {
        const current = (await service.listCustom()).find((v) => v.key === key);
        const { variable, errors } = validateVariableEdit(target, { ...current, ...input, key }, { t });
        if (errors) throw Object.assign(new HttpError(400, Object.values(errors)[0], 'INVALID_VARIABLE'), { issues: errors });
        if (!(await store.update(key, { ...variable, updatedBy: actorName(user) }))) {
          await store.insert({ ...variable, createdBy: actorName(user) });
        }
        return mergeVariables([target], [variable])[0];
      }
      const current = (await service.listCustom()).find((v) => v.key === key);
      if (!current) throw new HttpError(404, t('Variable not found'), 'NOT_FOUND');
      const { variable, errors } = validateCustomVariable({ ...current, ...input, key }, { editing: key, t });
      if (errors) throw Object.assign(new HttpError(400, Object.values(errors)[0], 'INVALID_VARIABLE'), { issues: errors });
      await store.update(key, { ...variable, updatedBy: actorName(user) });
      return variable;
    },

    /** @param {string} key */
    async remove(key) {
      if (!(await requireRepository().remove(key))) throw new HttpError(404, t('Variable not found'), 'NOT_FOUND');
      return { key };
    },
  };
  return service;
}

/** @returns {VariableRepository} */
export function createMemoryVariableRepository() {
  /** @type {Map<string, any>} */
  const rows = new Map();
  const groups = new Set();
  return {
    async listGroups() { return [...groups]; },
    async insertGroup(name) {
      if ([...groups].some((group) => group.toLowerCase() === name.toLowerCase())) return false;
      groups.add(name);
      return true;
    },
    async renameGroup(from, to) {
      if ([...groups].some((group) => group !== from && group.toLowerCase() === to.toLowerCase())) return false;
      // In its place: the panel keeps its order.
      const renamed = groups.has(from) ? [...groups].map((group) => (group === from ? to : group)) : [...groups, to];
      groups.clear();
      for (const group of renamed) groups.add(group);
      return true;
    },
    async removeGroup(name) {
      groups.delete(name);
    },
    async list() {
      return [...rows.values()].map((row) => ({ ...row })).sort((a, b) => a.label.localeCompare(b.label));
    },
    async insert(variable) {
      if (rows.has(variable.key)) throw new Error('duplicate variable');
      rows.set(variable.key, { ...variable, createdAt: new Date() });
    },
    async update(key, variable) {
      if (!rows.has(key)) return false;
      rows.set(key, { ...rows.get(key), ...variable, key, updatedAt: new Date() });
      return true;
    },
    async remove(key) {
      return rows.delete(key);
    },
  };
}
