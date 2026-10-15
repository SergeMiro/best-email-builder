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
 *     generator: createEmailGenerator({ model: claudeEmailModel({ client: new Anthropic() }), compile: compileMjml }),
 *   });
 *
 * Or any provider of `AI_PROVIDERS`, by its key — free ones included:
 *
 *   createEmailGenerator({ model: providerEmailModel({ provider: 'openrouter', apiKey: process.env.OPENROUTER_API_KEY }) })
 *
 * No React here, and nothing of it in `best-email-builder/server`: a server
 * without AI does not load it.
 */

export { createEmailGenerator, cleanGenerateInput, MAX_DETAILS_LENGTH } from './generator.js';
export { claudeEmailModel, DEFAULT_CLAUDE_MODEL } from './claude.js';
export { AI_PROVIDERS, failureCode, providerEmailModel, resolveProvider } from './providers.js';
export { EmailGenerationError, GENERATION_ERRORS, normalizeGeneratedMjml, parseDraft, reviewDraft } from './draft.js';
export { EMAIL_PURPOSES, PURPOSE_CATEGORIES, purposeById, purposesByCategory } from './purposes.js';
export { SYSTEM_PROMPT, EMAIL_DRAFT_SCHEMA, buildUserPrompt } from './prompt.js';
export { REWRITE_ACTIONS, REWRITE_LANGUAGES, REWRITE_SYSTEM_PROMPT, createRewriter, reviewRewrite } from './rewrite.js';
export { SUBJECTS_SYSTEM_PROMPT, createSubjectSuggester, emailWords, reviewSubjects } from './subjects.js';
export { AI_MESSAGES } from './i18n/index.js';
