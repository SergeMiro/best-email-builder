/**
 * LANGUAGETOOL: Proofread without AI. LanguageTool is a fake that answers as
 * the real one does — offsets in the document sent, markup included — with
 * the mistakes it is told to find; only corrections of words may come out,
 * the markup, the links and the merge tags as they were.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLanguageToolProofreader, LANGUAGETOOL_PUBLIC_API } from '../../src/ai/languagetool.js';
import { createLanguageToolProofreader as onServer } from '../../src/ai/server.js';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
} from '../../src/server/index.js';

/**
 * A fake LanguageTool. `mistakes`: what it finds — the words as they are in
 * the document sent (markup included, as LanguageTool's offsets are), the
 * suggestions, the rule. Records the requests.
 */
function fakeLanguageTool(mistakes, { status = 200 } = {}) {
  const requests = [];
  const fetch = async (url, init) => {
    const params = Object.fromEntries(new URLSearchParams(init.body.toString()));
    const { annotation } = JSON.parse(params.data);
    const sent = annotation.map((part) => part.text ?? part.markup).join('');
    requests.push({ url, headers: init.headers, params, annotation, sent });
    if (status !== 200) return new Response('Too many requests', { status });
    const matches = [];
    for (const { find, values = [], issueType = 'misspelling', rule = 'SPELLING' } of mistakes) {
      for (let at = sent.indexOf(find); at !== -1; at = sent.indexOf(find, at + 1)) {
        matches.push({ offset: at, length: find.length, replacements: values.map((value) => ({ value })), rule: { id: rule, issueType, category: { id: 'TYPOS' } } });
      }
    }
    return Response.json({ language: { code: 'fr', detectedLanguage: { code: 'fr' } }, matches });
  };
  return { fetch, requests };
}

const URL = 'https://lt.example.test';
const check = (mistakes, texts, options = {}) => {
  const lt = fakeLanguageTool(mistakes);
  const proofread = createLanguageToolProofreader({ url: URL, fetch: lt.fetch, ...options });
  return proofread({ texts, language: 'fr' }).then((result) => ({ ...result, requests: lt.requests }));
};
const html = (id, text) => ({ id, kind: 'text', format: 'html', text });
const plain = (id, text, kind = 'button') => ({ id, kind, format: 'plain', text });

test('one request: the texts as annotated text — markup read as the reader sees it, merge tags as a word', async () => {
  const { fixes, requests } = await check(
    [],
    [plain('subject', 'Our {{campaign.name}} sale', 'subject'), html('t1', '<p>Hello <b>you</b>&nbsp;all</p><p>Line<br>two</p>')]
  );
  assert.deepEqual(fixes, []);
  assert.equal(requests.length, 1);
  const [{ url, params, annotation, headers }] = requests;
  assert.equal(url, `${URL}/v2/check`);
  assert.equal(headers.Accept, 'application/json');
  assert.deepEqual(
    { language: params.language, level: params.level, preferredVariants: params.preferredVariants, preferredLanguages: params.preferredLanguages, disabledRules: params.disabledRules },
    { language: 'auto', level: 'default', preferredVariants: 'en-US,de-DE,pt-PT,ca-ES', preferredLanguages: 'fr', disabledRules: 'PUNCTUATION_PARAGRAPH_END' }
  );
  assert.deepEqual(annotation, [
    { text: 'Our ' },
    { markup: '{{campaign.name}}', interpretAs: 'X' },
    { text: ' sale' },
    { markup: '\n\n', interpretAs: '\n\n' },
    { markup: '<p>', interpretAs: '' },
    { text: 'Hello ' },
    { markup: '<b>', interpretAs: '' },
    { text: 'you' },
    { markup: '</b>', interpretAs: '' },
    { markup: '&nbsp;', interpretAs: ' ' },
    { text: 'all' },
    { markup: '</p>', interpretAs: '\n\n' },
    { markup: '<p>', interpretAs: '' },
    { text: 'Line' },
    { markup: '<br>', interpretAs: '\n' },
    { text: 'two' },
    { markup: '</p>', interpretAs: '\n\n' },
  ]);
  assert.equal(onServer, createLanguageToolProofreader);
  assert.equal(LANGUAGETOOL_PUBLIC_API, 'https://api.languagetool.org');
});

test('the smallest change of the words: bold, links, merge tags and entities kept', async () => {
  const text =
    '<p>Bonjour {{contact.firstname}}, nous <b>somme</b> ravis de vous anoncer les <a href="https://example.com/a">nouvellles</a> d&#39;octobre&nbsp;!</p>';
  const { fixes } = await check(
    [
      // A rule over markup: only the letter it adds is changed, in the bold.
      { find: 'nous <b>somme', values: ['nous sommes'], issueType: 'grammar', rule: 'NOUS_SOMMES' },
      // Split in two first, a word one letter away next: that one.
      { find: 'anoncer', values: ['a noncer', 'annoncer', 'annonce'] },
      { find: 'nouvellles', values: ['nouvelles'] },
    ],
    [html('t1', text), plain('b1', 'Voir nos nouvellles')]
  );
  assert.deepEqual(fixes, [
    {
      id: 't1',
      text: '<p>Bonjour {{contact.firstname}}, nous <b>sommes</b> ravis de vous annoncer les <a href="https://example.com/a">nouvelles</a> d&#39;octobre&nbsp;!</p>',
    },
    { id: 'b1', text: 'Voir nos nouvelles' },
  ]);
});

test('the suggestion: the first, unless it only splits the word and one a letter away has its first letter', async () => {
  const { fixes } = await check(
    [
      { find: 'alot', values: ['a lot', 'lot', 'plot'] },
      { find: 'recieve', values: ['receive', 'relieve'] },
    ],
    [plain('b1', 'Get alot'), plain('b2', 'Please recieve it')]
  );
  assert.deepEqual(fixes, [
    { id: 'b1', text: 'Get a lot' },
    { id: 'b2', text: 'Please receive it' },
  ]);
});

test('not mistakes: names and brands, acronyms, words with digits, ignoreWords, style, no suggestion', async () => {
  const { fixes } = await check(
    [
      { find: 'Acmeworx', values: ['Acme works'] },
      { find: 'Bonjuor', values: ['Bonjour'] },
      { find: 'SASU', values: ['SAS'] },
      { find: 'B2Brouter', values: ['Router'] },
      { find: 'beb', values: ['bec'] },
      { find: 'very unique', values: ['unique'], issueType: 'style', rule: 'VERY_UNIQUE' },
      { find: 'colection', values: [] },
    ],
    [plain('b1', 'Acmeworx SASU, B2Brouter et beb'), html('t1', '<p>Bonjuor, a very unique colection.</p>')],
    { ignoreWords: ['Beb'] }
  );
  // A capitalized word one letter from its suggestion is a typo.
  assert.deepEqual(fixes, [{ id: 't1', text: '<p>Bonjour, a very unique colection.</p>' }]);
});

test('a capital at the start: asked of a text block, not of a subject, a button or a menu link', async () => {
  const mistakes = [{ find: 'see', values: ['See'], issueType: 'typographical', rule: 'UPPERCASE_SENTENCE_START' }];
  const { fixes } = await check(mistakes, [plain('subject', 'see the sale', 'subject'), plain('b1', 'see more'), plain('l1', 'see all', 'link'), html('t1', '<p>see you.</p>')]);
  assert.deepEqual(fixes, [{ id: 't1', text: '<p>See you.</p>' }]);
});

test('left as it is: a change that would remove markup, or touch letters of an entity or a tag; two changes at one place', async () => {
  const { fixes } = await check(
    [
      // "le le": removing the second would remove its bold.
      { find: 'le <b>le', values: ['le'], issueType: 'duplication', rule: 'DOUBLE' },
      // "café", the é an entity: a letter glued to it.
      { find: 'caf', values: ['cafe'] },
      // Overlapping: the first one only.
      { find: 'grand mercii', values: ['grand merci'], issueType: 'grammar', rule: 'G' },
      { find: 'mercii', values: ['merci beaucoup'] },
      // Across two texts.
      { find: 'fin\n\ndébut', values: ['fin. Début'], issueType: 'grammar', rule: 'G' },
    ],
    [html('t1', '<p>le <b>le</b> caf&eacute; grand mercii</p>'), plain('b1', 'la fin', 'subject'), plain('b2', 'début')]
  );
  assert.deepEqual(fixes, [{ id: 't1', text: '<p>le <b>le</b> caf&eacute; grand merci</p>' }]);
});

test('a suggestion with markup characters is escaped in a text block, as is in a label', async () => {
  const { fixes } = await check([{ find: 'R and D', values: ['R&D'], issueType: 'grammar', rule: 'G' }], [html('t1', '<p>Our R and D</p>'), plain('b1', 'R and D')]);
  assert.deepEqual(fixes, [
    { id: 't1', text: '<p>Our R&amp;D</p>' },
    { id: 'b1', text: 'R&D' },
  ]);
});

test('a long email: a few requests, never a text cut in two; options: the server, a language, Premium', async () => {
  const long = (n) => html(`t${n}`, `<p>${'Lorem ipsum dolor sit amet. '.repeat(200)} mistak ${n}</p>`);
  const { fixes, requests } = await check([{ find: 'mistak', values: ['mistake'] }], [long(1), long(2), long(3)], {
    language: 'en-GB',
    level: 'picky',
    disabledRules: ['EN_QUOTES'],
    username: 'me@example.com',
    apiKey: 'k-1',
    headers: { 'X-Team': 'mail' },
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map((request) => request.annotation.filter((part) => part.markup === '\n\n' && part.interpretAs === '\n\n').length), [1, 0]);
  assert.deepEqual(fixes.map((fix) => fix.id), ['t1', 't2', 't3']);
  assert.ok(fixes.every((fix) => fix.text.includes(' mistake ')));
  const [{ params, headers }] = requests;
  assert.deepEqual(
    { language: params.language, level: params.level, disabledRules: params.disabledRules, username: params.username, apiKey: params.apiKey },
    { language: 'en-GB', level: 'picky', disabledRules: 'PUNCTUATION_PARAGRAPH_END,EN_QUOTES', username: 'me@example.com', apiKey: 'k-1' }
  );
  assert.equal(params.preferredVariants, undefined);
  assert.equal(headers['X-Team'], 'mail');

  // The address: the server's, or its check endpoint.
  for (const url of ['https://lt.example.test/', 'https://lt.example.test/v2/check']) {
    const lt = fakeLanguageTool([]);
    await createLanguageToolProofreader({ url, fetch: lt.fetch })({ texts: [plain('b1', 'Hello')] });
    assert.equal(lt.requests[0].url, 'https://lt.example.test/v2/check');
  }
});

test('errors: busy (429), unavailable, not JSON, nothing to read; an abort goes through; options checked', async () => {
  const input = { texts: [plain('b1', 'Hello')] };
  const busy = fakeLanguageTool([], { status: 429 });
  await assert.rejects(createLanguageToolProofreader({ url: URL, fetch: busy.fetch })(input), { code: 'CHECKER_BUSY', status: 503 });
  const down = fakeLanguageTool([], { status: 503 });
  await assert.rejects(createLanguageToolProofreader({ url: URL, fetch: down.fetch })(input), { code: 'CHECKER_UNAVAILABLE', message: 'The checker could not answer. Try again.' });
  const offline = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(createLanguageToolProofreader({ url: URL, fetch: offline })(input), (error) => error.code === 'CHECKER_UNAVAILABLE' && /Failed to fetch/.test(error.detail));
  const html502 = async () => new Response('<html>', { status: 200 });
  await assert.rejects(createLanguageToolProofreader({ url: URL, fetch: html502 })(input), { code: 'CHECKER_UNAVAILABLE' });
  await assert.rejects(createLanguageToolProofreader({ url: URL, fetch: busy.fetch })({ texts: [plain('b1', '123')] }), { code: 'NOTHING_TO_PROOFREAD' });

  const controller = new AbortController();
  const hanging = (url, init) =>
    new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  const pending = createLanguageToolProofreader({ url: URL, fetch: hanging })(input, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });

  assert.throws(() => createLanguageToolProofreader({}), /`url` is a LanguageTool server/);
  assert.throws(() => createLanguageToolProofreader({ url: 'lt.example.test' }), /`url`/);
  assert.throws(() => createLanguageToolProofreader({ url: URL, username: 'me' }), /go together/);
});

test('on the server: the generator\'s proofread, behind the route', async () => {
  const lt = fakeLanguageTool([{ find: 'sumer', values: ['summer'] }]);
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    generator: { proofread: createLanguageToolProofreader({ url: URL, fetch: lt.fetch }) },
    authorize: () => ({ id: 'u1' }),
    onError: () => {},
  });
  const response = await handler(
    new Request('http://localhost/api/email-builder/proofread', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texts: [plain('subject', 'Our sumer sale', 'subject')], language: 'en' }),
    })
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { fixes: [{ id: 'subject', text: 'Our summer sale' }] });
});
