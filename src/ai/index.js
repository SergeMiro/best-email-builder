// @ts-check
/**
 * best-email-builder/ai — the AI module, for the browser.
 *
 *   import { createAi } from 'best-email-builder/ai';
 *   <EmailBuilder storage={storage} ai={createAi()} />
 *
 * An application that does not import this entry has no AI button, and none
 * of the AI's code or texts in its bundle. The server side is
 * `best-email-builder/ai/server` (the generator the handler takes).
 */

export { createAi } from './createAi.js';
export { AI_MESSAGES } from './i18n/index.js';
export { EMAIL_PURPOSES, PURPOSE_CATEGORIES } from './purposes.js';
export { REWRITE_ACTIONS, REWRITE_LANGUAGES } from './rewrite.js';
export { emailWords } from './subjects.js';
export { EmailGenerationError, GENERATION_ERRORS } from './draft.js';
// The generator itself, to run the AI in the page (`createAi({ model })`
// does it for you) — the model's key is then in the page.
export { createEmailGenerator } from './generator.js';
export { claudeEmailModel, claudeProvider, DEFAULT_CLAUDE_MODEL } from './claude.js';
// The providers `createAi({ provider })` runs in the page.
export { AI_PROVIDERS, failureCode, listProviderModels, providerEmailModel, resolveProvider } from './providers.js';
