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
 */

import { EmailGenerationError } from './draft.js';

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5-5';

/**
 * @param {{
 *   client: any,
 *   model?: string,
 *   effort?: 'low'|'medium'|'high'|'xhigh'|'max',
 *   rewriteEffort?: 'low'|'medium'|'high'|'xhigh'|'max',
 *   maxTokens?: number,
 * }} options
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
    const message = await client.messages
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
