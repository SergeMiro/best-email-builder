// @ts-check
/**
 * Generic registry — used for blocks (`emailBlocks`) and features
 * (`emailBuilderFeatures`).
 *
 * Removing an entry from the registry is enough to remove it from the builder:
 * neither the core nor the adapter knows a block or feature by name. That is
 * what lets a piece be disabled without touching anything else.
 */

/**
 * @template {{id: string, order?: number}} T
 * @typedef {{
 *   kind: string,
 *   register: (item: T) => () => void,
 *   unregister: (id: string) => boolean,
 *   get: (id: string) => T | undefined,
 *   has: (id: string) => boolean,
 *   list: (filter?: (item: T) => boolean) => T[],
 *   ids: () => string[],
 * }} Registry
 */

const ID_SHAPE = /^[a-z][a-z0-9-]*$/;

/**
 * @template {{id: string, order?: number}} T
 * @param {string} kind  registry name, for error messages
 * @param {T[]} [initial]
 * @returns {Registry<T>}
 */
export function createRegistry(kind, initial = []) {
  /** @type {Map<string, T>} */
  const items = new Map();

  /** @param {string} id */
  function unregister(id) {
    return items.delete(id);
  }

  /** @param {T} item */
  function register(item) {
    if (!item || typeof item.id !== 'string' || !ID_SHAPE.test(item.id)) {
      throw new Error(`${kind}: invalid id ("${item?.id}")`);
    }
    if (items.has(item.id)) {
      throw new Error(`${kind}: "${item.id}" is already registered`);
    }
    items.set(item.id, item);
    return () => {
      unregister(item.id);
    };
  }

  initial.forEach(register);

  return {
    kind,
    register,
    unregister,
    get: (id) => items.get(id),
    has: (id) => items.has(id),
    // Stable sort: `order` first, then registration order.
    list: (filter) =>
      [...items.values()]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (a.item.order ?? 1000) - (b.item.order ?? 1000) || a.index - b.index)
        .map(({ item }) => item)
        .filter((item) => (filter ? filter(item) : true)),
    ids: () => [...items.keys()],
  };
}
