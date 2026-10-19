// @ts-check
/**
 * WORD DIFF — what a correction changed, word by word: to show it (struck
 * out, then the new words) and to tell a correction from a rewrite.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

/** Words (letters, digits, inner apostrophes and hyphens), spaces, and each other sign alone. */
const TOKEN = /\s+|[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*|[^\s\p{L}\p{N}\p{M}]/gu;

/** Past this many cells the texts are compared as a whole (one change). */
const MAX_CELLS = 4_000_000;

/** @param {string} text */
export const tokensOf = (text) => String(text || '').match(TOKEN) || [];

/**
 * @typedef {{type: 'same'|'removed'|'added', text: string}} DiffPart
 */

/**
 * `before` turned into `after`, in parts: what stayed, what was removed, what
 * was added. Neighbouring parts of one type are joined.
 * @param {string} before @param {string} after
 * @returns {DiffPart[]}
 */
export function diffWords(before, after) {
  const a = tokensOf(before);
  const b = tokensOf(after);
  /** @type {DiffPart[]} */
  const parts = [];
  const push = (/** @type {DiffPart['type']} */ type, /** @type {string} */ text) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  // Shared start and end first: a correction leaves most of a text alone.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);
  if (start) push('same', a.slice(0, start).join(''));
  if (midA.length * midB.length > MAX_CELLS) {
    if (midA.length) push('removed', midA.join(''));
    if (midB.length) push('added', midB.join(''));
  } else {
    // Longest common subsequence, then walked from the start.
    const width = midB.length + 1;
    const lengths = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        lengths[i * width + j] =
          midA[i] === midB[j] ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        push('same', midA[i]);
        i += 1;
        j += 1;
      } else if (i < midA.length && (j === midB.length || lengths[(i + 1) * width + j] >= lengths[i * width + j + 1])) {
        // Removed before added: the old words, then the new ones.
        push('removed', midA[i]);
        i += 1;
      } else {
        push('added', midB[j]);
        j += 1;
      }
    }
  }
  if (end) push('same', a.slice(a.length - end).join(''));
  return parts;
}

/** A token that is a word or a sign, not a space. @param {string} token */
const counted = (token) => !/^\s+$/.test(token);

/**
 * How many words and signs of `before` a change touched (removed or replaced),
 * and how many it had.
 * @param {string} before @param {string} after
 */
export function changedWords(before, after) {
  const total = tokensOf(before).filter(counted).length;
  let removed = 0;
  let added = 0;
  for (const part of diffWords(before, after)) {
    const count = tokensOf(part.text).filter(counted).length;
    if (part.type === 'removed') removed += count;
    if (part.type === 'added') added += count;
  }
  return { changed: Math.max(removed, added), total };
}
