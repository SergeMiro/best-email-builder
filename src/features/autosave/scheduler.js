// @ts-check
/**
 * AUTOSAVE scheduler — no React, no global timer.
 *
 * Two delays, because one is not enough:
 *   - `idleMs`    after the LAST change (do not save in the middle of a
 *                 sentence);
 *   - `maxWaitMs` since the FIRST unsaved change: someone editing without a
 *                 pause for ten minutes must still get their work saved.
 *
 * `notify()` on every change, `reset()` after any save (automatic or not),
 * `dispose()` on unmount. Timers are injectable for tests.
 */

/**
 * @param {{
 *   run: () => (void | Promise<unknown>),
 *   idleMs?: number,
 *   maxWaitMs?: number,
 *   now?: () => number,
 *   setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (handle: any) => void,
 * }} options
 */
export function createAutosaveScheduler({
  run,
  idleMs = 20_000,
  maxWaitMs = 120_000,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  /** @type {number|null} */
  let firstChangeAt = null;
  let handle = null;
  let disposed = false;

  function clear() {
    if (handle !== null) clearTimer(handle);
    handle = null;
  }

  function fire() {
    handle = null;
    firstChangeAt = null;
    if (!disposed) run();
  }

  return {
    notify() {
      if (disposed) return;
      const at = now();
      if (firstChangeAt === null) firstChangeAt = at;
      const remainingMax = Math.max(0, firstChangeAt + maxWaitMs - at);
      clear();
      handle = setTimer(fire, Math.min(idleMs, remainingMax));
    },
    reset() {
      clear();
      firstChangeAt = null;
    },
    get pending() {
      return handle !== null;
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
