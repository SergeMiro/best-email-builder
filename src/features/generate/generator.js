// @ts-check
/**
 * EMAIL GENERATOR — from a purpose (and optional details) to an email the
 * builder opens block by block.
 *
 *   const generator = createEmailGenerator({ model: claudeEmailModel({ client: new Anthropic() }) });
 *   const { name, subject, preheader, mjml } = await generator.generate({ purpose: 'password-reset', language: 'fr' });
 *
 * The MODEL is any function `({system, messages, schema, signal}) => text`:
 * `claudeEmailModel` (claude.js) for Claude, or a few lines of your own for
 * another provider. Its answer is read, cleaned (`draft.js`) and checked; when
 * a problem remains, the model gets ONE more turn with the list of problems
 * (`maxAttempts`, 2 by default) — a slow model call is the cost of a retry.
 *
 * Never trusted as is: the MJML that comes out has passed `validateMjml`, the
 * same check the server runs before compiling and saving.
 *
 * The same model also REWRITES one text of an email (`rewrite`, see
 * rewrite.js): shorter, longer, fixed, another tone, translated.
 */

import { DEFAULT_VARIABLES } from '../variables/catalog.js';
import { isSafeUrl } from '../../validation/urls.js';
import { EmailGenerationError, normalizeGeneratedMjml, parseDraft, reviewDraft } from './draft.js';
import { EMAIL_DRAFT_SCHEMA, SYSTEM_PROMPT, buildRepairPrompt, buildUserPrompt } from './prompt.js';
import { purposeById } from './purposes.js';
import { createRewriter } from './rewrite.js';

/**
 * @typedef {{role: 'user'|'assistant', content: string}} ModelMessage
 * @typedef {(request: {system: string, messages: ModelMessage[], schema: object, signal?: AbortSignal, task?: 'generate'|'rewrite'}) => Promise<string>} EmailModel
 *   `task`: a whole email, or one text rewritten (a lighter job: a model may
 *   answer it with less effort).
 *
 * @typedef {{
 *   purpose?: string|null,
 *   details?: string,
 *   language?: string,
 *   sender?: {name?: string, address?: string, logoUrl?: string},
 *   variables?: {key: string, label?: string}[],
 * }} GenerateInput
 *
 * @typedef {import('./draft.js').EmailDraft & {warnings: string[], attempts: number}} GeneratedEmail
 */

export const MAX_DETAILS_LENGTH = 2000;
const MAX_VARIABLES = 200;

/** @param {unknown} value @param {number} max */
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * The input as the generator uses it: bounded strings, a known purpose or
 * none, an https logo or none.
 * @param {GenerateInput} input
 */
export function cleanGenerateInput(input) {
  const source = input && typeof input === 'object' ? input : {};
  const purpose = purposeById(typeof source.purpose === 'string' ? source.purpose : null);
  const details = text(source.details, MAX_DETAILS_LENGTH);
  const language = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(source.language || '')) ? String(source.language) : 'en';
  const sender = source.sender && typeof source.sender === 'object' ? source.sender : {};
  const logoUrl = text(sender.logoUrl, 2000);
  const variables = (Array.isArray(source.variables) ? source.variables : DEFAULT_VARIABLES)
    .filter((variable) => variable && /^[A-Za-z][\w.]*$/.test(String(variable.key)))
    .slice(0, MAX_VARIABLES)
    .map((variable) => ({ key: String(variable.key), label: text(variable.label, 80) }));
  return {
    purpose,
    details,
    language,
    sender: {
      name: text(sender.name, 120),
      address: text(sender.address, 300),
      logoUrl: logoUrl && /^https:\/\//i.test(logoUrl) && isSafeUrl(logoUrl, 'image') ? logoUrl : '',
    },
    variables,
  };
}

/**
 * @param {{
 *   model: EmailModel,
 *   maxAttempts?: number,
 *   compile?: (mjml: string) => Promise<{warnings?: {message: string}[]}>,
 * }} options
 *   `compile`: compiles the MJML and returns MJML's own warnings, fed back to
 *   the model (the server passes `compileMjml`).
 */
export function createEmailGenerator({ model, maxAttempts = 2, compile } = /** @type {any} */ ({})) {
  if (typeof model !== 'function') throw new Error('createEmailGenerator: `model` must be a function');

  /**
   * @param {GenerateInput} input
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<GeneratedEmail>}
   */
  async function generate(input, { signal } = {}) {
    const request = cleanGenerateInput(input);
    if (!request.purpose && !request.details) {
      throw new EmailGenerationError('NOTHING_TO_GENERATE');
    }
    const kind = request.purpose?.kind || 'marketing';
    const keepImages = request.sender.logoUrl ? [request.sender.logoUrl] : [];

    /** @type {ModelMessage[]} */
    const messages = [{ role: 'user', content: buildUserPrompt(request) }];
    /** @type {GeneratedEmail|null} */
    let usable = null;
    let lastProblem = '';

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt += 1) {
      signal?.throwIfAborted();
      const answer = await model({ system: SYSTEM_PROMPT, messages, schema: EMAIL_DRAFT_SCHEMA, signal, task: 'generate' });
      /** @type {string[]} */
      let problems;
      try {
        const draft = parseDraft(answer);
        draft.mjml = normalizeGeneratedMjml(draft.mjml, { variables: request.variables, keepImages });
        const compileWarnings = compile ? (await compile(draft.mjml)).warnings || [] : [];
        const { blocking, advice } = reviewDraft(draft, { kind, compileWarnings });
        if (!blocking.length) {
          usable = { ...draft, warnings: advice, attempts: attempt };
          if (!advice.length) return usable;
        }
        problems = [...blocking, ...advice];
      } catch (error) {
        if (!(error instanceof EmailGenerationError)) throw error;
        problems = [error.detail];
      }
      lastProblem = problems[0];
      messages.push({ role: 'assistant', content: String(answer) }, { role: 'user', content: buildRepairPrompt(problems) });
    }

    if (usable) return usable;
    throw new EmailGenerationError('INVALID_OUTPUT', lastProblem);
  }

  return { generate, rewrite: createRewriter({ model, maxAttempts }) };
}
