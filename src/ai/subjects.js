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

import { DEFAULT_VARIABLES } from '../features/variables/catalog.js';
import { EmailGenerationError, languageName } from './errors.js';

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
 *   variables?: {key: string, label?: string, kind?: string}[],
 *   avoid?: string[],
 * }} SubjectsInput
 *   `text`: the words of the email (`emailWords`); `language`: the one of the
 *   interface, used when the email has no words yet and its subject does not
 *   tell; `variables`: a link variable (`kind: 'link'`) is never offered;
 *   `avoid`: ideas already shown ("More ideas" asks for new ones).
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

/** Quotes that wrap a whole subject, opening → closing. */
const WRAPPING_QUOTES = { '"': '"', "'": "'", '«': '»', '“': '”', '„': '“', '‘': '’', '‹': '›' };

/** The HTML a model may wrap words in; `<live>` in a subject is a word. */
const MARKUP = /<\/?(?:a|abbr|b|big|br|code|del|div|em|font|h[1-6]|i|ins|li|mark|ol|p|q|s|small|span|strike|strong|sub|sup|u|ul)\b[^<>]*>/gi;

/**
 * One line of plain text: markup tags removed (not a lone `<` or `>`), quotes
 * removed only when one pair wraps the whole line.
 * @param {unknown} value
 */
const line = (value) => {
  let text = String(value ?? '')
    .replace(MARKUP, '')
    .replace(/\s+/g, ' ')
    .trim();
  const close = WRAPPING_QUOTES[/** @type {keyof typeof WRAPPING_QUOTES} */ (text[0])];
  if (close && text.length > 2 && text.endsWith(close) && !text.slice(1, -1).includes(close) && !text.slice(1, -1).includes(text[0])) {
    text = text.slice(1, -1).trim();
  }
  return text.slice(0, MAX_SUBJECT_LENGTH);
};

/** Named entities emails use; the others are left as written. */
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', bdquo: '„', sbquo: '‚',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', times: '×', shy: '',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', aacute: 'á', acirc: 'â', auml: 'ä', atilde: 'ã', aring: 'å',
  ccedil: 'ç', iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï', oacute: 'ó', ograve: 'ò', ocirc: 'ô', ouml: 'ö', otilde: 'õ', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü', ntilde: 'ñ', szlig: 'ß', aelig: 'æ', oelig: 'œ', yuml: 'ÿ',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', Ccedil: 'Ç', Ocirc: 'Ô', Ouml: 'Ö',
  Uuml: 'Ü', Ntilde: 'Ñ', OElig: 'Œ', AElig: 'Æ', iexcl: '¡', iquest: '¿',
};

/** One entity, decoded once; an unknown or impossible one as written. @param {string} whole @param {string} body */
const entity = (whole, body) => {
  if (body[0] !== '#') return Object.hasOwn(ENTITIES, body) ? ENTITIES[/** @type {keyof typeof ENTITIES} */ (body)] : whole;
  const code = /^#x/i.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
};

/**
 * The words of an email, as a reader sees them: the head, the styles and the
 * markup left out.
 * @param {string} mjml
 */
export function emailWords(mjml) {
  return visibleText(String(mjml || '').replace(/<mj-head[\s\S]*?<\/mj-head>/gi, ' ')).slice(0, MAX_EMAIL_WORDS);
}

/**
 * The words of a piece of markup as a reader sees them: one line per
 * paragraph, entities decoded, styles and scripts left out.
 * @param {string} markup
 */
export function visibleText(markup) {
  return String(markup || '')
    .replace(/<(style|script|mj-style|mj-raw)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|mj-text|mj-button|mj-navbar-link|mj-social-element)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    // One pass: `&amp;#65;` stays `&#65;`, as the reader sees it.
    .replace(/&(#\d{1,8}|#x[0-9a-f]{1,8}|[a-z]{2,8});/gi, entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
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
  const language = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(String(source.language || '')) ? String(source.language).toLowerCase() : 'en';
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
    text ? null : `The email has no words yet: write in the language of its subject (${languageName(language)} if the subject does not tell).`,
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
 * styled that way on purpose (iPhone, eBay). An opening ¿ or « is skipped.
 * @param {string} subject @param {string} [language]
 */
const capitalized = (subject, language) => {
  const at = /^[¿¡«"“„'‘(\s]*/.exec(subject)?.[0].length ?? 0;
  const first = subject.slice(at).split(/\s/)[0];
  if (!/^\p{Ll}/u.test(first) || /\p{Lu}/u.test(first)) return subject;
  let upper;
  try {
    upper = subject[at].toLocaleUpperCase(language);
  } catch {
    upper = subject[at].toUpperCase();
  }
  return subject.slice(0, at) + upper + subject.slice(at + 1);
};

/**
 * A line of prose that is not a subject: an introduction ("Here are three
 * subjects:"), JSON punctuation, a line with no word.
 * @param {string} row
 */
const notASubject = (row) => {
  const words = row.replace(/\{\{[^{}]*\}\}/g, '');
  return /[:：]$/.test(row) || (words.match(/\p{L}/gu) || []).length < 2 || /^[[\]{}]|[{}[\]],?$/.test(words);
};

/**
 * The subjects in a model's answer: the strings of its JSON field
 * `subjects`; an answer that is no JSON at all, one per line (list marks,
 * quotes and introductions left out). JSON without that field gives none —
 * the model is asked again.
 * @param {string} answer @param {string} [language] the email's, for the capital letter
 */
export function parseSubjects(answer, language) {
  const source = String(answer ?? '').trim();
  const unfenced = source.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  const shape = (/** @type {unknown[]} */ items) =>
    items.filter((item) => typeof item === 'string').map((subject) => capitalized(line(subject), language));
  const start = unfenced.indexOf('{');
  if (start !== -1) {
    const end = unfenced.lastIndexOf('}');
    try {
      const data = JSON.parse(unfenced.slice(start, end + 1));
      return Array.isArray(data?.subjects) ? shape(data.subjects) : [];
    } catch {
      return [];
    }
  }
  const rows = unfenced.split('\n').map((row) => row.trim()).filter(Boolean);
  const marked = /^(?:[-*•]|\d+[.)])\s+/;
  // A list among sentences: only the list.
  const listed = rows.filter((row) => marked.test(row));
  return shape((listed.length ? listed : rows).map((row) => line(row.replace(marked, ''))).filter((row) => !notASubject(row)));
}

/** @param {string} text */
const keysOf = (text) => [...text.matchAll(/\{\{\s*([^}|]+?)\s*(?:\|[^}]*)?\}\}/g)].map((match) => match[1]);

/** Merge tags written for other tools: Mailchimp, Sendinblue, single braces. */
const FOREIGN_TAG = /\*\|[^|]+\|\*|%[A-Za-z_][\w.]*%|(?<!\{)\{[A-Za-z_][\w.]*\}(?!\})/;
/** Longer than any inbox shows. */
export const MAX_SUBJECT_SHOWN = 90;

/**
 * The usable subjects, and what is wrong with the others (for the model).
 * Left out: a repeat (of the current subject, the preview text, an idea
 * already shown or another one), a merge tag the list does not have or one
 * written for another tool, a word in capitals the email does not have, more
 * than one "!", a subject longer than an inbox shows.
 * @param {string[]} subjects @param {ReturnType<typeof cleanSubjectsInput>} request
 */
export function reviewSubjects(subjects, request) {
  const known = new Set(request.variables.map((variable) => variable.key));
  const seen = new Set([request.subject, request.preheader, ...request.avoid].filter(Boolean).map((subject) => subject.toLocaleLowerCase()));
  const source = `${request.subject}\n${request.preheader}\n${request.text}`;
  /** @type {string[]} */
  const usable = [];
  /** @type {string[]} */
  const problems = [];
  for (const subject of subjects) {
    if (!subject) continue;
    const unknown = keysOf(subject).filter((key) => !known.has(key));
    const foreign = FOREIGN_TAG.exec(subject)?.[0];
    const shouting = (subject.replace(/\{\{[^}]*\}\}/g, '').match(/\b\p{Lu}{4,}\b/gu) || []).find((word) => !source.includes(word));
    const problem = unknown.length
      ? `"${subject}" uses {{${unknown[0]}}}, which is not in the list of merge tags.`
      : foreign
        ? `"${subject}" writes ${foreign}: merge tags are written {{key}}, from the list only.`
        : subject.length > MAX_SUBJECT_SHOWN
          ? `"${subject}" is ${subject.length} characters long: 70 at most.`
          : shouting
            ? `"${subject}" writes ${shouting} in capitals.`
            : (subject.match(/!/g) || []).length > 1
              ? `"${subject}" has more than one "!".`
              : seen.has(subject.toLocaleLowerCase())
                ? `"${subject}" repeats the current subject, the preview text or another one.`
                : null;
    if (problem) {
      problems.push(problem);
      continue;
    }
    seen.add(subject.toLocaleLowerCase());
    usable.push(subject);
  }
  if (usable.length < SUBJECT_COUNT && !problems.length) problems.push(`Give exactly ${SUBJECT_COUNT} subjects, in the JSON field "subjects".`);
  return { usable: usable.slice(0, SUBJECT_COUNT), problems: usable.length >= SUBJECT_COUNT ? [] : problems };
}

/**
 * @param {{model: import('./generator.js').EmailModel, maxAttempts?: number}} options
 * @returns {(input: SubjectsInput, options?: {signal?: AbortSignal, user?: any}) => Promise<{subjects: string[], attempts: number}>}
 */
export function createSubjectSuggester({ model, maxAttempts = 2 }) {
  return async function suggestSubjects(input, { signal, user } = {}) {
    const request = cleanSubjectsInput(input);
    /** @type {import('./generator.js').ModelMessage[]} */
    const messages = [{ role: 'user', content: buildSubjectsPrompt(request) }];
    /** @type {string[]} */
    let best = [];
    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      signal?.throwIfAborted();
      let answer;
      try {
        answer = await model({ system: SUBJECTS_SYSTEM_PROMPT, messages, schema: SUBJECTS_SCHEMA, signal, task: 'subjects', user });
      } catch (error) {
        if (error instanceof EmailGenerationError && error.code === 'REFUSED') throw new EmailGenerationError('SUBJECTS_REFUSED');
        throw error;
      }
      const { usable, problems } = reviewSubjects(parseSubjects(answer, request.language), request);
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
