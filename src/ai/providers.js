// @ts-check
/**
 * AI PROVIDERS — the email model of `createEmailGenerator` from a provider's
 * key, no SDK to install.
 *
 *   providerEmailModel({ provider: 'openrouter', apiKey })
 *   providerEmailModel({ provider: 'groq', apiKey, model: 'openai/gpt-oss-120b' })
 *   providerEmailModel({ provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: 'qwen3' })
 *
 * Every provider here speaks the OpenAI "chat completions" API. The answer is
 * asked as structured output (a JSON schema) where the provider has it; one
 * that refuses it is asked for a JSON object, then for plain JSON in the text —
 * once, then remembered. The schema is in the instructions either way, and
 * the generator checks and repairs what comes back.
 *
 * Claude: `claudeEmailModel` (claude.js) with the Anthropic SDK client, or
 * through OpenRouter (`model: 'anthropic/…'`) with one key for every model.
 *
 * Model names change often: each provider's `model` is a default that was
 * current when this package was released; pass your own to be sure.
 *
 * Dependency-free: runs in the browser (a key in the page — prototypes, or a
 * user's own key with `createAi({ askKey: true })`) and on the server.
 */

import { EmailGenerationError } from './draft.js';

/**
 * @typedef {'json_schema'|'json_object'|'text'} AnswerFormat
 * @typedef {{
 *   id: string,
 *   name: string,
 *   baseUrl: string,
 *   model: string|null,
 *   keyUrl: string|null,
 *   keyHint: string,
 *   free: string|null,
 *   format: AnswerFormat,
 *   tokens: 'max_tokens'|'max_completion_tokens',
 *   keyless?: boolean,
 *   headers?: Record<string, string>,
 * }} AiProvider
 *   `model`: the default (null: to be given); `keyUrl`: where a user gets a
 *   key; `keyHint`: what a key starts with; `free`: what can be used without
 *   paying, in a few words (null: paid only); `format`: the best answer format
 *   the provider takes; `tokens`: how it names the output limit.
 */

/** @param {Omit<AiProvider, 'tokens'|'format'> & Partial<Pick<AiProvider, 'tokens'|'format'>>} provider @returns {AiProvider} */
const define = (provider) => Object.freeze({ format: 'json_schema', tokens: 'max_tokens', ...provider });

/** The providers `providerEmailModel` knows, by id. */
export const AI_PROVIDERS = Object.freeze({
  openrouter: define({
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    // A router across the free models of the day.
    model: 'openrouter/free',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-',
    free: 'Free models, with a free account',
    headers: { 'X-Title': 'Best Email Builder' },
  }),
  openai: define({
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5-mini',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-',
    free: null,
    tokens: 'max_completion_tokens',
  }),
  gemini: define({
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza',
    free: 'Free tier, with rate limits',
  }),
  groq: define({
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_',
    free: 'Free tier, with rate limits',
  }),
  mistral: define({
    id: 'mistral',
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys',
    keyHint: '',
    free: 'Free "Experiment" plan',
  }),
  deepseek: define({
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    keyHint: 'sk-',
    free: null,
    format: 'json_object',
  }),
  cerebras: define({
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'gpt-oss-120b',
    keyUrl: 'https://cloud.cerebras.ai/',
    keyHint: 'csk-',
    free: 'Free tier, with rate limits',
  }),
  ollama: define({
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    model: null,
    keyUrl: null,
    keyHint: '',
    free: 'Runs on your own machine',
    keyless: true,
  }),
  'openai-compatible': define({
    id: 'openai-compatible',
    name: 'OpenAI-compatible API',
    baseUrl: '',
    model: null,
    keyUrl: null,
    keyHint: '',
    free: null,
    keyless: true,
  }),
});

/**
 * A provider by id, or a provider object of one's own.
 * @param {string|Partial<AiProvider>} provider
 * @returns {AiProvider}
 */
export function resolveProvider(provider) {
  if (typeof provider === 'string') {
    const known = AI_PROVIDERS[/** @type {keyof typeof AI_PROVIDERS} */ (provider)];
    if (!known || !Object.hasOwn(AI_PROVIDERS, provider)) {
      throw new TypeError(`Unknown AI provider "${provider}" — one of ${Object.keys(AI_PROVIDERS).join(', ')}, or { baseUrl, model }`);
    }
    return known;
  }
  if (!provider || typeof provider !== 'object') throw new TypeError('provider: an id (e.g. "openrouter") or { baseUrl, model }');
  const base = provider.id && Object.hasOwn(AI_PROVIDERS, provider.id) ? AI_PROVIDERS[/** @type {keyof typeof AI_PROVIDERS} */ (provider.id)] : AI_PROVIDERS['openai-compatible'];
  return define({ ...base, ...provider });
}

/** The instruction every answer gets: the JSON, nothing else. @param {object} schema */
const answerInstruction = (schema) =>
  `\n\n# Answer format\nAnswer with ONE JSON object and nothing else — no prose, no code fence — matching this JSON schema:\n${JSON.stringify(schema)}`;

/** @param {AnswerFormat} format @param {object} schema @param {string} task */
function responseFormat(format, schema, task) {
  if (format === 'json_schema') return { type: 'json_schema', json_schema: { name: task || 'answer', strict: true, schema } };
  if (format === 'json_object') return { type: 'json_object' };
  return undefined;
}

/** A 400 about the answer format: the provider (or that model) does not take it. @param {number} status @param {string} text */
const formatRefused = (status, text) => (status === 400 || status === 422) && /response_format|json_schema|json_object|structured|schema|grammar/i.test(text);

/** The text of an assistant message (a string, or parts). @param {any} message */
function textOf(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  return '';
}

/**
 * @param {{
 *   provider?: string|Partial<AiProvider>,
 *   apiKey?: string|(() => string|Promise<string>),
 *   model?: string,
 *   baseUrl?: string,
 *   headers?: Record<string, string>,
 *   maxTokens?: number,
 *   temperature?: number,
 *   fetch?: typeof fetch,
 * }} options
 *   `apiKey`: the key, or a function that gives it at each call (asked to the
 *   user, read from a vault); `model`, `baseUrl`: instead of the provider's;
 *   `maxTokens`: the longest answer (an email is about 6 000).
 * @returns {import('./generator.js').EmailModel & {provider: AiProvider, model: string}}
 */
export function providerEmailModel(options = {}) {
  const { apiKey, maxTokens = 16000, temperature, fetch: fetchImpl } = options;
  const provider = resolveProvider(options.provider ?? 'openai-compatible');
  const model = options.model || provider.model;
  const baseUrl = String(options.baseUrl || provider.baseUrl).replace(/\/+$/, '');
  if (!baseUrl) throw new TypeError(`providerEmailModel: ${provider.name} needs a \`baseUrl\``);
  if (!model) throw new TypeError(`providerEmailModel: ${provider.name} needs a \`model\` (the name it gives the model)`);
  if (!apiKey && !provider.keyless) {
    throw new TypeError(`providerEmailModel: ${provider.name} needs an \`apiKey\`${provider.keyUrl ? ` (${provider.keyUrl})` : ''}`);
  }
  const call = fetchImpl || globalThis.fetch;
  /** The format that works, once learned. */
  let format = provider.format;

  /** @type {import('./generator.js').EmailModel} */
  const emailModel = async ({ system, messages, schema, signal, task }) => {
    const key = typeof apiKey === 'function' ? await apiKey() : apiKey;
    signal?.throwIfAborted();
    if (!key && !provider.keyless) throw new EmailGenerationError('KEY_MISSING', `${provider.name}: no key`);
    for (;;) {
      const body = {
        model,
        messages: [{ role: 'system', content: system + answerInstruction(schema) }, ...messages],
        [provider.tokens]: maxTokens,
        ...(temperature === undefined ? {} : { temperature }),
        ...(responseFormat(format, schema, task || 'answer') ? { response_format: responseFormat(format, schema, task || 'answer') } : {}),
      };
      /** @type {Response} */
      let response;
      try {
        response = await call(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
            ...provider.headers,
            ...options.headers,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (signal?.aborted || /** @type {any} */ (error)?.name === 'AbortError') throw error;
        throw new EmailGenerationError('MODEL_ERROR', `${provider.name}: ${/** @type {any} */ (error)?.message || error}`);
      }
      const text = await response.text();
      if (!response.ok) {
        if (formatRefused(response.status, text) && format !== 'text') {
          // That model does not take this format: the next one down, for good.
          format = format === 'json_schema' ? 'json_object' : 'text';
          continue;
        }
        const detail = `${provider.name} ${response.status}: ${text.slice(0, 300)}`;
        if (response.status === 401 || response.status === 403) throw new EmailGenerationError('KEY_REFUSED', detail);
        if (response.status === 402) throw new EmailGenerationError('MODEL_CREDITS', detail);
        if (response.status === 429 || response.status === 503 || response.status === 529) throw new EmailGenerationError('MODEL_BUSY', detail);
        throw new EmailGenerationError('MODEL_ERROR', detail);
      }
      /** @type {any} */
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new EmailGenerationError('MODEL_ERROR', `${provider.name}: not JSON — ${text.slice(0, 200)}`);
      }
      // Some providers answer 200 with an error inside (OpenRouter's upstream failures).
      if (data?.error) {
        const code = Number(data.error.code) || 0;
        const detail = `${provider.name}: ${data.error.message || JSON.stringify(data.error).slice(0, 300)}`;
        if (code === 401 || code === 403) throw new EmailGenerationError('KEY_REFUSED', detail);
        if (code === 429 || code === 503) throw new EmailGenerationError('MODEL_BUSY', detail);
        throw new EmailGenerationError('MODEL_ERROR', detail);
      }
      const choice = data?.choices?.[0];
      if (choice?.message?.refusal) throw new EmailGenerationError('REFUSED', String(choice.message.refusal));
      if (choice?.finish_reason === 'content_filter') throw new EmailGenerationError('REFUSED');
      if (choice?.finish_reason === 'length') throw new EmailGenerationError('TRUNCATED');
      return textOf(choice?.message);
    }
  };
  return Object.assign(emailModel, { provider, model });
}
