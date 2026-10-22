// @ts-check
/**
 * best-email-builder/ai/server — the AI module, for the server: the model
 * runs where its key is.
 *
 *   import Anthropic from '@anthropic-ai/sdk';
 *   import { createEmailBuilderHandler } from 'best-email-builder/server';
 *   import { createEmailGenerator, claudeEmailModel } from 'best-email-builder/ai/server';
 *
 *   createEmailBuilderHandler({
 *     …,
 *     generator: createEmailGenerator({ model: claudeEmailModel({ client: new Anthropic() }) }),
 *   });
 *
 * Or any provider of `AI_PROVIDERS`, by its key — free ones included:
 *
 *   createEmailGenerator({ model: providerEmailModel({ provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY }) })
 *
 * Or an AI agent the application already has, with its tools and its rights
 * (agent.js — the protocol, the agent's side, and a check):
 *
 *   createEmailGenerator({ model: agentEmailModel({ url, headers: ({ user }) => ({ … }) }) })
 *
 * No React here, and nothing of it in `best-email-builder/server`: a server
 * without AI does not load it.
 */

export { createEmailGenerator } from './generator.js';
export { claudeEmailModel, DEFAULT_CLAUDE_MODEL } from './claude.js';
export { AI_PROVIDERS, failureCode, listProviderModels, providerEmailModel, resolveProvider } from './providers.js';
export { EmailGenerationError, GENERATION_ERRORS } from './errors.js';
export { REWRITE_ACTIONS, REWRITE_LANGUAGES, REWRITE_SYSTEM_PROMPT, createRewriter, reviewRewrite } from './rewrite.js';
export { PROOFREAD_SYSTEM_PROMPT, createProofreader, reviewFix } from './proofread.js';
export { diffWords } from './diff.js';
export { SUBJECTS_SYSTEM_PROMPT, createSubjectSuggester, emailWords, reviewSubjects } from './subjects.js';
export { AI_MESSAGES } from './i18n/index.js';
export { agentEmailModel, AGENT_PROTOCOL, AGENT_ERROR_CODES } from './agent.js';
export { createAgentEndpoint, checkAgent } from './agentEndpoint.js';
// Proofread without AI, on the server: `generator: { ...generator, proofread: createLanguageToolProofreader({ url }) }`.
export { createLanguageToolProofreader, LANGUAGETOOL_PUBLIC_API } from './languagetool.js';
