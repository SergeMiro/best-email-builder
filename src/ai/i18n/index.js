// @ts-check
/**
 * The AI module's own texts, by locale: merged under the host's `messages`
 * when the builder is given the module (`createAi`), and under the server's
 * when the handler is given a generator (`createEmailGenerator`). The core's
 * dictionaries (src/i18n/) do not carry them.
 */

import { de } from './de.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { pt } from './pt.js';
import { ru } from './ru.js';
import { zh } from './zh.js';

/** @type {Record<string, Record<string, string>>} */
export const AI_MESSAGES = { en: {}, fr, de, es, pt, ru, zh };
