// @ts-check
/**
 * PROOFREAD — the mistakes of a whole email, found in one call: spelling,
 * grammar, punctuation, typos, in every text the reader sees (the subject,
 * the preview text, the text blocks, the buttons, the menu links).
 *
 * The model answers only the texts that have a mistake, each corrected as a
 * whole. A correction is kept when it is one:
 *
 *   it changes words   markup alone moved is no correction (and may lose
 *                      bold or a link): dropped;
 *   it keeps the rest  the same markup, the same links, the same `{{keys}}`
 *                      (rewrite.js `reviewRewrite`), markup the validator
 *                      accepts;
 *   it stays small     words touched in at most a third of the text (three
 *                      in a short one): more is a rewrite, not a correction.
 *
 * What fails gets one more turn with the list; what fails again is left out —
 * the other corrections still come back.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { changedWords } from './diff.js';
import { EmailGenerationError, languageName, unescapedTwice } from './errors.js';
import { reviewRewrite } from './rewrite.js';
import { visibleText } from './subjects.js';

export const MAX_PROOFREAD_TEXTS = 120;
export const MAX_PROOFREAD_TEXT = 6000;
export const MAX_PROOFREAD_TOTAL = 30000;

/**
 * @typedef {'subject'|'preheader'|'text'|'button'|'link'} ProofreadKind
 * @typedef {{id: string, text: string, format?: 'html'|'plain', kind?: ProofreadKind}} ProofreadText
 * @typedef {{texts: ProofreadText[], language?: string}} ProofreadInput
 *   `texts`: the email's texts as they are stored (a text block's HTML, a
 *   label's words), each under an id of the caller's (an element's id,
 *   `subject`…); `language`: the interface's, for the model.
 * @typedef {{id: string, text: string}} ProofreadFix
 */

export const PROOFREAD_SCHEMA = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      description: 'Only the texts that have a mistake, each corrected as a whole. Empty when there is none.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The id of the text, as given.' },
          text: { type: 'string', description: 'The whole text, corrected.' },
        },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['fixes'],
  additionalProperties: false,
};

export const PROOFREAD_SYSTEM_PROMPT = `You proofread an email before it is sent. You get its texts, each in a <text> tag with an id, and you answer the ones that have a mistake, each corrected as a whole, in the JSON field "fixes" (an empty list when there is no mistake).

A mistake is a spelling mistake, a typo, a grammar or agreement mistake, wrong punctuation, a word missing or repeated by accident. Nothing else:
- change no word that is correct: not the style, not the tone, not the length, not the order;
- do not translate, and do not "improve" a text that has no mistake — leave it out;
- keep the markup exactly as it is: the same tags, in the same places, with the same attributes; fix only the words between them;
- keep every merge tag in double braces as written, e.g. {{contact.firstname}}, and every [placeholder in square brackets];
- a brand, a product name or a word in another language is not a mistake;
- answer each text in its own language.

Answer the whole text of each corrected one, never a part of it, never a comment.`;

/** @param {unknown} value @param {number} max */
const bounded = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const KINDS = new Set(['subject', 'preheader', 'text', 'button', 'link']);

/**
 * The request as the proofreader uses it, or an error when there is nothing
 * to read.
 * @param {ProofreadInput} input
 */
export function cleanProofreadInput(input) {
  const source = input && typeof input === 'object' ? input : { texts: [] };
  const seen = new Set();
  /** @type {(Required<ProofreadText>)[]} */
  const texts = [];
  let total = 0;
  for (const raw of Array.isArray(source.texts) ? source.texts.slice(0, MAX_PROOFREAD_TEXTS) : []) {
    if (!raw || typeof raw !== 'object') continue;
    const id = bounded(raw.id, 64);
    const text = bounded(raw.text, MAX_PROOFREAD_TEXT);
    if (!/^[\w.:-]{1,64}$/.test(id) || seen.has(id) || !/\p{L}/u.test(visibleText(text))) continue;
    if (total + text.length > MAX_PROOFREAD_TOTAL) break;
    seen.add(id);
    total += text.length;
    const format = raw.format === 'html' ? 'html' : 'plain';
    const kind = /** @type {ProofreadKind} */ (KINDS.has(String(raw.kind)) ? raw.kind : format === 'html' ? 'text' : 'button');
    texts.push({ id, text, format, kind });
  }
  if (!texts.length) throw new EmailGenerationError('NOTHING_TO_PROOFREAD');
  const language = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(source.language || '')) ? String(source.language) : 'en';
  return { texts, language };
}

/** What each kind of text is, for the model. */
const KIND_NAMES = { subject: 'subject line', preheader: 'preview text', text: 'text block, HTML', button: 'button label', link: 'menu link' };

/** @param {ReturnType<typeof cleanProofreadInput>} request */
export function buildProofreadPrompt({ texts, language }) {
  return [
    `The email's texts, in order. The interface is in ${languageName(language)}; each text stays in its own language.`,
    '',
    ...texts.map(({ id, kind, text }) => `<text id="${id}" kind="${KIND_NAMES[kind]}">\n${text}\n</text>`),
  ].join('\n');
}

/**
 * The corrections in a model's answer: the JSON field `fixes`, wherever the
 * JSON is (code fences, prose around it). None when it cannot be read.
 * @param {string} answer
 * @returns {ProofreadFix[]|null}
 */
export function parseProofread(answer) {
  const source = String(answer ?? '').trim();
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  /** @type {any} */
  let data;
  try {
    data = JSON.parse(source.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(data?.fixes)) return null;
  return data.fixes
    .filter((/** @type {any} */ fix) => fix && typeof fix.id === 'string' && typeof fix.text === 'string')
    .map((/** @type {any} */ fix) => ({ id: fix.id.trim(), text: unescapedTwice(fix.text.trim()) }));
}

/** The tags of a piece of markup, written alike (spaces, quotes, case). @param {string} html */
const tagsOf = (html) =>
  (html.match(/<[^>]+>/g) || []).map((tag) => tag.replace(/\s+/g, ' ').replace(/'/g, '"').replace(/\s*(\/?)>$/, '$1>').toLowerCase());

/**
 * Whether a correction is one, and what is wrong with it otherwise (for the
 * model). `null`: nothing changed for the reader — not a correction, not a
 * problem either.
 * @param {Required<ProofreadText>} original @param {string} corrected
 * @returns {string[]|null}
 */
export function reviewFix(original, corrected) {
  const before = original.format === 'html' ? visibleText(original.text) : original.text;
  const after = original.format === 'html' ? visibleText(corrected) : corrected;
  if (before === after) return null;
  if (!after.trim()) return [`Text ${original.id}: the answer is empty.`];
  /** @type {string[]} */
  const problems = reviewRewrite(original.text, corrected, original.format).map((problem) => `Text ${original.id}: ${problem}`);
  if (original.format === 'plain' && /<[a-z][^>]*>/i.test(corrected)) problems.push(`Text ${original.id}: plain text, no markup.`);
  if (original.format === 'html' && tagsOf(original.text).join('') !== tagsOf(corrected).join('')) {
    problems.push(`Text ${original.id}: the markup changed. Keep every tag as it was; fix only the words.`);
  }
  const { changed, total } = changedWords(before, after);
  if (changed > Math.max(3, Math.ceil(total / 3))) {
    problems.push(`Text ${original.id}: too many words changed for a correction. Fix only the mistakes, nothing else.`);
  }
  return problems;
}

/**
 * @param {{model: import('./generator.js').EmailModel, maxAttempts?: number}} options
 * @returns {(input: ProofreadInput, options?: {signal?: AbortSignal, user?: any}) => Promise<{fixes: ProofreadFix[], attempts: number}>}
 */
export function createProofreader({ model, maxAttempts = 2 }) {
  return async function proofread(input, { signal, user } = {}) {
    const request = cleanProofreadInput(input);
    const byId = new Map(request.texts.map((text) => [text.id, text]));
    /** @type {Map<string, string>} */
    const kept = new Map();
    /** @type {import('./generator.js').ModelMessage[]} */
    const messages = [{ role: 'user', content: buildProofreadPrompt(request) }];
    let read = false;
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      signal?.throwIfAborted();
      let answer;
      try {
        answer = await model({ system: PROOFREAD_SYSTEM_PROMPT, messages, schema: PROOFREAD_SCHEMA, signal, task: 'rewrite', user });
      } catch (error) {
        if (error instanceof EmailGenerationError && error.code === 'REFUSED') throw new EmailGenerationError('PROOFREAD_REFUSED');
        throw error;
      }
      const fixes = parseProofread(answer);
      /** @type {string[]} */
      const problems = [];
      if (!fixes) {
        problems.push('The answer is not the expected JSON object with a "fixes" list.');
      } else {
        read = true;
        for (const fix of fixes) {
          const original = byId.get(fix.id);
          // An id that was not given, or a text already corrected well.
          if (!original || kept.has(fix.id)) continue;
          const issues = reviewFix(original, fix.text);
          if (issues === null) continue;
          if (issues.length) problems.push(...issues);
          else kept.set(fix.id, fix.text);
        }
      }
      if (!problems.length) return { fixes: ordered(request.texts, kept), attempts: attempt };
      messages.push(
        { role: 'assistant', content: String(answer) },
        {
          role: 'user',
          content: `Fix these problems and answer again, in the same JSON — only the texts listed here:\n${problems.map((p) => `- ${p}`).join('\n')}`,
        }
      );
    }
    if (!read) throw new EmailGenerationError('INVALID_ANSWER');
    return { fixes: ordered(request.texts, kept), attempts: Math.max(1, maxAttempts) };
  };
}

/**
 * The corrections in the order of the email.
 * @param {{id: string}[]} texts @param {Map<string, string>} kept
 */
const ordered = (texts, kept) => texts.filter(({ id }) => kept.has(id)).map(({ id }) => ({ id, text: /** @type {string} */ (kept.get(id)) }));
