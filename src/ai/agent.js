// @ts-check
/**
 * YOUR OWN AI AGENT — the assistant an application already has (its tools,
 * its knowledge, its rights) writes and rewrites the builder's texts,
 * proofreads its emails and suggests their subjects, instead of a model
 * called directly.
 *
 *   // On the server: the handler's AI routes, the agent behind them.
 *   createEmailBuilderHandler({
 *     …,
 *     generator: createEmailGenerator({
 *       model: agentEmailModel({
 *         url: 'http://agent.internal/email-builder',
 *         headers: ({ user }) => ({ Authorization: `Bearer ${user.token}` }),
 *       }),
 *     }),
 *   });
 *   // and in the page: createAi({ baseUrl: '/api/email-builder' })
 *
 *   // Or in the page, through a route of the application that adds the session:
 *   createAi({ model: agentEmailModel({ url: '/api/agent/email-builder' }) })
 *
 * THE PROTOCOL, `best-email-builder/agent@1`: one POST per model turn.
 *
 *   → { protocol, task, system, messages, schema }
 *       task      'rewrite' (one text written or rewritten, or the email's
 *                 texts proofread) | 'subjects' (subject ideas)
 *       system    the instructions, the answer format included: a model
 *                 given `system` and `messages` as they are answers right
 *       messages  [{ role: 'user'|'assistant', content }]; a repair turn adds
 *                 the last answer and the problems found in it
 *       schema    the JSON schema of the answer, for structured output
 *   ← 200 { text: '<the answer, JSON>' }  or  { output: {…the answer} }
 *   ← 4xx/5xx { error: 'what happened', code?: 'REFUSED' | 'MODEL_BUSY' | … }
 *
 * The agent decides how to answer: one model call, or its own tools first (a
 * knowledge base, the customer's data). Its answer is then treated as any
 * model's — read, checked, and sent back once for repair when it has
 * problems — so the agent needs to know nothing of email markup.
 *
 * WHO ASKS is never in the body (an agent must not trust it): on the server,
 * `headers({ task, user })` gets the user the handler's `authorize` returned,
 * to forward the identity the agent applies its rights with.
 *
 * The agent's side: `createAgentEndpoint` (agentEndpoint.js) for an agent in
 * JavaScript, the FastAPI router of examples/agent for one in Python; and
 * `checkAgent` to try an agent with the builder's own checks.
 */

import { EmailGenerationError } from './errors.js';
import { answerInstruction } from './providers.js';

export const AGENT_PROTOCOL = 'best-email-builder/agent@1';

/** The errors an agent can name; any other is read from the status. */
export const AGENT_ERROR_CODES = Object.freeze(['REFUSED', 'TRUNCATED', 'MODEL_UNAVAILABLE', 'MODEL_CREDITS', 'MODEL_BUSY', 'MODEL_ERROR']);

/** Three minutes: an agent may search before it writes. */
const DEFAULT_TIMEOUT = 180_000;

/**
 * @typedef {{task: 'rewrite'|'subjects', user?: any}} AgentCallContext
 * @typedef {Record<string, string> | ((context: AgentCallContext) => Record<string, string> | Promise<Record<string, string>>)} AgentHeaders
 */

/** @param {number} status @returns {'MODEL_BUSY'|'MODEL_ERROR'} */
const statusCode = (status) => (status === 429 || status === 503 || status === 504 || status === 529 ? 'MODEL_BUSY' : 'MODEL_ERROR');

/** @param {unknown} code @returns {code is typeof AGENT_ERROR_CODES[number]} */
const isAgentCode = (code) => typeof code === 'string' && AGENT_ERROR_CODES.includes(/** @type {any} */ (code));

/** @param {any} data @returns {string} */
const errorText = (data) => {
  const error = data?.error ?? data?.detail;
  if (typeof error === 'string') return error;
  return String(error?.message || (error ? JSON.stringify(error) : ''));
};

/**
 * @param {{
 *   url: string,
 *   headers?: AgentHeaders,
 *   fetch?: typeof fetch,
 *   timeout?: number,
 *   name?: string,
 * }} options
 *   `headers`: added to each request — or a function of `{ task, user }` that
 *   gives them (a token signed for that user). `timeout`: the longest wait
 *   for one answer, in ms (3 minutes; 0 for none). `name`: the agent's, in
 *   the details of its errors.
 * @returns {import('./generator.js').EmailModel & {url: string}}
 */
export function agentEmailModel(options) {
  const { url, headers, fetch: fetchImpl, timeout = DEFAULT_TIMEOUT, name = 'Agent' } = options || /** @type {any} */ ({});
  if (typeof url !== 'string' || !url) throw new TypeError('agentEmailModel: `url` is required — the endpoint of your agent');
  if (headers !== undefined && typeof headers !== 'function' && (typeof headers !== 'object' || headers === null)) {
    throw new TypeError('agentEmailModel: `headers` is an object, or a function of { task, user } that returns one');
  }

  /** @type {import('./generator.js').EmailModel} */
  const emailModel = async ({ system, messages, schema, signal, task = 'rewrite', user }) => {
    const call = fetchImpl || globalThis.fetch;
    const own = typeof headers === 'function' ? await headers({ task, user }) : headers;
    signal?.throwIfAborted();

    // The caller's signal (the user closed the dialog) and the timeout, as one.
    const controller = new AbortController();
    const stop = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', stop, { once: true });
    let late = false;
    const timer = timeout > 0 ? setTimeout(() => ((late = true), controller.abort()), timeout) : null;

    /** @type {Response} */
    let response;
    let text;
    try {
      response = await call(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...own },
        body: JSON.stringify({ protocol: AGENT_PROTOCOL, task, system: system + answerInstruction(schema), messages, schema }),
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (late) throw new EmailGenerationError('MODEL_BUSY', `${name}: no answer after ${Math.round(timeout / 1000)} s`);
      throw new EmailGenerationError('MODEL_ERROR', `${name}: ${/** @type {any} */ (error)?.message || error}`);
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
    }

    /** @type {any} */
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON: the answer itself, as text — unless the agent failed.
    }
    if (!response.ok || (data && typeof data === 'object' && 'error' in data && !('text' in data) && !('output' in data))) {
      const said = data ? errorText(data) : text;
      const detail = `${name} ${response.status}: ${said.slice(0, 300)}`;
      throw new EmailGenerationError(isAgentCode(data?.code) ? data.code : statusCode(response.ok ? 502 : response.status), detail);
    }
    if (typeof data?.text === 'string') return data.text;
    if (data?.output && typeof data.output === 'object') return JSON.stringify(data.output);
    // The answer as the whole body (the agent passed its model's text on).
    return text;
  };
  return Object.assign(emailModel, { url });
}
