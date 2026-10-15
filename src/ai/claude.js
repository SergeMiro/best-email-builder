// @ts-check
/**
 * CLAUDE as the email model of `createEmailGenerator`.
 *
 *   import Anthropic from '@anthropic-ai/sdk';
 *   const model = claudeEmailModel({ client: new Anthropic() });
 *
 * The client is the host's own (`@anthropic-ai/sdk`, installed by the
 * application): its key, its proxy, its retries. Nothing here imports it.
 *
 * The answer comes as structured output (`output_config.format`): the JSON
 * schema of a draft, so the model cannot answer anything else. Streaming, read
 * to the end with `finalMessage()`: an email with the model's reasoning can
 * take a minute or more, longer than a plain request may stay open.
 *
 * In the page, with each user's own key, Claude is a provider of `createAi`:
 *
 *   createAi({
 *     provider: ['openai', claudeProvider({ client: async (apiKey) =>
 *       new (await import('@anthropic-ai/sdk')).default({ apiKey, dangerouslyAllowBrowser: true }) }), 'gemini'],
 *     askKey: true,
 *   });
 */

import { EmailGenerationError } from './draft.js';
import { failureCode } from './providers.js';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * @typedef {{
 *   model?: string,
 *   effort?: 'low'|'medium'|'high'|'xhigh'|'max',
 *   rewriteEffort?: 'low'|'medium'|'high'|'xhigh'|'max',
 *   maxTokens?: number,
 * }} ClaudeOptions
 */

/**
 * @param {{client: any} & ClaudeOptions} options
 *   `effort`: how much the model thinks before writing an email — `low`
 *   answers faster, `high` takes more care. `rewriteEffort`: the same for
 *   the light jobs the user waits on — one text rewritten, subject ideas.
 * @returns {import('./generator.js').EmailModel}
 */
export function claudeEmailModel({
  client,
  model = DEFAULT_CLAUDE_MODEL,
  effort = 'medium',
  rewriteEffort = 'low',
  maxTokens = 32000,
} = /** @type {any} */ ({})) {
  if (!client?.messages?.stream) {
    throw new Error('claudeEmailModel: pass an Anthropic client — `new Anthropic()` from @anthropic-ai/sdk');
  }
  return async ({ system, messages, schema, signal, task }) => {
    let message;
    try {
      message = await client.messages
        .stream(
          {
            model,
            max_tokens: maxTokens,
            system,
            messages,
            output_config: { effort: task === 'rewrite' || task === 'subjects' ? rewriteEffort : effort, format: { type: 'json_schema', schema } },
          },
          { signal }
        )
        .finalMessage();
    } catch (error) {
      throw sdkFailure(error, signal);
    }
    if (message.stop_reason === 'refusal') {
      throw new EmailGenerationError('REFUSED');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new EmailGenerationError('TRUNCATED');
    }
    return message.content
      .filter((/** @type {any} */ block) => block.type === 'text')
      .map((/** @type {any} */ block) => block.text)
      .join('');
  };
}

/**
 * The SDK's errors, as the errors the interface explains (a refused key is
 * asked again); an abort goes through as it is.
 * @param {unknown} error @param {AbortSignal} [signal]
 */
function sdkFailure(error, signal) {
  const { status, name } = /** @type {any} */ (error) || {};
  if (signal?.aborted || name === 'AbortError' || name === 'APIUserAbortError' || error instanceof EmailGenerationError) return error;
  const text = String(/** @type {any} */ (error)?.error?.error?.message || /** @type {any} */ (error)?.message || error);
  // No status: the request did not get through (network, CORS).
  if (typeof status !== 'number') return new EmailGenerationError('MODEL_ERROR', `Claude: ${text.slice(0, 300)}`);
  return new EmailGenerationError(failureCode(status, text), `Claude ${status}: ${text.slice(0, 300)}`);
}

/**
 * Claude as a provider of `createAi({ provider, askKey: true })`: each user
 * connects their own Anthropic key, like the other providers. `client` makes
 * the Anthropic client from that key — the application's own SDK, loaded when
 * it is needed, so nothing here imports it:
 *
 *   claudeProvider({
 *     client: async (apiKey) => {
 *       const { default: Anthropic } = await import('@anthropic-ai/sdk');
 *       return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
 *     },
 *   })
 *
 * The other options are claudeEmailModel's (`model`, `effort`…). The user can
 * choose another of the models their key opens, in the Connect dialog.
 *
 * @param {{client: (apiKey: string) => any} & ClaudeOptions} options
 * @returns {import('./providers.js').AiProvider}
 */
export function claudeProvider(options) {
  const { client, ...rest } = options || /** @type {any} */ ({});
  if (typeof client !== 'function') {
    throw new TypeError('claudeProvider: `client` is a function that makes the Anthropic client from a key');
  }
  return Object.freeze({
    id: 'anthropic',
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    model: rest.model || DEFAULT_CLAUDE_MODEL,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-',
    free: null,
    format: /** @type {const} */ ('json_schema'),
    tokens: /** @type {const} */ ('max_tokens'),
    maxTokens: rest.maxTokens ?? 32000,
    createModel: ({ apiKey, model }) => {
      // One client per key: a new key (the last one refused) makes a new one.
      /** @type {{key: string, model: import('./generator.js').EmailModel}|null} */
      let current = null;
      return async (request) => {
        const key = String((await apiKey()) || '').trim();
        if (!key) throw new EmailGenerationError('KEY_MISSING', 'Claude: no key');
        if (!current || current.key !== key) {
          current = { key, model: claudeEmailModel({ ...rest, ...(model ? { model } : {}), client: await client(key) }) };
        }
        return current.model(request);
      };
    },
    listModels: async ({ apiKey, signal }) => {
      const key = String(apiKey || '').trim();
      if (!key) throw new EmailGenerationError('KEY_MISSING', 'Claude: no key');
      try {
        const page = await (await client(key)).models.list({ limit: 100 }, { signal });
        return (page?.data || []).map((/** @type {any} */ entry) => ({
          id: String(entry.id),
          name: String(entry.display_name || entry.id),
          created: entry.created_at ? Date.parse(entry.created_at) / 1000 : 0,
        }));
      } catch (error) {
        throw sdkFailure(error, signal);
      }
    },
  });
}
