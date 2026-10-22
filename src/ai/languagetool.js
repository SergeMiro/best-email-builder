// @ts-check
/**
 * LANGUAGETOOL — Proofread without AI: the rules of LanguageTool (spelling,
 * grammar, punctuation, typography; some thirty languages) find the mistakes,
 * and the Proofread dialog lists them as it lists the AI's — the same
 * corrections, applied one by one or all at once.
 *
 *   import { createAi, createLanguageToolProofreader } from 'best-email-builder/ai';
 *
 *   createAi({ proofread: createLanguageToolProofreader({ url: 'https://languagetool.example.com' }) })
 *
 * Alone, it is the builder's only check: no AI, no key. Beside a provider
 * (`createAi({ provider, askKey: true, proofread: … })`), the AI writes and
 * LanguageTool proofreads.
 *
 * Where it runs:
 *   a LanguageTool server of your own   (its Docker image, or the Java server):
 *                                       no limit, the texts stay with you;
 *   LANGUAGETOOL_PUBLIC_API             LanguageTool's free API, to try it out:
 *                                       20 requests a minute, 20 KB each, and
 *                                       the texts go to LanguageTool.
 * From the browser (LanguageTool answers any origin), or on the server as the
 * generator's `proofread` (`createEmailBuilderHandler({ generator: { ...generator, proofread } })`).
 *
 * How a correction is made. The texts of the email go in one request (or a
 * few, for a long email), as LanguageTool's annotated text: the words to
 * check, and the markup it reads as what the reader sees — a paragraph, a
 * line break, a character for an entity, a word for a `{{merge tag}}`. Each
 * mistake becomes the smallest change of its words: the markup, the links
 * and the merge tags stay as they are. Left out:
 *
 *   a change that would touch the markup, or letters of an entity or a tag;
 *   a suggestion of style (LanguageTool's `style` and `register` issues);
 *   an unknown word with a capital letter its suggestion is far from — a
 *   brand, a name ("Acmeworx" → "Acme works"); one in capitals (an acronym) or
 *   with digits; the words of `ignoreWords`;
 *   a capital asked at the start of a subject, a preview text, a button or a
 *   menu link: written in lower case on purpose, often.
 *
 * The suggestion is LanguageTool's first, unless it only splits the word in
 * two ("anoncer" → "a noncer") and the next ones hold a word one letter away
 * with the same first letter ("annoncer").
 *
 * The language: detected from the whole email (`language: 'auto'`), the
 * interface's preferred when unsure; or the one given.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { EmailGenerationError } from './errors.js';
import { cleanProofreadInput } from './proofread.js';
import { decodeEntity } from './subjects.js';

/** LanguageTool's free public API: to try it out (limits, and the texts go to LanguageTool). */
export const LANGUAGETOOL_PUBLIC_API = 'https://api.languagetool.org';

/** Characters sent in one request, markup included: under the public API's 20 KB. */
const MAX_REQUEST = 12_000;

/** Languages that check spelling only in one of their variants: these, when detected. */
const PREFERRED_VARIANTS = ['en-US', 'de-DE', 'pt-PT', 'ca-ES'];

/** A heading, a button or a subject has no full stop. */
const DISABLED_RULES = ['PUNCTUATION_PARAGRAPH_END'];

/** Not mistakes: how to say it better. */
const STYLE_ISSUES = new Set(['style', 'register']);

/** Texts often in lower case on purpose. */
const LINE_KINDS = new Set(['subject', 'preheader', 'button', 'link']);

/** Closing tags that end a paragraph for the reader. */
const BLOCK_END = /^<\/(p|div|li|ul|ol|h[1-6]|table|tr|td|blockquote)\b/i;

/** In a text block: merge tags, [placeholders], tags, entities, and spaces the reader does not see. */
const HTML_MARKUP = /\{\{[^{}]*\}\}|\[[^[\]\n]{1,80}\]|<[^>]*>|&(?:#\d{1,8}|#x[\da-f]{1,8}|[a-z][a-z\d]{1,30});|[ \t\r\n]{2,}|[\t\r\n]/gi;
/** In a label: merge tags and [placeholders]. */
const PLAIN_MARKUP = /\{\{[^{}]*\}\}|\[[^[\]\n]{1,80}\]/g;

/**
 * @typedef {{
 *   url: string,
 *   fetch?: typeof fetch,
 *   headers?: Record<string, string>,
 *   language?: string,
 *   preferredVariants?: string[],
 *   level?: 'default'|'picky',
 *   disabledRules?: string[],
 *   ignoreWords?: string[],
 *   username?: string,
 *   apiKey?: string,
 * }} LanguageToolOptions
 *   `url`: the LanguageTool server (`https://languagetool.example.com`, or
 *   `LANGUAGETOOL_PUBLIC_API`); `language`: `'auto'` (default) or a code
 *   (`'fr'`, `'en-GB'`); `preferredVariants`: the variants used when a
 *   language is detected (default en-US, de-DE, pt-PT, ca-ES); `level`:
 *   `'picky'` for LanguageTool's stricter rules; `disabledRules`: rule ids
 *   left out, beside the full stop at the end of a paragraph; `ignoreWords`:
 *   words never taken for a mistake (your brand, your products);
 *   `username` + `apiKey`: a LanguageTool Premium account
 *   (`url: 'https://api.languagetoolplus.com'`).
 */

/**
 * A part of the document sent: words to check, or markup LanguageTool skips,
 * read as `as`.
 * @typedef {{text: string} | {markup: string, as: string}} Part
 */

/**
 * @param {string} markup
 * @returns {Part}
 */
function markupOf(markup) {
  // A merge tag or a placeholder is a word for the sentence.
  if (markup[0] === '{' || markup[0] === '[') return { markup, as: 'X' };
  // A no-break space stays one: French puts it before "!" and ":".
  if (markup[0] === '&') return { markup, as: /^&(nbsp|#160|#xa0);$/i.test(markup) ? '\u00a0' : decodeEntity(markup, markup.slice(1, -1)) };
  if (markup[0] === '<') return { markup, as: /^<br\b/i.test(markup) ? '\n' : BLOCK_END.test(markup) ? '\n\n' : '' };
  return { markup, as: ' ' };
}

/**
 * A text as LanguageTool's annotated text.
 * @param {string} text @param {'html'|'plain'} format
 * @returns {Part[]}
 */
function partsOf(text, format) {
  /** @type {Part[]} */
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(format === 'html' ? HTML_MARKUP : PLAIN_MARKUP)) {
    const at = /** @type {number} */ (match.index);
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push(markupOf(match[0]));
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/**
 * Texts in one document, a paragraph between them. `read`: the document as
 * LanguageTool reads it; for each of its characters, `place`: where it is in
 * the document sent (LanguageTool's offsets), the start of its markup when it
 * is read from markup (`word` false); `owner`: its text (-1: between texts).
 * @param {Required<import('./proofread.js').ProofreadText>[]} texts
 */
function documentOf(texts) {
  /** @type {object[]} */
  const annotation = [];
  /** @type {number[]} Where each text starts in the document sent. */
  const starts = [];
  /** @type {number[]} */
  const place = [];
  /** @type {boolean[]} */
  const word = [];
  /** @type {number[]} */
  const owner = [];
  let read = '';
  let at = 0;
  /** @param {Part} part @param {number} text */
  const add = (part, text) => {
    const isWord = 'text' in part;
    const seen = isWord ? part.text : part.as;
    annotation.push(isWord ? { text: part.text } : { markup: part.markup, interpretAs: part.as });
    for (let i = 0; i < seen.length; i += 1) {
      place.push(isWord ? at + i : at);
      word.push(isWord);
      owner.push(text);
    }
    read += seen;
    at += isWord ? part.text.length : part.markup.length;
  };
  texts.forEach((item, index) => {
    if (index) add({ markup: '\n\n', as: '\n\n' }, -1);
    starts.push(at);
    for (const part of partsOf(item.text, item.format)) add(part, index);
  });
  return { annotation, starts, place, word, owner, read };
}

/** Optimal string alignment distance, for short words. @param {string} a @param {string} b */
function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/**
 * The suggestion to apply for a mistake, or null: none, or not a mistake to
 * correct (see the head of this file).
 * @param {any} match @param {string} word  what LanguageTool flagged, as read
 * @param {Set<string>} ignored
 */
function suggestionFor(match, word, ignored) {
  const values = (Array.isArray(match?.replacements) ? match.replacements : [])
    .map((/** @type {any} */ item) => item?.value)
    .filter((/** @type {unknown} */ value) => typeof value === 'string');
  if (!values.length || STYLE_ISSUES.has(match?.rule?.issueType)) return null;
  let [best] = values;
  if (match.rule?.issueType !== 'misspelling') return best;
  const lower = word.toLowerCase();
  if (ignored.has(lower) || /\d/.test(word) || (/^\p{Lu}[\p{Lu}\d]+$/u.test(word))) return null;
  // Split in two, though a word one letter away is offered.
  if (best.replace(/[\s'’-]/g, '').toLowerCase() === lower.replace(/[\s'’-]/g, '') && /[\s'’-]/.test(best)) {
    const near = values
      .slice(1, 3)
      .find((value) => !/\s/.test(value) && value[0]?.toLowerCase() === lower[0] && distance(value.toLowerCase(), lower) === 1);
    if (near) best = near;
  }
  // A name or a brand: an unknown word with a capital, its suggestion far from it.
  if (/^\p{Lu}/u.test(word) && (best[0]?.toLowerCase() !== lower[0] || distance(best.toLowerCase(), lower) > 1)) return null;
  return best;
}

/** @param {string} text */
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The change a match makes in its text: the smallest, in the words — or null
 * when it would touch markup, or is in no text.
 * @param {ReturnType<typeof documentOf>} doc @param {any} match @param {Set<string>} ignored
 * @param {Required<import('./proofread.js').ProofreadText>[]} texts
 * @returns {{text: number, from: number, to: number, insert: string} | null}
 */
function editOf(doc, match, ignored, texts) {
  const offset = Number(match?.offset);
  const length = Number(match?.length);
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length <= 0) return null;
  const { place, word, owner, read, starts } = doc;
  // What LanguageTool read of it: the characters from its offset to its end.
  let first = 0;
  while (first < read.length && place[first] < offset) first += 1;
  let last = first;
  while (last < read.length && place[last] < offset + length) last += 1;
  const flagged = read.slice(first, last);
  const text = owner[first];
  if (!flagged || text === undefined || text < 0 || owner.slice(first, last).some((o) => o !== text)) return null;
  const item = texts[text];
  if (match?.rule?.id === 'UPPERCASE_SENTENCE_START' && LINE_KINDS.has(item.kind)) return null;
  const suggestion = suggestionFor(match, flagged.trim(), ignored);
  if (suggestion === null || suggestion === flagged) return null;
  // The smallest change: what the flagged words and the suggestion share, kept.
  let head = 0;
  while (head < flagged.length && head < suggestion.length && flagged[head] === suggestion[head]) head += 1;
  let tail = 0;
  while (tail < flagged.length - head && tail < suggestion.length - head && flagged[flagged.length - 1 - tail] === suggestion[suggestion.length - 1 - tail]) tail += 1;
  const from = first + head;
  const to = first + flagged.length - tail;
  const insert = suggestion.slice(head, suggestion.length - tail);
  // Only words are changed, in one piece; no letter of markup next to the change.
  for (let i = from; i < to; i += 1) {
    if (!word[i] || (i > from && place[i] !== place[i - 1] + 1)) return null;
  }
  const glued = (/** @type {number} */ i) => i >= 0 && i < read.length && !word[i] && /[\p{L}\p{N}]/u.test(read[i]);
  if (glued(from - 1) || glued(to)) return null;
  /** @type {number} */
  let at;
  if (to > from) at = place[from];
  else if (from > 0 && word[from - 1]) at = place[from - 1] + 1;
  else if (from < read.length && word[from]) at = place[from];
  else return null;
  const start = at - starts[text];
  const end = start + (to - from);
  return { text, from: start, to: end, insert: item.format === 'html' ? escapeHtml(insert) : insert };
}

/**
 * Proofread with LanguageTool: a function for `createAi({ proofread })`, or
 * for a server's generator.
 * @param {LanguageToolOptions} options
 * @returns {(input: import('./proofread.js').ProofreadInput, options?: {signal?: AbortSignal}) => Promise<{fixes: import('./proofread.js').ProofreadFix[]}>}
 */
export function createLanguageToolProofreader(options) {
  const {
    url,
    fetch: fetchImpl = globalThis.fetch,
    headers = {},
    language = 'auto',
    preferredVariants = PREFERRED_VARIANTS,
    level = 'default',
    disabledRules = [],
    ignoreWords = [],
    username,
    apiKey,
  } = /** @type {LanguageToolOptions} */ (options || {});
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    throw new TypeError('createLanguageToolProofreader: `url` is a LanguageTool server — your own, or LANGUAGETOOL_PUBLIC_API to try it out');
  }
  if (typeof fetchImpl !== 'function') throw new TypeError('createLanguageToolProofreader: no `fetch` here — pass one');
  if (Boolean(username) !== Boolean(apiKey)) throw new TypeError('createLanguageToolProofreader: `username` and `apiKey` go together');
  const endpoint = /\/v2\/check\/?$/.test(url) ? url : `${url.replace(/\/+$/, '')}/v2/check`;
  const ignored = new Set(ignoreWords.map((word) => String(word).toLowerCase()));
  const disabled = [...DISABLED_RULES, ...disabledRules].join(',');

  /** @param {object[]} annotation @param {string} preferred @param {AbortSignal} [signal] */
  const check = async (annotation, preferred, signal) => {
    const body = new URLSearchParams({ data: JSON.stringify({ annotation }), language, level, disabledRules: disabled });
    if (language === 'auto') {
      body.set('preferredVariants', preferredVariants.join(','));
      body.set('preferredLanguages', preferred);
    }
    if (username && apiKey) {
      body.set('username', username);
      body.set('apiKey', apiKey);
    }
    let response;
    try {
      response = await fetchImpl(endpoint, { method: 'POST', headers: { Accept: 'application/json', ...headers }, body, signal });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new EmailGenerationError('CHECKER_UNAVAILABLE', `LanguageTool: ${/** @type {any} */ (error)?.message || error}`);
    }
    if (response.status === 429) throw new EmailGenerationError('CHECKER_BUSY');
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new EmailGenerationError('CHECKER_UNAVAILABLE', `LanguageTool: HTTP ${response.status} ${detail}`.slice(0, 300));
    }
    try {
      const data = await response.json();
      return Array.isArray(data?.matches) ? data.matches : [];
    } catch {
      throw new EmailGenerationError('CHECKER_UNAVAILABLE', 'LanguageTool: the answer is not JSON');
    }
  };

  return async function proofread(input, { signal } = {}) {
    const request = cleanProofreadInput(input);
    // A few texts per request, in order: never a text cut in two.
    /** @type {typeof request.texts[]} */
    const batches = [[]];
    let size = 0;
    for (const item of request.texts) {
      if (size && size + item.text.length > MAX_REQUEST) {
        batches.push([]);
        size = 0;
      }
      batches[batches.length - 1].push(item);
      size += item.text.length + 2;
    }
    /** @type {Map<string, string>} */
    const corrected = new Map();
    for (const texts of batches) {
      signal?.throwIfAborted();
      const doc = documentOf(texts);
      const matches = await check(doc.annotation, request.language.slice(0, 2), signal);
      /** @type {Map<number, {from: number, to: number, insert: string}[]>} */
      const edits = new Map();
      for (const match of matches) {
        const edit = editOf(doc, match, ignored, texts);
        if (!edit) continue;
        const list = edits.get(edit.text) || [];
        // Two changes at one place: the first one.
        if (list.some((other) => (edit.from < other.to && other.from < edit.to) || edit.from === other.from)) continue;
        list.push(edit);
        edits.set(edit.text, list);
      }
      for (const [index, list] of edits) {
        let text = texts[index].text;
        for (const edit of list.sort((a, b) => b.from - a.from)) text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
        if (text !== texts[index].text) corrected.set(texts[index].id, text);
      }
    }
    return { fixes: request.texts.filter(({ id }) => corrected.has(id)).map(({ id }) => ({ id, text: /** @type {string} */ (corrected.get(id)) })) };
  };
}
