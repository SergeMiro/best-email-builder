// @ts-check
/**
 * SUBJECT IDEAS — three other subject lines for an email, drawn from its words.
 *
 * The model gets what the inbox shows (the subject and the preview text) and
 * the words of the email, and answers three subjects that take three
 * different angles. What comes back is one line each, different from the
 * current subject and from each other, with no merge tag the catalog does not
 * know; when fewer than three are left, the model gets one more turn with the
 * list of problems.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { DEFAULT_VARIABLES } from '../variables/catalog.js';
import { EmailGenerationError } from './draft.js';
import { languageName } from './prompt.js';

export const SUBJECT_COUNT = 3;
export const MAX_SUBJECT_LENGTH = 150;
export const MAX_EMAIL_WORDS = 4000;
const MAX_VARIABLES = 60;

/**
 * @typedef {{
 *   subject?: string,
 *   preheader?: string,
 *   text?: string,
 *   language?: string,
 *   variables?: {key: string, label?: string}[],
 *   avoid?: string[],
 * }} SubjectsInput
 *   `text`: the words of the email (`emailWords`); `language`: the one of the
 *   interface, used when the email has no words yet; `avoid`: ideas already
 *   shown ("More ideas" asks for new ones).
 */

export const SUBJECTS_SCHEMA = {
  type: 'object',
  properties: {
    subjects: {
      type: 'array',
      description: 'Exactly three subject lines, plain text.',
      items: { type: 'string' },
    },
  },
  required: ['subjects'],
  additionalProperties: false,
};

export const SUBJECTS_SYSTEM_PROMPT = `You write email subject lines. You get an email (its current subject, its preview text and its words) and answer three NEW subject lines for it, in the JSON field "subjects".

Each subject:
- tells what the email brings, specific to its content: under 50 characters when possible, 70 at most;
- takes its own angle: one clear and direct, one that makes the reader curious, one personal or timely;
- is written in the language of the email;
- invents no facts: no price, discount, date, number, name or promise the email does not contain;
- is plain text: no HTML, no quotation marks around it, no line break;
- has no word in capitals, at most one "!", no spam wording ("free!!!", "act now", "100% guaranteed");
- has no emoji, unless the current subject has one;
- differs from the current subject and from the two others, and does not repeat the preview text.

Merge tags: you may personalise ONE of the three with a merge tag from the list you are given, written exactly as listed, e.g. {{contact.firstname}}. No other merge tag.`;

/** @param {unknown} value @param {number} max */
const bounded = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** One line of plain text. @param {unknown} value */
const line = (value) =>
  String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'«“”‘’]+|["'»“”‘’]+$/g, '')
    .trim()
    .slice(0, MAX_SUBJECT_LENGTH);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * The words of an email, as a reader sees them: the head, the styles and the
 * markup left out.
 * @param {string} mjml
 */
export function emailWords(mjml) {
  return String(mjml || '')
    .replace(/<mj-head[\s\S]*?<\/mj-head>/gi, ' ')
    .replace(/<(style|script|mj-style|mj-raw)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|mj-text|mj-button|mj-navbar-link|mj-social-element)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[/** @type {keyof typeof ENTITIES} */ (name)])
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
    .slice(0, MAX_EMAIL_WORDS);
}

/**
 * The request as the model sees it, or an error when there is nothing to
 * draw subjects from.
 * @param {SubjectsInput} input
 */
export function cleanSubjectsInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const subject = line(source.subject);
  const preheader = bounded(source.preheader, 300).replace(/\s+/g, ' ');
  const text = bounded(source.text, MAX_EMAIL_WORDS);
  if (!subject && !text) throw new EmailGenerationError('NOTHING_TO_SUGGEST');
  const language = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(source.language || '')) ? String(source.language) : 'en';
  const variables = (Array.isArray(source.variables) ? source.variables : DEFAULT_VARIABLES)
    .filter((variable) => variable && /^[A-Za-z][\w.]*$/.test(String(variable.key)) && variable.key !== 'unsubscribe')
    .filter((variable) => /** @type {any} */ (variable).kind !== 'link')
    .slice(0, MAX_VARIABLES)
    .map((variable) => ({ key: String(variable.key), label: bounded(variable.label, 80) }));
  const avoid = (Array.isArray(source.avoid) ? source.avoid : []).map(line).filter(Boolean).slice(0, 12);
  return { subject, preheader, text, language, variables, avoid };
}

/** @param {ReturnType<typeof cleanSubjectsInput>} request */
export function buildSubjectsPrompt({ subject, preheader, text, language, variables, avoid }) {
  return [
    `Current subject: ${subject || '(none yet)'}`,
    `Preview text: ${preheader || '(none)'}`,
    avoid.length ? `Already suggested, do not repeat: ${avoid.map((idea) => `"${idea}"`).join(', ')}` : null,
    `Merge tags you may use: ${variables.length ? variables.map((v) => `{{${v.key}}}${v.label ? ` (${v.label})` : ''}`).join(', ') : 'none'}`,
    text ? null : `The email has no words yet: write in ${languageName(language)}.`,
    '',
    '<email>',
    text,
    '</email>',
  ]
    .filter((row) => row !== null)
    .join('\n');
}

/**
 * A capital letter first, as a sentence starts — unless the first word is
 * styled that way on purpose (iPhone, eBay). @param {string} subject
 */
const capitalized = (subject) => {
  const first = subject.split(/\s/)[0];
  return /^\p{Ll}/u.test(first) && !/\p{Lu}/u.test(first) ? subject[0].toLocaleUpperCase() + subject.slice(1) : subject;
};

/** The subjects in a model's answer: the JSON field, else one per line. @param {string} answer */
export function parseSubjects(answer) {
  const source = String(answer ?? '').trim();
  const unfenced = source.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const data = JSON.parse(unfenced.slice(start, end + 1));
      if (Array.isArray(data?.subjects)) return data.subjects.map((subject) => capitalized(line(subject)));
    } catch {
      // not JSON: one subject per line
    }
  }
  return unfenced.split('\n').map((row) => capitalized(line(row.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))));
}

/** @param {string} text */
const keysOf = (text) => [...text.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)].map((match) => match[1]);

/**
 * The usable subjects, and what is wrong with the others (for the model).
 * @param {string[]} subjects @param {ReturnType<typeof cleanSubjectsInput>} request
 */
export function reviewSubjects(subjects, request) {
  const known = new Set(request.variables.map((variable) => variable.key));
  const seen = new Set([request.subject, ...request.avoid].map((subject) => subject.toLocaleLowerCase()));
  /** @type {string[]} */
  const usable = [];
  /** @type {string[]} */
  const problems = [];
  for (const subject of subjects) {
    if (!subject) continue;
    const unknown = keysOf(subject).filter((key) => !known.has(key));
    if (unknown.length) {
      problems.push(`"${subject}" uses {{${unknown[0]}}}, which is not in the list of merge tags.`);
      continue;
    }
    const folded = subject.toLocaleLowerCase();
    if (seen.has(folded)) {
      problems.push(`"${subject}" repeats the current subject or another one.`);
      continue;
    }
    seen.add(folded);
    usable.push(subject);
  }
  if (usable.length < SUBJECT_COUNT && !problems.length) problems.push(`Give exactly ${SUBJECT_COUNT} subjects.`);
  return { usable: usable.slice(0, SUBJECT_COUNT), problems: usable.length >= SUBJECT_COUNT ? [] : problems };
}

/**
 * @param {{model: import('./generator.js').EmailModel, maxAttempts?: number}} options
 * @returns {(input: SubjectsInput, options?: {signal?: AbortSignal}) => Promise<{subjects: string[], attempts: number}>}
 */
export function createSubjectSuggester({ model, maxAttempts = 2 }) {
  return async function suggestSubjects(input, { signal } = {}) {
    const request = cleanSubjectsInput(input);
    /** @type {import('./generator.js').ModelMessage[]} */
    const messages = [{ role: 'user', content: buildSubjectsPrompt(request) }];
    /** @type {string[]} */
    let best = [];
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      signal?.throwIfAborted();
      let answer;
      try {
        answer = await model({ system: SUBJECTS_SYSTEM_PROMPT, messages, schema: SUBJECTS_SCHEMA, signal, task: 'subjects' });
      } catch (error) {
        if (error instanceof EmailGenerationError && error.code === 'REFUSED') throw new EmailGenerationError('SUBJECTS_REFUSED');
        throw error;
      }
      const { usable, problems } = reviewSubjects(parseSubjects(answer), request);
      if (usable.length > best.length) best = usable;
      if (!problems.length) return { subjects: usable, attempts: attempt };
      messages.push(
        { role: 'assistant', content: String(answer) },
        { role: 'user', content: `Fix these problems and answer the three subjects again:\n${problems.map((p) => `- ${p}`).join('\n')}` }
      );
    }
    // Fewer than three good ones is still worth showing.
    if (best.length) return { subjects: best, attempts: Math.max(1, maxAttempts) };
    throw new EmailGenerationError('SUBJECTS_UNUSABLE');
  };
}
