// @ts-check
/**
 * Translations.
 *
 * Source strings are written in English directly in the code and double as
 * translation keys (`t('Save')`). A locale is a plain object mapping those
 * English strings to translated ones; a missing entry falls back to English.
 * Placeholders use `{name}`: `t('Saved — version {n}.', { n: 3 })`.
 *
 * The same translator serves the browser (builder interface) and the server
 * (validation and API error messages).
 */

import { de } from './de.js';
import { es } from './es.js';
import { fr } from './fr.js';
import { ru } from './ru.js';
import { zh } from './zh.js';

/** @typedef {Record<string, string>} Messages */
/** @typedef {(text: string, params?: Record<string, string|number|null|undefined>) => string} Translate */

/** Built-in locales. English is the source language: an empty dictionary. */
export const LOCALES = /** @type {Record<string, Messages>} */ ({ en: {}, fr, de, es, ru, zh });

/**
 * @param {Messages} [messages]
 * @returns {Translate}
 */
export function createTranslator(messages = {}) {
  return (text, params) => {
    const template = Object.prototype.hasOwnProperty.call(messages, text) ? messages[text] : text;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, key) =>
      params[key] === undefined || params[key] === null ? match : String(params[key])
    );
  };
}

/**
 * Translator for a locale code (`'fr'`, `'fr-FR'`, `'en'`…), optionally
 * extended with application-specific strings.
 *
 * @param {string} [locale]
 * @param {Messages} [overrides]
 * @returns {Translate}
 */
export function translatorFor(locale = 'en', overrides = {}) {
  return createTranslator({ ...messagesOf(LOCALES, locale), ...overrides });
}

/**
 * The dictionary of a locale among several (`'fr-FR'` finds `fr`); an empty
 * one when there is none.
 * @param {Record<string, Messages>|null|undefined} dictionaries
 * @param {string} [locale]
 * @returns {Messages}
 */
export function messagesOf(dictionaries, locale = 'en') {
  if (!dictionaries) return {};
  const code = String(locale).toLowerCase();
  const own = (/** @type {string} */ key) => (Object.prototype.hasOwnProperty.call(dictionaries, key) ? dictionaries[key] : null);
  return own(code) || own(code.slice(0, 2)) || {};
}

/** English, untouched: the default everywhere a translator is optional. */
export const identity = createTranslator();
