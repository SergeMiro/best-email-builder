// @ts-check
/**
 * REWRITE — one text of the email, rewritten by the model: shorter, longer,
 * fixed, friendlier, more formal, translated, or changed as the user says —
 * or WRITTEN anew on a topic the user gives (`write`), to fit the rest of the
 * email (`context`).
 *
 * The text is either the HTML of a text block (`html`) or the label of a
 * button (`plain`). What comes back must keep what the email depends on:
 *
 *   links       the same hrefs, no new one (the words around them may change);
 *   variables   the same `{{keys}}`, none added (a fallback after `|` may be
 *               translated);
 *   markup      what the server's validator accepts in a text block.
 *
 * When one of them is lost, the model gets one more turn with the list; then
 * the rewrite fails and the text stays as it was.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { validateMjml } from '../validation/mjmlValidator.js';
import { EmailGenerationError, languageName, unescapedTwice } from './errors.js';

/**
 * The actions offered as buttons, in order. `translate` takes a language,
 * a custom change (`custom`) takes the user's words, a text written anew
 * (`write`) its topic.
 */
export const REWRITE_ACTIONS = [
  { id: 'shorter', label: 'Shorter', change: 'Make it noticeably shorter, about half as long. Keep the meaning, the key facts and every link.' },
  {
    id: 'longer',
    label: 'Longer',
    change: 'Make it somewhat longer, about one and a half times, and more vivid. Develop what is there; invent no fact.',
  },
  {
    id: 'fix',
    label: 'Fix mistakes',
    change: 'Fix spelling, grammar and punctuation only. Change nothing else: same words, same tone, same length.',
  },
  { id: 'friendlier', label: 'Friendlier', change: 'Make the tone warmer and friendlier, as if talking to a customer you like. Same facts, about the same length.' },
  { id: 'formal', label: 'More formal', change: 'Make the tone more professional and formal. Same facts, about the same length.' },
];

/** Languages offered by "Translate", shown under their own name. */
export const REWRITE_LANGUAGES = ['en', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'uk', 'ru', 'tr', 'ja', 'zh'];

export const MAX_REWRITE_TEXT = 6000;
export const MAX_REWRITE_INSTRUCTION = 300;
export const MAX_REWRITE_CONTEXT = 4000;

export const REWRITE_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string', description: 'The rewritten text, nothing else.' } },
  required: ['text'],
  additionalProperties: false,
};

export const REWRITE_SYSTEM_PROMPT = `You are an email copywriter. You rewrite ONE piece of text taken from an email, as asked, and answer with the rewritten text only, in the JSON field "text".

The text is one of:
- HTML, the content of a text block: keep the same kind of markup. Allowed tags: <p>, <br>, <b>, <strong>, <i>, <em>, <u>, <s>, <span style="...">, <a href="...">, <ul>, <ol>, <li>, <sup>, <sub>. No other tag, no class, no new style. Keep bold, italic and links on the words they belong to.
- plain text, the label of a button: answer plain text without HTML, a short call to action of a few words.

Always:
- Keep every link: each <a href="..."> of the text stays, with its href unchanged; the words of the link may change. Add no link.
- Keep every merge tag in double braces exactly as written, e.g. {{contact.firstname}} or {{ unsubscribe }}. In {{key|fallback}} only the fallback after "|" may change (translated, for instance). Add no merge tag.
- Keep [placeholders in square brackets]: the user replaces them later. Translate their words when translating.
- Invent no facts: no new price, date, number, name, guarantee or promise.
- Write in the language of the text, unless asked to translate.
- No preamble, no comment, no quotation marks around the text.

The rest of the email may come in <email> tags: it is there for context only, to fit its language and tone and to repeat nothing it already says. Never answer it, never copy it.`;

/** @param {unknown} value @param {number} max */
const bounded = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The words of an HTML fragment. @param {string} html */
const wordsOf = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * @typedef {{
 *   action: string,
 *   text: string,
 *   format?: 'html'|'plain',
 *   targetLanguage?: string,
 *   instruction?: string,
 *   context?: string,
 *   role?: 'heading'|'text',
 *   language?: string,
 * }} RewriteInput
 *   `action`: an id of REWRITE_ACTIONS, `translate` (with `targetLanguage`),
 *   `custom` (with `instruction`: the change) or `write` (with `instruction`:
 *   the topic; the current text may be empty). `context`: the words of the
 *   rest of the email (`emailWords`). `role`: a text block set as a title is
 *   written as one line. `language`: the interface's, for an email with no
 *   words yet.
 */

/**
 * The request as the rewriter uses it, or an error when there is nothing to do.
 * @param {RewriteInput} input
 */
export function cleanRewriteInput(input) {
  const source = input && typeof input === 'object' ? input : /** @type {RewriteInput} */ ({ action: '', text: '' });
  const format = /** @type {'html'|'plain'} */ (source.format === 'plain' ? 'plain' : 'html');
  const text = bounded(source.text, MAX_REWRITE_TEXT);
  const context = bounded(source.context, MAX_REWRITE_CONTEXT);
  const heading = source.role === 'heading';
  const instruction = bounded(source.instruction, MAX_REWRITE_INSTRUCTION);
  if (source.action === 'write') {
    if (!instruction) throw new EmailGenerationError('NOTHING_TO_REWRITE', 'No topic.');
    const language = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(source.language || '')) ? String(source.language) : '';
    return { format, text, context, heading, change: writeChange(instruction, { heading, format, language, context }) };
  }
  if (!wordsOf(text)) throw new EmailGenerationError('NOTHING_TO_REWRITE');
  const preset = REWRITE_ACTIONS.find((action) => action.id === source.action);
  if (preset) return { format, text, context, heading, change: preset.change };
  if (source.action === 'translate') {
    const language = String(source.targetLanguage || '');
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(language)) throw new EmailGenerationError('NOTHING_TO_REWRITE', 'No target language.');
    return { format, text, context, heading, change: `Translate it into ${languageName(language)}. Keep the tone and the length.` };
  }
  if (source.action === 'custom' && instruction) return { format, text, context, heading, change: instruction };
  throw new EmailGenerationError('NOTHING_TO_REWRITE', 'Unknown action.');
}

/**
 * What the model is asked to write on a topic.
 * @param {string} topic
 * @param {{heading: boolean, format: 'html'|'plain', language: string, context: string}} options
 */
function writeChange(topic, { heading, format, language, context }) {
  const shape =
    format === 'plain'
      ? 'a button label: a short call to action of a few words'
      : heading
        ? 'a title: one short line, plain words without <p>, no full stop'
        : 'the text of a block: a few short sentences, in one or two paragraphs';
  const where = context ? 'the language of the email' : `${languageName(language || 'en')}, unless the topic is written in another language`;
  return [
    `Write a new text about: ${topic}`,
    `It is ${shape}. It replaces the current words entirely; only the current links and merge tags stay, placed where they fit.`,
    'Where a fact is missing (a date, a price, a name, a place), write a [placeholder in square brackets] instead of inventing it.',
    `Write in ${where}.`,
  ].join(' ');
}

/** @param {{format: 'html'|'plain', text: string, change: string, context?: string}} request */
export function buildRewritePrompt({ format, text, change, context = '' }) {
  return [
    `Change: ${change}`,
    `Format: ${format === 'plain' ? 'plain text (a button label)' : 'HTML (a text block)'}`,
    ...(context ? ['', 'The rest of the email, for context only:', '<email>', context, '</email>'] : []),
    '',
    '<text>',
    text,
    '</text>',
  ].join('\n');
}

/** The text in a model's answer: the JSON field, or the bare answer. @param {string} answer */
export function parseRewrite(answer) {
  const source = String(answer ?? '').trim();
  const unfenced = source.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  if (unfenced.startsWith('{')) {
    try {
      const data = JSON.parse(unfenced);
      if (typeof data?.text === 'string') return unescapedTwice(data.text.trim());
    } catch {
      // not JSON after all: the text itself
    }
  }
  return unfenced.replace(/^<text>\s*/, '').replace(/\s*<\/text>$/, '');
}

/** @param {string} html */
const hrefsOf = (html) => [...html.matchAll(/<a\b[^>]*?\shref\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2].trim());
/** @param {string} html */
const variableKeysOf = (html) => [...html.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)].map((match) => match[1]);

/**
 * What is wrong with a rewritten text, for the model (empty: usable).
 * @param {string} original @param {string} rewritten @param {'html'|'plain'} format
 */
export function reviewRewrite(original, rewritten, format) {
  /** @type {string[]} */
  const problems = [];
  if (!wordsOf(rewritten)) return ['The answer is empty.'];
  const before = new Set(variableKeysOf(original));
  const after = new Set(variableKeysOf(rewritten));
  for (const key of before) if (!after.has(key)) problems.push(`The merge tag {{${key}}} is missing: keep it.`);
  for (const key of after) if (!before.has(key)) problems.push(`The merge tag {{${key}}} was added: remove it.`);
  if (format === 'plain') return problems;
  const links = new Set(hrefsOf(original));
  const kept = new Set(hrefsOf(rewritten));
  for (const href of links) if (!kept.has(href)) problems.push(`The link to ${href} is missing: keep it with the same href.`);
  for (const href of kept) if (!links.has(href)) problems.push(`The link to ${href} was added: remove it.`);
  const wrapped = `<mjml><mj-body><mj-section><mj-column><mj-text>${rewritten}</mj-text></mj-column></mj-section></mj-body></mjml>`;
  for (const issue of validateMjml(wrapped).issues) problems.push(issue.message);
  return problems;
}

/**
 * @param {{model: import('./generator.js').EmailModel, maxAttempts?: number}} options
 * @returns {(input: RewriteInput, options?: {signal?: AbortSignal, user?: any}) => Promise<{text: string, attempts: number}>}
 */
export function createRewriter({ model, maxAttempts = 2 }) {
  return async function rewrite(input, { signal, user } = {}) {
    const request = cleanRewriteInput(input);
    /** @type {import('./generator.js').ModelMessage[]} */
    const messages = [{ role: 'user', content: buildRewritePrompt(request) }];
    let lastProblem = '';
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      signal?.throwIfAborted();
      let answer;
      try {
        answer = await model({ system: REWRITE_SYSTEM_PROMPT, messages, schema: REWRITE_SCHEMA, signal, task: 'rewrite', user });
      } catch (error) {
        if (error instanceof EmailGenerationError && error.code === 'REFUSED') throw new EmailGenerationError('REWRITE_REFUSED');
        throw error;
      }
      let text = parseRewrite(answer);
      // A label: the words alone, whatever markup came with them.
      if (request.format === 'plain') text = wordsOf(text).slice(0, 120);
      // A title: one line, not a paragraph.
      else if (request.heading) text = text.replace(/^\s*<p>((?:(?!<\/?p\b)[\s\S])*)<\/p>\s*$/i, '$1');
      const problems = reviewRewrite(request.text, text, request.format);
      if (!problems.length) return { text, attempts: attempt };
      lastProblem = problems[0];
      messages.push(
        { role: 'assistant', content: String(answer) },
        { role: 'user', content: `Fix these problems and answer the whole text again:\n${problems.map((p) => `- ${p}`).join('\n')}` }
      );
    }
    throw new EmailGenerationError('REWRITE_UNUSABLE', lastProblem);
  };
}
