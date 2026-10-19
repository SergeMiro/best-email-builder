/**
 * PROOFREAD: the mistakes of a whole email, found by a model. The model is a
 * fake that answers what a real one gets wrong — prose around the JSON, a
 * text "improved" rather than corrected, a lost link, markup moved, ids it
 * was never given — and only real corrections may come out.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
} from '../../src/server/index.js';
import { EmailGenerationError, createEmailGenerator, diffWords, reviewFix } from '../../src/ai/server.js';
import { changedWords } from '../../src/ai/diff.js';
import { MAX_PROOFREAD_TOTAL, buildProofreadPrompt, cleanProofreadInput, parseProofread } from '../../src/ai/proofread.js';

const LINKED = '<p>See <a href="https://example.com/sale">the offers</a>, {{contact.firstname|there}}. Every product are on sale.</p>';
const EMAIL = [
  { id: 'subject', kind: 'subject', format: 'plain', text: 'Our sumer sale' },
  { id: 'text-1', kind: 'text', format: 'html', text: LINKED },
  { id: 'button-1', kind: 'button', format: 'plain', text: 'See the offers' },
];

/** A fake model answering `answers` (objects as JSON) in turn; records its requests. */
function fakeModel(...answers) {
  const requests = [];
  const model = async (request) => {
    requests.push(structuredClone({ ...request, signal: undefined }));
    const next = answers[Math.min(requests.length - 1, answers.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === 'string' ? next : JSON.stringify(next);
  };
  return { model, requests };
}

const proofread = (model, input = { texts: EMAIL }) => createEmailGenerator({ model }).proofread(input);

test('diffWords: the words kept, removed and added, in order; spaces and signs are their own tokens', () => {
  assert.deepEqual(diffWords('Our sumer sale', 'Our summer sale'), [
    { type: 'same', text: 'Our ' },
    { type: 'removed', text: 'sumer' },
    { type: 'added', text: 'summer' },
    { type: 'same', text: ' sale' },
  ]);
  assert.deepEqual(diffWords('See you their.', 'See you there!'), [
    { type: 'same', text: 'See you ' },
    { type: 'removed', text: 'their.' },
    { type: 'added', text: 'there!' },
  ]);
  // Inner apostrophes and hyphens keep a word whole.
  assert.deepEqual(diffWords("l'été en tee-shirt", "l'été en t-shirt"), [
    { type: 'same', text: "l'été en " },
    { type: 'removed', text: 'tee-shirt' },
    { type: 'added', text: 't-shirt' },
  ]);
  assert.deepEqual(diffWords('', 'Hi'), [{ type: 'added', text: 'Hi' }]);
  assert.deepEqual(diffWords('Same', 'Same'), [{ type: 'same', text: 'Same' }]);
  // Rebuilt from the parts, both texts come back.
  const before = 'Every product are on sale, see you their on Monday.';
  const after = 'Every product is on sale; see you there on Monday!';
  const parts = diffWords(before, after);
  assert.equal(parts.filter((p) => p.type !== 'added').map((p) => p.text).join(''), before);
  assert.equal(parts.filter((p) => p.type !== 'removed').map((p) => p.text).join(''), after);
});

test('changedWords: words and signs touched, out of how many', () => {
  assert.deepEqual(changedWords('Our sumer sale', 'Our summer sale'), { changed: 1, total: 3 });
  assert.deepEqual(changedWords('Every product are on sale.', 'All of our products are now on sale!'), { changed: 6, total: 6 });
  assert.deepEqual(changedWords('Hi', 'Hi'), { changed: 0, total: 1 });
});

test('input: ids of the caller, texts with letters, a total bound; nothing to read → 400', () => {
  const { texts, language } = cleanProofreadInput({
    texts: [
      ...EMAIL,
      { id: 'subject', text: 'A second subject' },
      { id: 'bad id!', text: 'Hello' },
      { id: 'image', text: '<p> 2026 · 30% </p>', format: 'html' },
      { id: 'kind', text: 'Read more', kind: 'weird' },
      null,
    ],
    language: 'fr',
  });
  assert.deepEqual(texts.map((t) => [t.id, t.kind, t.format]), [
    ['subject', 'subject', 'plain'],
    ['text-1', 'text', 'html'],
    ['button-1', 'button', 'plain'],
    ['kind', 'button', 'plain'],
  ]);
  assert.equal(language, 'fr');
  assert.equal(cleanProofreadInput({ texts: EMAIL, language: '<script>' }).language, 'en');
  const long = 'word '.repeat(1100).trim();
  const bounded = cleanProofreadInput({ texts: Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, text: long })) });
  assert.ok(bounded.texts.reduce((sum, t) => sum + t.text.length, 0) <= MAX_PROOFREAD_TOTAL);
  for (const input of [{ texts: [] }, { texts: [{ id: 'a', text: '   ' }] }, null, { texts: 'Hi' }]) {
    assert.throws(() => cleanProofreadInput(input), (error) => error.code === 'NOTHING_TO_PROOFREAD' && error.status === 400, JSON.stringify(input));
  }
  const prompt = buildProofreadPrompt(cleanProofreadInput({ texts: EMAIL, language: 'de' }));
  assert.match(prompt, /The interface is in German/);
  assert.ok(prompt.includes(`<text id="text-1" kind="text block, HTML">\n${LINKED}\n</text>`));
  assert.ok(prompt.includes('<text id="subject" kind="subject line">\nOur sumer sale\n</text>'));
});

test('parseProofread: the fixes wherever the JSON is; markup escaped twice decoded once more; anything else unread', () => {
  assert.deepEqual(parseProofread('Here you go:\n```json\n{"fixes":[{"id":" subject ","text":" Our summer sale "}]}\n```'), [{ id: 'subject', text: 'Our summer sale' }]);
  assert.deepEqual(parseProofread('{"fixes":[]}'), []);
  assert.deepEqual(parseProofread(JSON.stringify({ fixes: [{ id: 't', text: '<a href=\\"https://example.com\\">x</a>' }, { id: 1 }] })), [
    { id: 't', text: '<a href="https://example.com">x</a>' },
  ]);
  for (const answer of ['The email looks fine.', '{"text":"Hi"}', '{nope}', '']) assert.equal(parseProofread(answer), null, answer);
});

test('reviewFix: a correction changes a few words and keeps everything else; markup moved alone is none', () => {
  const [, text, button] = cleanProofreadInput({ texts: EMAIL }).texts;
  assert.deepEqual(reviewFix(text, LINKED.replace('are on', 'is on')), []);
  assert.equal(reviewFix(text, LINKED.replace('<p>', '<p><b>').replace('</p>', '</b></p>')), null, 'no word changed');
  assert.equal(reviewFix(button, 'See the offers'), null);

  const problems = (corrected, original = text) => reviewFix(original, corrected).join('\n');
  assert.match(problems(LINKED.replace('<a href="https://example.com/sale">the offers</a>', 'the offers').replace('are', 'is')), /link to https:\/\/example\.com\/sale is missing/);
  assert.match(problems(LINKED.replace('{{contact.firstname|there}}', 'there').replace('are', 'is')), /contact\.firstname\}\} is missing/);
  assert.match(problems(LINKED.replace('the offers</a>, ', 'the offers</a> ').replace('<p>See', '<p><i>See</i>')), /the markup changed/);
  assert.match(problems('<b>See</b> the deals', button), /plain text, no markup/);
  assert.match(problems('<p>Discover our whole new collection, all of it discounted this week only.</p>'), /too many words changed/);
  assert.match(problems('   ', button), /the answer is empty/);
  // Three words may change in a short text.
  assert.deepEqual(reviewFix(button, 'Sea teh ofers'), []);
});

test('proofreader: the corrections in the order of the email, in one call; the task is "rewrite"', async () => {
  const { model, requests } = fakeModel({
    fixes: [
      { id: 'text-1', text: LINKED.replace('are on', 'is on') },
      { id: 'subject', text: 'Our summer sale' },
      { id: 'button-1', text: 'See the offers' },
      { id: 'made-up', text: 'Anything' },
    ],
  });
  const result = await proofread(model, { texts: EMAIL, language: 'fr' });
  assert.deepEqual(result, {
    fixes: [
      { id: 'subject', text: 'Our summer sale' },
      { id: 'text-1', text: LINKED.replace('are on', 'is on') },
    ],
    attempts: 1,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].task, 'rewrite');
  assert.match(requests[0].system, /change no word that is correct/);
  assert.deepEqual(requests[0].schema.required, ['fixes']);
  assert.deepEqual(await proofread(fakeModel({ fixes: [] }).model), { fixes: [], attempts: 1 });
});

test('proofreader: a bad correction gets one more turn, the good ones are kept; bad twice → left out', async () => {
  const rewritten = '<p>Discover <a href="https://example.com/sale">our offers</a>, {{contact.firstname|there}}: the whole shop is discounted this week.</p>';
  const repaired = fakeModel(
    { fixes: [{ id: 'subject', text: 'Our summer sale' }, { id: 'text-1', text: rewritten }] },
    { fixes: [{ id: 'text-1', text: LINKED.replace('are on', 'is on') }] }
  );
  const result = await proofread(repaired.model);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.fixes.map((fix) => fix.id), ['subject', 'text-1']);
  const repair = repaired.requests[1].messages;
  assert.equal(repair.length, 3);
  assert.equal(repair[1].role, 'assistant');
  assert.match(repair[2].content, /only the texts listed here/);
  assert.match(repair[2].content, /Text text-1: too many words changed/);
  assert.doesNotMatch(repair[2].content, /Text subject/);

  const stubborn = fakeModel({ fixes: [{ id: 'subject', text: 'Our summer sale' }, { id: 'text-1', text: rewritten }] });
  assert.deepEqual(await proofread(stubborn.model), { fixes: [{ id: 'subject', text: 'Our summer sale' }], attempts: 2 });

  // Unread once, read the second time.
  const late = fakeModel('The email looks fine to me!', { fixes: [{ id: 'subject', text: 'Our summer sale' }] });
  assert.deepEqual(await proofread(late.model), { fixes: [{ id: 'subject', text: 'Our summer sale' }], attempts: 2 });
  assert.match(late.requests[1].messages[2].content, /not the expected JSON object/);
});

test('proofreader: never readable → INVALID_ANSWER; refusal → PROOFREAD_REFUSED; model errors and aborts go through', async () => {
  await assert.rejects(proofread(fakeModel('Looks good.').model), (error) => error.code === 'INVALID_ANSWER' && error.status === 502);
  await assert.rejects(proofread(fakeModel(new EmailGenerationError('REFUSED')).model), (error) => error.code === 'PROOFREAD_REFUSED' && error.status === 422);
  await assert.rejects(proofread(fakeModel(new Error('overloaded')).model), /overloaded/);
  await assert.rejects(proofread(fakeModel({ fixes: [] }).model, { texts: [] }), (error) => error.code === 'NOTHING_TO_PROOFREAD');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createEmailGenerator({ model: fakeModel({ fixes: [] }).model }).proofread({ texts: EMAIL }, { signal: controller.signal }),
    { name: 'AbortError' }
  );
});

test('route POST /proofread: 501 without a proofreader, the server language by default, rate limit, errors translated', async () => {
  const make = (options) => {
    const handler = createEmailBuilderHandler({
      templates: createMemoryTemplateRepository(),
      assets: createMemoryAssetRepository(),
      authorize: (request) => (request.headers.get('authorization') === 'Bearer ok' ? { id: 7 } : null),
      onError: () => {},
      ...options,
    });
    return (body, { auth = true } = {}) =>
      handler(
        new Request('https://app.example.com/api/email-builder/proofread', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
          body: JSON.stringify(body),
        })
      );
  };
  assert.equal((await make({})({ texts: EMAIL })).status, 501);
  assert.equal((await make({ generator: { rewrite: async () => ({}) } })({ texts: EMAIL })).status, 501);

  const inputs = [];
  const post = make({
    generator: { proofread: async (input, { user }) => (inputs.push({ input, user }), { fixes: [] }) },
    rateLimits: { proofreadPerHour: 2 },
    locale: 'fr',
  });
  assert.equal((await post({ texts: EMAIL }, { auth: false })).status, 401);
  const ok = await post({ texts: EMAIL });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { fixes: [] });
  assert.equal(inputs[0].input.language, 'fr', 'the server language by default');
  assert.deepEqual(inputs[0].user, { id: 7 });
  await post({ texts: EMAIL, language: 'de' });
  assert.equal(inputs[1].input.language, 'de');
  const limited = await post({ texts: EMAIL });
  assert.equal(limited.status, 429);
  assert.match((await limited.json()).error, /Trop de relectures/);

  const real = make({ generator: createEmailGenerator({ model: fakeModel('Looks fine.').model }), locale: 'fr' });
  const empty = await real({ texts: [{ id: 'image', text: '<p>2026</p>', format: 'html' }] });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /pas encore de texte à vérifier/);
  const unread = await real({ texts: EMAIL });
  assert.equal(unread.status, 502);
  const body = await unread.json();
  assert.equal(body.code, 'INVALID_ANSWER');
  assert.match(body.error, /La réponse de l'IA est illisible/);
});
