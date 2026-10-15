// @ts-check
/**
 * THE USER'S KEY — when the AI runs in the page with `askKey: true`, each
 * user connects their own provider key, once.
 *
 * The first AI action asks for it (the Connect dialog, `ConnectAi.jsx`); it is
 * kept in this browser (localStorage, one entry per provider) and sent only to
 * the provider. A key the provider refuses is forgotten, and asked again.
 *
 *   ai.key.get()         the key in use ('' when none)
 *   ai.key.set(key)      connect a key without the dialog
 *   ai.key.forget()      disconnect: the next AI action asks again
 *   ai.key.request()     ask the user now → the key, or '' when they cancel
 *   ai.key.subscribe(fn) called on every change; returns the unsubscribe
 *   ai.key.provider      the provider's name, where to get a key, what is free
 */

/** @typedef {import('./providers.js').AiProvider} AiProvider */

const STORAGE_PREFIX = 'best-email-builder:ai-key:';

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
 * @typedef {{
 *   provider: Readonly<{id: string, name: string, keyUrl: string|null, keyHint: string, free: string|null}>,
 *   get: () => string,
 *   set: (key: string) => void,
 *   forget: () => void,
 *   request: () => Promise<string>,
 *   subscribe: (listener: () => void) => () => void,
 *   state: () => Readonly<{asking: boolean, refused: boolean, connected: boolean}>,
 *   answer: (key: string|null) => void,
 *   refuse: () => void,
 * }} AiKey
 *   `state`, `answer` and `refuse` serve the Connect dialog and the module:
 *   whether the user is being asked, whether the last key was refused.
 */

/**
 * @param {AiProvider} provider
 * @returns {AiKey}
 */
export function createKeyStore(provider) {
  const slot = STORAGE_PREFIX + provider.id;
  /** Kept here too: a browser that does not store still works for the page's life. */
  let memory = '';
  let refused = false;
  /** @type {{promise: Promise<string>, resolve: (key: string) => void}|null} */
  let pending = null;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {ReturnType<AiKey['state']>} */
  let snapshot;

  const read = () => {
    try {
      return browserStorage()?.getItem(slot) || '';
    } catch {
      return '';
    }
  };
  /** @param {string} value */
  const write = (value) => {
    try {
      const storage = browserStorage();
      if (value) storage?.setItem(slot, value);
      else storage?.removeItem(slot);
    } catch {
      // Full, or blocked: the key stays in memory.
    }
  };
  const get = () => memory || read();
  const changed = () => {
    snapshot = Object.freeze({ asking: Boolean(pending), refused, connected: Boolean(get()) });
    for (const listener of [...listeners]) listener();
  };
  snapshot = Object.freeze({ asking: false, refused: false, connected: Boolean(get()) });

  /** @param {string} key */
  const answer = (key) => {
    const value = String(key || '').trim();
    if (value) {
      memory = value;
      refused = false;
      write(value);
    }
    const waiting = pending;
    pending = null;
    changed();
    waiting?.resolve(value);
  };

  return Object.freeze({
    provider: Object.freeze({ id: provider.id, name: provider.name, keyUrl: provider.keyUrl, keyHint: provider.keyHint, free: provider.free }),
    get,
    set: (/** @type {string} */ key) => {
      if (typeof key !== 'string' || !key.trim()) throw new TypeError('ai.key.set: a non-empty key');
      answer(key);
    },
    forget: () => {
      memory = '';
      write('');
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
      memory = '';
      write('');
      refused = true;
      changed();
    },
  });
}
