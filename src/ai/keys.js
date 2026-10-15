// @ts-check
/**
 * THE USER'S KEY — when the AI runs in the page with `askKey: true`, each
 * user connects their own provider key, once.
 *
 * The first AI action asks for it (the Connect dialog, `ConnectAi.jsx`); it is
 * kept in this browser (localStorage, one entry per provider) and sent only to
 * the provider. A key the provider refuses is forgotten, and asked again.
 * Given several providers, the user chooses one in the same dialog; the
 * choice is kept too.
 *
 *   ai.key.get(id?)      the key in use, or the one kept for that provider ('' when none)
 *   ai.key.set(key)      connect a key without the dialog
 *   ai.key.forget()      disconnect: the next AI action asks again
 *   ai.key.request()     ask the user now → the key, or '' when they cancel
 *   ai.key.choose(id)    use another of the providers (its kept key, if any)
 *   ai.key.subscribe(fn) called on every change; returns the unsubscribe
 *   ai.key.provider      the provider in use: name, model, where to get a key, what is free
 *   ai.key.providers     all those the user can choose from
 */

/** @typedef {import('./providers.js').AiProvider} AiProvider */

const STORAGE_PREFIX = 'best-email-builder:ai-key:';
const CHOICE_SLOT = 'best-email-builder:ai-provider';

/** localStorage when there is one that works (not in private modes that throw, not on the server). */
function browserStorage() {
  try {
    const storage = globalThis.localStorage;
    return storage && typeof storage.getItem === 'function' ? storage : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {Readonly<{id: string, name: string, model: string|null, keyUrl: string|null, keyHint: string, free: string|null}>} ProviderChoice
 * @typedef {{
 *   provider: ProviderChoice,
 *   providers: ReadonlyArray<ProviderChoice>,
 *   get: (id?: string) => string,
 *   set: (key: string) => void,
 *   forget: () => void,
 *   request: () => Promise<string>,
 *   choose: (id: string) => void,
 *   subscribe: (listener: () => void) => () => void,
 *   state: () => Readonly<{asking: boolean, refused: boolean, connected: boolean}>,
 *   answer: (key: string|null) => void,
 *   refuse: () => void,
 * }} AiKey
 *   `state`, `answer` and `refuse` serve the Connect dialog and the module:
 *   whether the user is being asked, whether the last key was refused.
 */

/** @param {AiProvider} provider @returns {ProviderChoice} */
const choiceOf = (provider) =>
  Object.freeze({
    id: provider.id,
    name: provider.name,
    model: provider.model ?? null,
    keyUrl: provider.keyUrl,
    keyHint: provider.keyHint,
    free: provider.free,
  });

/**
 * @param {AiProvider | AiProvider[]} providerOrList one provider, or those the user chooses from
 * @returns {AiKey}
 */
export function createKeyStore(providerOrList) {
  const providers = Object.freeze((Array.isArray(providerOrList) ? providerOrList : [providerOrList]).map(choiceOf));
  if (!providers.length) throw new TypeError('createKeyStore: at least one provider');
  const known = (/** @type {unknown} */ id) => providers.some((provider) => provider.id === id);
  /** Kept here too: a browser that does not store still works for the page's life. */
  const memory = new Map();
  let refused = false;
  /** @type {{promise: Promise<string>, resolve: (key: string) => void}|null} */
  let pending = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {ReturnType<AiKey['state']>} */
  let snapshot;

  /** @param {string} slot */
  const read = (slot) => {
    try {
      return browserStorage()?.getItem(slot) || '';
    } catch {
      return '';
    }
  };
  /** @param {string} slot @param {string} value */
  const write = (slot, value) => {
    try {
      const storage = browserStorage();
      if (value) storage?.setItem(slot, value);
      else storage?.removeItem(slot);
    } catch {
      // Full, or blocked: the key stays in memory.
    }
  };
  /** @param {string} id */
  const keyOf = (id) => (memory.has(id) ? memory.get(id) : read(STORAGE_PREFIX + id));
  /** @param {string} id @param {string} value */
  const keep = (id, value) => {
    memory.set(id, value);
    write(STORAGE_PREFIX + id, value);
  };
  // The provider chosen last time; else the first one with a key; else the first.
  const kept = read(CHOICE_SLOT);
  let current = known(kept) ? kept : (providers.find((provider) => keyOf(provider.id)) || providers[0]).id;
  /** @param {string} [id] */
  const get = (id) => keyOf(id === undefined ? current : String(id));
  const changed = () => {
    snapshot = Object.freeze({ asking: Boolean(pending), refused, connected: Boolean(get()) });
    for (const listener of [...listeners]) listener();
  };
  snapshot = Object.freeze({ asking: false, refused: false, connected: Boolean(get()) });

  /** @param {string} key */
  const answer = (key) => {
    const value = String(key || '').trim();
    if (value) {
      keep(current, value);
      refused = false;
    }
    const waiting = pending;
    pending = null;
    changed();
    waiting?.resolve(value);
  };

  return Object.freeze({
    get provider() {
      return /** @type {ProviderChoice} */ (providers.find((provider) => provider.id === current));
    },
    providers,
    get,
    set: (/** @type {string} */ key) => {
      if (typeof key !== 'string' || !key.trim()) throw new TypeError('ai.key.set: a non-empty key');
      answer(key);
    },
    forget: () => {
      keep(current, '');
      changed();
    },
    choose: (/** @type {string} */ id) => {
      if (!known(id)) throw new TypeError(`ai.key.choose: one of ${providers.map((provider) => provider.id).join(', ')}`);
      if (id === current) return;
      current = id;
      refused = false;
      write(CHOICE_SLOT, id);
      changed();
    },
    request: () => {
      if (!pending) {
        /** @type {(key: string) => void} */
        let resolve = () => {};
        const promise = new Promise((done) => (resolve = done));
        pending = { promise, resolve };
        changed();
      }
      return pending.promise;
    },
    subscribe: (/** @type {() => void} */ listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state: () => snapshot,
    answer: (/** @type {string|null} */ key) => answer(key || ''),
    refuse: () => {
      keep(current, '');
      refused = true;
      changed();
    },
  });
}
