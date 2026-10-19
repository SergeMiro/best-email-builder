// @ts-check
/**
 * THE AGENT'S SIDE of `best-email-builder/agent@1` (see agent.js), for an
 * agent written in JavaScript — and `checkAgent`, to try any agent with the
 * builder's own checks before plugging it in.
 *
 *   const endpoint = createAgentEndpoint({
 *     complete: async ({ task, system, messages, schema, request }) => {
 *       const who = await sessionOf(request);           // your rights
 *       return myAgent.answer({ system, messages, who }); // text, or the answer as an object
 *     },
 *   });
 *   // Next.js: export const POST = endpoint;   Express: app.post('/email-builder', toNodeListener(endpoint))
 *
 *   const report = await checkAgent({ url: 'http://localhost:8800/email-builder', headers });
 *   // { ok, results: [{ task: 'proofread', ok, ms, attempts, sample }, …] }
 */

import { AGENT_ERROR_CODES, AGENT_PROTOCOL, agentEmailModel } from './agent.js';
import { GENERATION_ERRORS } from './errors.js';
import { createEmailGenerator } from './generator.js';

const TASKS = ['rewrite', 'subjects'];
/** A repair turn carries the last answer: the texts of an email at most. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_MESSAGES = 20;

/**
 * @typedef {{
 *   task: 'rewrite'|'subjects',
 *   system: string,
 *   messages: {role: 'user'|'assistant', content: string}[],
 *   schema: object,
 *   request: Request,
 *   signal: AbortSignal,
 * }} AgentTask
 */

/** @param {unknown} body @param {number} status */
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/** @param {string} error @param {string} code @param {number} status */
const refuse = (error, code, status) => json({ error, code }, status);

/**
 * What the builder sent, checked; or why not.
 * @param {any} body
 * @returns {string|null} the problem
 */
function problemOf(body) {
  if (!body || typeof body !== 'object') return 'The body is not a JSON object';
  if (body.protocol !== AGENT_PROTOCOL) return `Unsupported protocol ${JSON.stringify(body.protocol)} — this endpoint speaks ${AGENT_PROTOCOL}`;
  if (!TASKS.includes(body.task)) return `Unknown task ${JSON.stringify(body.task)}`;
  if (typeof body.system !== 'string') return '`system` must be a string';
  if (!body.schema || typeof body.schema !== 'object') return '`schema` must be an object';
  const { messages } = body;
  if (!Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES) return `\`messages\` must hold 1 to ${MAX_MESSAGES} messages`;
  for (const message of messages) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') {
      return 'Each message is { role: "user"|"assistant", content: string }';
    }
  }
  return null;
}

/**
 * @param {{
 *   complete: (task: AgentTask) => Promise<string | object> | string | object,
 *   onError?: (error: unknown, request: Request) => void,
 * }} options
 *   `complete`: your agent. It answers with the text of its model, or with
 *   the answer as an object. To fail with a reason the builder explains, throw
 *   an error whose `code` is one of AGENT_ERROR_CODES ('REFUSED',
 *   'MODEL_BUSY'…); any other error is logged with `onError` and answered as
 *   MODEL_ERROR, its message kept out of the response.
 * @returns {(request: Request) => Promise<Response>}
 */
export function createAgentEndpoint({ complete, onError = (error) => console.error('[agent]', error) } = /** @type {any} */ ({})) {
  if (typeof complete !== 'function') throw new TypeError('createAgentEndpoint: `complete` must be a function — your agent');

  return async function agentEndpoint(request) {
    if (request.method.toUpperCase() !== 'POST') return refuse('POST only', 'METHOD_NOT_ALLOWED', 405);
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return refuse('Request too large', 'TOO_LARGE', 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return refuse('Request too large', 'TOO_LARGE', 413);
    /** @type {any} */
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return refuse('Invalid JSON', 'INVALID_JSON', 400);
    }
    const problem = problemOf(body);
    if (problem) return refuse(problem, 'INVALID_REQUEST', 400);

    try {
      const answer = await complete({
        task: body.task,
        system: body.system,
        messages: body.messages.map((/** @type {any} */ m) => ({ role: m.role, content: m.content })),
        schema: body.schema,
        request,
        signal: request.signal,
      });
      if (typeof answer === 'string') return json({ text: answer });
      if (answer && typeof answer === 'object') return json({ output: answer });
      return refuse('The agent gave no answer', 'MODEL_ERROR', 502);
    } catch (error) {
      const code = /** @type {any} */ (error)?.code;
      if (AGENT_ERROR_CODES.includes(code)) {
        const known = GENERATION_ERRORS[/** @type {keyof typeof GENERATION_ERRORS} */ (code)];
        return refuse(String(/** @type {any} */ (error)?.detail || /** @type {any} */ (error)?.message || known.message), code, known.status);
      }
      onError(error, request);
      return refuse('The agent could not answer', 'MODEL_ERROR', 502);
    }
  };
}

const SAMPLE_TEXT =
  '<p>Our summer sale starts on Monday: 30% off everything in store, for three days only. ' +
  'It ends on Wednesday at midnight. <a href="https://example.com/sale">See the offers</a>.</p>';

/** An email with three mistakes to find, and one text without. @type {import('./proofread.js').ProofreadText[]} */
const SAMPLE_EMAIL = [
  { id: 'subject', kind: 'subject', format: 'plain', text: 'Our sumer sale starts on Monday' },
  { id: 'text-1', kind: 'text', format: 'html', text: SAMPLE_TEXT },
  { id: 'text-2', kind: 'text', format: 'html', text: '<p>We hope to see you their. <b>Every</b> product are on sale.</p>' },
  { id: 'button-1', kind: 'button', format: 'plain', text: 'See the offers' },
];

/**
 * Tries an agent with the builder's own checks: an email proofread, one text
 * rewritten, subject ideas — in turn, each as the builder would ask it (with
 * its repair turn). Three to six calls to the agent.
 * @param {{
 *   url: string,
 *   headers?: import('./agent.js').AgentHeaders,
 *   user?: any,
 *   fetch?: typeof fetch,
 *   timeout?: number,
 *   language?: string,
 * }} options
 *   `user`: what `headers` gets, as the handler's `authorize` would give it.
 * @returns {Promise<{ok: boolean, results: {task: string, ok: boolean, ms: number, attempts?: number, sample?: unknown, code?: string, error?: string}[]}>}
 */
export async function checkAgent({ url, headers, user, fetch: fetchImpl, timeout, language = 'en' }) {
  const model = agentEmailModel({ url, headers, fetch: fetchImpl, timeout });
  const generator = createEmailGenerator({ model });
  /** @type {[string, () => Promise<any>, (result: any) => unknown][]} */
  const steps = [
    ['proofread', () => generator.proofread({ texts: SAMPLE_EMAIL, language }, { user }), (r) => r.fixes],
    ['rewrite', () => generator.rewrite({ action: 'shorter', text: SAMPLE_TEXT, format: 'html' }, { user }), (r) => r.text],
    [
      'subjects',
      () => generator.suggestSubjects({ subject: 'Summer sale: 30% off', text: 'Our summer sale starts on Monday: 30% off everything in store, for three days only.', language }, { user }),
      (r) => r.subjects,
    ],
  ];
  const results = [];
  for (const [task, run, sampleOf] of steps) {
    const started = Date.now();
    try {
      const result = await run();
      results.push({ task, ok: true, ms: Date.now() - started, attempts: result.attempts, sample: sampleOf(result) });
    } catch (error) {
      const failure = /** @type {any} */ (error);
      results.push({ task, ok: false, ms: Date.now() - started, code: failure?.code || 'ERROR', error: String(failure?.detail || failure?.message || error) });
    }
  }
  return { ok: results.every((result) => result.ok), results };
}
