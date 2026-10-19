// @ts-check
/**
 * THE EMAIL AI — what the model does for the texts of an email:
 *
 *   rewrite          one text rewritten (shorter, longer, fixed, another tone,
 *                    translated, changed as the user says), or written anew
 *                    on a topic — see rewrite.js;
 *   suggestSubjects  three other subject lines — see subjects.js;
 *   proofread        the mistakes of every text of the email, each with its
 *                    corrected text — see proofread.js.
 *
 *   const ai = createEmailGenerator({ model: claudeEmailModel({ client: new Anthropic() }) });
 *   const { text } = await ai.rewrite({ action: 'shorter', text: '<p>…</p>' });
 *
 * The MODEL is any function `({system, messages, schema, signal}) => text`:
 * `claudeEmailModel` (claude.js) for Claude, `providerEmailModel`
 * (providers.js) for the others, `agentEmailModel` (agent.js) for an agent of
 * your own — or a few lines of your own. Its answer is read and checked; when
 * a problem remains, the model gets ONE more turn with the list of problems
 * (`maxAttempts`, 2 by default) — a slow model call is the cost of a retry.
 */

import { createProofreader } from './proofread.js';
import { createRewriter } from './rewrite.js';
import { createSubjectSuggester } from './subjects.js';
import { AI_MESSAGES } from './i18n/index.js';

/**
 * @typedef {{role: 'user'|'assistant', content: string}} ModelMessage
 * @typedef {(request: {system: string, messages: ModelMessage[], schema: object, signal?: AbortSignal, task?: 'rewrite'|'subjects', user?: any}) => Promise<string>} EmailModel
 *   `task`: what is asked — one text (`rewrite`: a rewrite, a text written on
 *   a topic, the email proofread) or subject ideas (`subjects`); short jobs a
 *   model may answer with little effort. `user`: on the server, the one the
 *   handler's `authorize` returned (agent.js forwards who asks).
 *
 * @typedef {import('./rewrite.js').RewriteInput} RewriteInput
 * @typedef {import('./subjects.js').SubjectsInput} SubjectsInput
 * @typedef {import('./proofread.js').ProofreadInput} ProofreadInput
 */

/**
 * @param {{model: EmailModel, maxAttempts?: number}} options
 */
export function createEmailGenerator({ model, maxAttempts = 2 } = /** @type {any} */ ({})) {
  if (typeof model !== 'function') throw new Error('createEmailGenerator: `model` must be a function');
  return {
    rewrite: createRewriter({ model, maxAttempts }),
    suggestSubjects: createSubjectSuggester({ model, maxAttempts }),
    proofread: createProofreader({ model, maxAttempts }),
    // Its error messages in the server's language (the handler merges them).
    messages: AI_MESSAGES,
  };
}
