// @ts-check
/**
 * LOCAL DRAFT of a template that has never been saved.
 *
 * A new template does not exist on the server yet: server-side autosave cannot
 * help it, and creating an "untitled" record on every open would clutter the
 * template library. Its work is therefore kept in the browser (document +
 * metadata such as label, subject, preview text), and offered the next time a
 * new template is opened, as long as it was never saved.
 *
 * Cleared on the first successful save. Ignored after seven days, or when it
 * cannot be read (written by another version of the builder).
 */

import { readDocument } from '../../core/document.js';

const KEY = 'best-email-builder:new-template-draft';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** @param {Storage|null|undefined} store */
function usable(store) {
  return store && typeof store.getItem === 'function' ? store : null;
}

function defaultStore() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{document: object, meta: object}} draft
 * @param {Storage|null} [store]
 */
export function saveLocalDraft({ document, meta }, store = defaultStore()) {
  const target = usable(store);
  if (!target) return false;
  try {
    target.setItem(KEY, JSON.stringify({ savedAt: Date.now(), document, meta }));
    return true;
  } catch {
    // Quota exceeded, private browsing: a lost draft is not an error.
    return false;
  }
}

/**
 * @param {Storage|null} [store]
 * @returns {{savedAt: number, document: import('../../core/document.js').EmailDocument, meta: Record<string, string>}|null}
 */
export function readLocalDraft(store = defaultStore(), { now = Date.now() } = {}) {
  const target = usable(store);
  if (!target) return null;
  try {
    const raw = target.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || now - Number(parsed.savedAt) > MAX_AGE_MS) {
      target.removeItem(KEY);
      return null;
    }
    return { savedAt: Number(parsed.savedAt), document: readDocument(parsed.document), meta: parsed.meta || {} };
  } catch {
    target.removeItem(KEY);
    return null;
  }
}

/** @param {Storage|null} [store] */
export function clearLocalDraft(store = defaultStore()) {
  try {
    usable(store)?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
