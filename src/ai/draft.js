// @ts-check
/**
 * A GENERATED EMAIL, made fit for the builder.
 *
 * A model follows the prompt most of the time, not always. What it gets
 * wrong in a way that can be fixed without asking it again is fixed here:
 *
 *   the answer        JSON found inside code fences or prose; a bare MJML
 *                     document is accepted too; markup escaped twice
 *                     (`width=\\"600px\\"`, some models do it) is decoded once more;
 *   padding="..."     rewritten as the four longhand attributes the panel and
 *                     the canvas read (see core/mjmlAttributes);
 *   structure         content outside a column is put in one, a column outside
 *                     a section too; `mj-hero`, `mj-wrapper` and `mj-group`
 *                     become plain sections and columns (the canvas draws
 *                     them wrong or the panel cannot edit them); `mj-head`,
 *                     classes and CSS are removed;
 *   images            every source is emptied, except the sender's logo: a
 *                     stock photo from a third-party service would end up in
 *                     a real send one day;
 *   MJML in a text    an `<mj-image>` put inside an `mj-text` (dead HTML
 *                     there: no picture, nothing to fill) becomes an image
 *                     block next to the text; other `<mj-…>` tags are dropped;
 *   buttons           words that do not read on the fill (a text color given,
 *                     the fill forgotten: MJML's is dark grey) become white
 *                     or ink;
 *   illegal attributes  those MJML reports (`align` on a column) are removed
 *                     by the generator after compiling (`withoutIllegalAttributes`);
 *   variables         a `{{tag}}` the catalog does not know becomes a
 *                     `[placeholder]` the user sees and replaces (an https
 *                     example link inside a URL).
 *
 * What cannot be fixed here (forbidden HTML, a missing unsubscribe link) is
 * listed by `reviewDraft` and sent back to the model.
 *
 * Dependency-free apart from the engine's MJML reader: runs in the browser,
 * on the server and in unit tests.
 */

import { parseMjml, parseMjmlFragment, serializeMjml } from '../engine/mjml.js';
import { createId, createNode } from '../engine/model.js';
import { LONGHAND_SPACING, SIDES, parseSpacing } from '../core/mjmlAttributes.js';
import { PALETTE } from '../blocks/shared.js';
import { MJML_DEFAULTS } from '../core/mjmlDefaults.js';
import { contrastRatio, parseColor, readableOn } from '../features/brand/brand.js';
import { validateMjml } from '../validation/mjmlValidator.js';

/**
 * @typedef {import('../engine/model.js').EmailNode} EmailNode
 * @typedef {{name: string, subject: string, preheader: string, mjml: string}} EmailDraft
 */

/**
 * Why a generation failed, in English keys the interface translates. Status:
 * the HTTP status the server answers with.
 */
export const GENERATION_ERRORS = {
  NOTHING_TO_GENERATE: { status: 400, message: 'Pick what the email is for, or describe it.' },
  REFUSED: { status: 422, message: 'The AI declined to write this email. Try other details.' },
  TRUNCATED: { status: 502, message: 'The email was too long to finish. Ask for a shorter one.' },
  INVALID_ANSWER: { status: 502, message: 'The AI answer could not be read. Try again.' },
  INVALID_OUTPUT: { status: 502, message: 'The generated email could not be used. Try again.' },
  NOTHING_TO_REWRITE: { status: 400, message: 'There is no text to rewrite.' },
  REWRITE_REFUSED: { status: 422, message: 'The AI declined to rewrite this text.' },
  REWRITE_UNUSABLE: { status: 502, message: 'The rewritten text lost a link or a variable, so nothing was changed. Try again.' },
  NOTHING_TO_SUGGEST: { status: 400, message: 'Write the email or a subject first: the ideas are drawn from it.' },
  SUBJECTS_REFUSED: { status: 422, message: 'The AI declined to suggest subjects for this email.' },
  SUBJECTS_UNUSABLE: { status: 502, message: 'No usable subject came back. Try again.' },
  // The provider's side (providers.js). Never 401 to the browser: the key is the AI's, not the user's session.
  KEY_MISSING: { status: 502, message: 'Connect an AI provider first: it needs a key.' },
  KEY_REFUSED: { status: 502, message: 'The AI provider refused the key. Check it, or use another one.' },
  MODEL_UNAVAILABLE: { status: 502, message: 'The AI provider does not have this model. Choose another one.' },
  MODEL_CREDITS: { status: 502, message: 'The AI provider account has no credits left.' },
  MODEL_BUSY: { status: 503, message: 'The AI is busy right now. Try again in a minute.' },
  MODEL_ERROR: { status: 502, message: 'The AI provider could not answer. Try again.' },
};

export class EmailGenerationError extends Error {
  /**
   * @param {keyof typeof GENERATION_ERRORS} code
   * @param {string} [detail]  what went wrong, for logs and for the model
   */
  constructor(code, detail = '') {
    const known = GENERATION_ERRORS[code] || GENERATION_ERRORS.INVALID_OUTPUT;
    super(known.message);
    this.name = 'EmailGenerationError';
    this.code = code;
    this.status = known.status;
    this.detail = detail || known.message;
  }
}

/* ── The answer ──────────────────────────────────────────────────────────── */

const LIMITS = { name: 80, subject: 150, preheader: 200 };

/** One line of plain text: no tags, no line breaks, bounded. @param {unknown} value @param {number} max */
function plainLine(value, max) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * The email in a model's answer.
 * @param {string} text
 * @returns {EmailDraft}
 */
/**
 * Markup a model escaped twice — `<mj-text align=\\"center\\">` once the JSON
 * is read — decoded once more. Markup with real quotes is left as it is.
 * @param {string} markup
 */
export function unescapedTwice(markup) {
  if (!/=\\"/.test(markup) || /=\s*"/.test(markup.replace(/=\\"/g, ''))) return markup;
  try {
    const decoded = JSON.parse(`"${markup}"`);
    if (typeof decoded === 'string') return decoded;
  } catch {
    // Not a JSON string body (a raw line break…): the quotes alone.
  }
  return markup.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

export function parseDraft(text) {
  const source = String(text ?? '').trim();
  const unfenced = source.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
  /** @type {any} */
  let data = null;
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      data = JSON.parse(unfenced.slice(start, end + 1));
    } catch {
      data = null;
    }
  }
  if (!data && /^<mjml[\s>]/i.test(unfenced)) data = { mjml: unfenced };
  if (!data || typeof data.mjml !== 'string' || !data.mjml.trim()) {
    throw new EmailGenerationError('INVALID_ANSWER', 'The answer is not the expected JSON object with an "mjml" field.');
  }
  return {
    name: plainLine(data.name, LIMITS.name),
    subject: plainLine(data.subject, LIMITS.subject),
    preheader: plainLine(data.preheader, LIMITS.preheader),
    mjml: unescapedTwice(data.mjml.trim()),
  };
}

/* ── The MJML ────────────────────────────────────────────────────────────── */

const CONTENT_TAGS = new Set(['mj-text', 'mj-image', 'mj-button', 'mj-divider', 'mj-spacer', 'mj-social', 'mj-navbar', 'mj-table']);
const REMOVED_TAGS = new Set(['mj-head', 'mj-raw', 'mj-style', 'mj-font', 'mj-include', 'mj-attributes']);
const REMOVED_ATTRIBUTES = ['css-class', 'mj-class'];
/** Attributes that take a length: a bare number is read as pixels. */
const PIXEL_ATTRIBUTES = new Set(['font-size', 'border-radius', 'icon-size', 'height', 'width', 'letter-spacing']);
/** Section attributes kept when an `mj-hero` becomes a section. */
const HERO_KEPT = ['background-color', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding', 'border-radius'];

const whiteSection = (/** @type {EmailNode[]} */ children) =>
  createNode('mj-section', { attributes: { 'background-color': PALETTE.surface }, children });
const column = (/** @type {EmailNode[]} */ children) => createNode('mj-column', { children });

/**
 * Attributes as the builder writes them.
 * @param {EmailNode} node @param {Set<string>} keepImages
 */
function cleanAttributes(node, keepImages) {
  const attributes = { ...node.attributes };
  for (const name of REMOVED_ATTRIBUTES) delete attributes[name];
  for (const key of LONGHAND_SPACING) {
    if (attributes[key] === undefined) continue;
    const sides = parseSpacing(attributes[key]);
    SIDES.forEach((side, i) => {
      const longhand = `${key}-${side}`;
      if (attributes[longhand] === undefined) attributes[longhand] = sides[i];
    });
    delete attributes[key];
  }
  for (const [name, value] of Object.entries(attributes)) {
    const unitless = /^-?\d+(\.\d+)?$/.test(value.trim());
    if (unitless && (PIXEL_ATTRIBUTES.has(name) || /^padding-/.test(name))) attributes[name] = `${value.trim()}px`;
  }
  if (node.tag === 'mj-image' && attributes.src !== undefined && !keepImages.has(attributes.src.trim())) attributes.src = '';
  if (node.tag === 'mj-button') {
    const fill = attributes['background-color'] ?? MJML_DEFAULTS['mj-button']['background-color'];
    const words = attributes.color ?? MJML_DEFAULTS['mj-button'].color;
    if (parseColor(fill) && parseColor(words) && contrastRatio(fill, words) < 3) attributes.color = readableOn(fill);
  }
  delete attributes['background-url'];
  return attributes;
}

/**
 * Groups runs of `isLoose` children into containers made by `wrap`.
 * @param {EmailNode[]} children @param {(node: EmailNode) => boolean} isLoose @param {(nodes: EmailNode[]) => EmailNode} wrap
 */
function wrapLoose(children, isLoose, wrap) {
  /** @type {EmailNode[]} */
  const out = [];
  /** @type {EmailNode[]} */
  let run = [];
  const flush = () => {
    if (run.length) out.push(wrap(run));
    run = [];
  };
  for (const child of children) {
    if (isLoose(child)) run.push(child);
    else {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

/** An `<mj-image>` (self-closing or not), or any other MJML tag, found in HTML. */
const MJML_IN_HTML = /<mj-image\b(?:[^>"']|"[^"]*"|'[^']*')*?(?:\/>|>[\s\S]*?<\/mj-image\s*>)|<\/?mj-[a-z-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

/**
 * A text whose HTML holds MJML: each image becomes a block of its own, in its
 * place between the parts of the text; other MJML tags are dropped, their
 * words kept. A part with no words left is dropped.
 * @param {EmailNode} node @param {Record<string, string>} attributes @param {Set<string>} keepImages
 * @returns {EmailNode[]}
 */
function liftImages(node, attributes, keepImages) {
  const content = String(node.content);
  /** @type {EmailNode[]} */
  const parts = [];
  let text = '';
  const flush = () => {
    if (text.replace(/<[^>]*>|&nbsp;|\s/g, '')) {
      parts.push({ ...node, id: parts.length ? createId() : node.id, attributes, content: text.trim() });
    }
    text = '';
  };
  let last = 0;
  for (const match of content.matchAll(MJML_IN_HTML)) {
    text += content.slice(last, match.index);
    last = (match.index ?? 0) + match[0].length;
    const image = /^<mj-image\b/i.test(match[0]) && parseMjmlFragment(match[0]).find((child) => child.tag === 'mj-image');
    if (!image) continue;
    flush();
    parts.push(...cleanNode(image, keepImages));
  }
  text += content.slice(last);
  flush();
  return parts;
}

/**
 * The node and its subtree, cleaned. Returns a LIST: a removed node gives
 * none, an unwrapped one gives its children.
 * @param {EmailNode} node @param {Set<string>} keepImages
 * @returns {EmailNode[]}
 */
function cleanNode(node, keepImages) {
  if (REMOVED_TAGS.has(node.tag)) return [];
  const children = node.children.flatMap((child) => cleanNode(child, keepImages));
  const attributes = cleanAttributes(node, keepImages);

  if (node.tag === 'mj-wrapper') {
    // Its sections take its place; a background it had goes to those without one.
    return children.map((child) =>
      child.attributes['background-color'] || !attributes['background-color']
        ? child
        : { ...child, attributes: { ...child.attributes, 'background-color': attributes['background-color'] } }
    );
  }
  if (node.tag === 'mj-group') return children;
  if (node.tag === 'mj-hero') {
    const kept = Object.fromEntries(Object.entries(attributes).filter(([name]) => HERO_KEPT.includes(name)));
    const columns = children.some((child) => child.tag === 'mj-column') ? children : [column(children)];
    return [createNode('mj-section', { id: node.id, attributes: { 'background-color': PALETTE.navy, ...kept }, children: columns })];
  }
  if (node.tag === 'mj-section') {
    return [{ ...node, attributes, children: wrapLoose(children, (child) => child.tag !== 'mj-column', column) }];
  }
  if (node.tag === 'mj-body') {
    const sectioned = wrapLoose(children, (child) => child.tag === 'mj-column', (nodes) => whiteSection(nodes));
    const wrapped = wrapLoose(sectioned, (child) => CONTENT_TAGS.has(child.tag), (nodes) => whiteSection([column(nodes)]));
    return [{ ...node, attributes: { 'background-color': PALETTE.canvas, ...attributes, width: '600px' }, children: wrapped }];
  }
  if (typeof node.content === 'string' && /<\/?mj-/i.test(node.content)) {
    if (node.tag === 'mj-text') return liftImages(node, attributes, keepImages);
    return [{ ...node, attributes, children, content: node.content.replace(MJML_IN_HTML, '') }];
  }
  return [{ ...node, attributes, children }];
}

/** "order.number" → "order number". @param {string} key */
const placeholderOf = (key) => `[${key.replace(/[._]+/g, ' ').trim()}]`;

/**
 * Unknown `{{tags}}` replaced: inside a URL attribute by an https example
 * link, elsewhere by a visible `[placeholder]`.
 * @param {string} mjml @param {Set<string>} known
 */
function replaceUnknownVariables(mjml, known) {
  const unknown = (/** @type {string} */ key) => !known.has(key);
  const inUrls = mjml.replace(/\s(href|src)="([^"]*)"/g, (whole, name, value) =>
    /\{\{\s*([A-Za-z][\w.]*)/.test(value) && [...value.matchAll(/\{\{\s*([A-Za-z][\w.]*)/g)].some((m) => unknown(m[1]))
      ? ` ${name}="${name === 'href' ? 'https://example.com' : ''}"`
      : whole
  );
  return inUrls.replace(/\{\{\s*([A-Za-z][\w.]*)\s*(?:\|[^{}]*)?\}\}/g, (whole, key) => (unknown(key) ? placeholderOf(key) : whole));
}

/**
 * The MJML of a generated email, rewritten as the builder writes it.
 *
 * @param {string} mjml
 * @param {{variables?: {key: string}[], keepImages?: string[]}} [options]
 *   `variables`: the catalog (`unsubscribe` is always known);
 *   `keepImages`: image sources kept as they are (the sender's logo).
 */
export function normalizeGeneratedMjml(mjml, { variables = [], keepImages = [] } = {}) {
  const tree = parseMjml(String(mjml || ''));
  const [root] = cleanNode(tree, new Set(keepImages.filter(Boolean)));
  const known = new Set(['unsubscribe', ...variables.map((variable) => variable.key)]);
  return replaceUnknownVariables(serializeMjml(root), known);
}

/**
 * The attributes MJML reports as illegal on a tag (`Attribute align is
 * illegal` on an `mj-column`) removed from every element of that tag: MJML
 * ignores them, and their warning would stay with the email.
 * @param {string} mjml
 * @param {{message: string, tagName?: string}[]} warnings MJML's, from compiling it
 * @returns {string|null} null: none to remove
 */
export function withoutIllegalAttributes(mjml, warnings) {
  /** @type {Map<string, Set<string>>} */
  const illegal = new Map();
  for (const warning of warnings) {
    const name = /Attribute ([\w-]+) is illegal/.exec(warning.message)?.[1];
    const tag = warning.tagName || /\((mj-[\w-]+)\)/.exec(warning.message)?.[1];
    if (name && tag) illegal.set(tag, new Set([...(illegal.get(tag) || []), name]));
  }
  if (!illegal.size) return null;
  /** @param {EmailNode} node @returns {EmailNode} */
  const strip = (node) => {
    const names = illegal.get(node.tag);
    const attributes = names ? Object.fromEntries(Object.entries(node.attributes).filter(([name]) => !names.has(name))) : node.attributes;
    return { ...node, attributes, children: node.children.map(strip) };
  };
  return serializeMjml(strip(parseMjml(mjml)));
}

/* ── Review ──────────────────────────────────────────────────────────────── */

/**
 * What still keeps the email from being used as it is — in English, written
 * for the model that will correct it.
 *
 * @param {EmailDraft} draft
 * @param {{kind?: string, compileWarnings?: {message: string}[]}} [options]
 * @returns {{blocking: string[], advice: string[]}}
 *   `blocking`: the builder must not open it (rejected by the validator);
 *   `advice`: it opens, but is not what was asked.
 */
export function reviewDraft(draft, { kind = 'marketing', compileWarnings = [] } = {}) {
  const blocking = validateMjml(draft.mjml).issues.map((issue) => issue.message);
  /** @type {string[]} */
  const advice = [];
  if (!/<mj-section[\s>]/.test(draft.mjml)) advice.push('The email has no <mj-section>: build it from sections and columns.');
  const unsubscribe = /\{\{\s*unsubscribe\s*\}\}/.test(draft.mjml);
  if (kind !== 'security' && !unsubscribe) {
    advice.push('The footer has no link with href="{{ unsubscribe }}".');
  }
  if (kind === 'security' && unsubscribe) advice.push('A security email must not have an unsubscribe link.');
  if (!draft.subject) advice.push('The subject is empty.');
  if (!draft.preheader) advice.push('The preheader is empty.');
  for (const warning of compileWarnings.slice(0, 8)) advice.push(`MJML: ${warning.message}`);
  return { blocking, advice };
}
