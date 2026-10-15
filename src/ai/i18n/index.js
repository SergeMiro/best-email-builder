// @ts-check
/**
 * The AI module's own texts, by locale: merged under the host's `messages`
 * when the builder is given the module (`createAi`), and under the server's
 * when the handler is given a generator (`createEmailGenerator`). The core's
 * dictionaries (src/i18n/) do not carry them.
 */

import { fr } from './fr.js';

/** @type {Record<string, Record<string, string>>} */
export const AI_MESSAGES = { en: {}, fr };
