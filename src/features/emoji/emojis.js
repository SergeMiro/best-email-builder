// @ts-check
/**
 * The emojis, by group, named in the interface's language: loaded on first
 * use (about 100 KB a language), never with the builder. Built from
 * emojibase by scripts/build-emoji-data.mjs.
 */

/** @typedef {[emoji: string, search: string]} EmojiEntry */
/** @typedef {{id: string, emojis: EmojiEntry[]}} EmojiGroup */

/** One import per language: the bundler makes a chunk of each. */
const LOADERS = {
  en: () => import('./data/en.js'),
  fr: () => import('./data/fr.js'),
  de: () => import('./data/de.js'),
  es: () => import('./data/es.js'),
  pt: () => import('./data/pt.js'),
  ru: () => import('./data/ru.js'),
  zh: () => import('./data/zh.js'),
};

/** The groups' names, in their order. */
export const EMOJI_GROUPS = {
  smileys: 'Smileys & emotion',
  people: 'People & body',
  nature: 'Animals & nature',
  food: 'Food & drink',
  travel: 'Travel & places',
  activities: 'Activities',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
};

/** @type {Map<string, Promise<EmojiGroup[]>>} */
const cache = new Map();

/**
 * The emojis named in `locale` ("fr-CA" → French), English for a language
 * without names.
 * @param {string} [locale]
 * @returns {Promise<EmojiGroup[]>}
 */
export function loadEmojis(locale = 'en') {
  const language = String(locale).slice(0, 2).toLowerCase();
  const key = language in LOADERS ? language : 'en';
  let groups = cache.get(key);
  if (!groups) {
    groups = LOADERS[/** @type {keyof typeof LOADERS} */ (key)]().then((module) =>
      module.default.map(([id, emojis]) => ({ id: String(id), emojis: /** @type {EmojiEntry[]} */ (emojis) }))
    );
    // A failed load (offline) is tried again next time.
    groups.catch(() => cache.delete(key));
    cache.set(key, groups);
  }
  return groups;
}

/** Lower case, without accents: "Cœur" and "coeur" match. @param {string} text */
export function searchable(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

/**
 * The emojis whose name or keywords hold every word of the query, in Unicode
 * order.
 * @param {EmojiGroup[]} groups @param {string} query
 * @returns {EmojiEntry[]}
 */
export function searchEmojis(groups, query) {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const found = [];
  for (const group of groups) {
    for (const entry of group.emojis) {
      const text = searchable(entry[1]);
      if (words.every((word) => text.includes(word))) found.push(entry);
    }
  }
  return found;
}

/** The name of an emoji: the first of its search words. @param {EmojiEntry} entry */
export const nameOf = (entry) => entry[1].split('|')[0];
