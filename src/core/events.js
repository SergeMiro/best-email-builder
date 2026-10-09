// @ts-check
/**
 * Minimal, dependency-free event emitter.
 *
 * A throwing listener does not prevent the next ones from running: the error
 * goes to `onError` (the console by default). A UI listening to the selection
 * must not break the history because one panel crashed.
 */

/**
 * @typedef {(payload?: any) => void} Listener
 * @typedef {{
 *   on: (event: string, listener: Listener) => () => void,
 *   off: (event: string, listener: Listener) => void,
 *   emit: (event: string, payload?: any) => void,
 *   clear: () => void,
 * }} Emitter
 */

/**
 * @param {{onError?: (error: unknown, event: string) => void}} [options]
 * @returns {Emitter}
 */
export function createEmitter({ onError } = {}) {
  /** @type {Map<string, Set<Listener>>} */
  const listeners = new Map();
  const report =
    onError ||
    ((error, event) => {
      console.warn(`[mailblocks] listener for "${event}" failed`, error);
    });

  /** @param {string} event @param {Listener} listener */
  function off(event, listener) {
    listeners.get(event)?.delete(listener);
  }

  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)?.add(listener);
      return () => off(event, listener);
    },
    off,
    emit(event, payload) {
      for (const listener of [...(listeners.get(event) || [])]) {
        try {
          listener(payload);
        } catch (error) {
          report(error, event);
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
