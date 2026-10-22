/**
 * EMOJIS of the ribbon's panel: named in the interface's language, loaded on
 * first use, found by any word of their name or keywords, accents or not.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMOJI_GROUPS, loadEmojis, nameOf, searchEmojis, searchable } from '../../src/features/emoji/emojis.js';

const LANGUAGES = ['en', 'fr', 'de', 'es', 'pt', 'ru', 'zh'];

test('every language: the same groups, in order, the same emojis, each named', async () => {
  const english = await loadEmojis('en');
  assert.deepEqual(
    english.map((group) => group.id),
    Object.keys(EMOJI_GROUPS)
  );
  const emojis = english.flatMap((group) => group.emojis.map(([emoji]) => emoji));
  assert.ok(emojis.length > 1500, `${emojis.length} emojis`);
  assert.equal(new Set(emojis).size, emojis.length, 'no emoji twice');
  for (const language of LANGUAGES) {
    const groups = await loadEmojis(language);
    assert.deepEqual(
      groups.flatMap((group) => group.emojis.map(([emoji]) => emoji)),
      emojis,
      language
    );
    for (const group of groups) for (const entry of group.emojis) assert.ok(nameOf(entry).trim(), `${language}: ${entry[0]} has a name`);
  }
});

test('loaded once a language; a regional locale takes its language, an unknown one English', async () => {
  assert.equal(loadEmojis('fr'), loadEmojis('fr-CA'));
  assert.equal(loadEmojis('it'), loadEmojis('en'));
  const [french] = await loadEmojis('fr-CA');
  assert.equal(nameOf(french.emojis[0]), 'visage rieur');
});

test('searchable: lower case, no accents, ligatures spelt out', () => {
  assert.equal(searchable('Cœur ÉCLATANT'), 'coeur eclatant');
  assert.equal(searchable('Ærø'), 'aerø');
  assert.equal(searchable('Сердце'), 'сердце');
});

test('search: every word of the query, in the name or the keywords, in Unicode order', async () => {
  const english = await loadEmojis('en');
  const found = (query) => searchEmojis(english, query).map(([emoji]) => emoji);
  assert.ok(found('red heart').includes('❤️'));
  // A keyword, not in the name.
  assert.ok(found('love').includes('❤️'));
  // Every word, in any order.
  assert.ok(found('heart red').includes('❤️'));
  assert.ok(!found('red heart').includes('💙'));
  assert.deepEqual(found('   '), []);
  assert.deepEqual(found('zzqqxx'), []);
  const smileys = found('grinning');
  assert.equal(smileys[0], '😀');

  const french = await loadEmojis('fr');
  const trouve = (query) => searchEmojis(french, query).map(([emoji]) => emoji);
  // Typed without the accent or the ligature.
  assert.ok(trouve('coeur rouge').includes('❤️'));
  assert.ok(trouve('Cœur Rouge').includes('❤️'));
});
