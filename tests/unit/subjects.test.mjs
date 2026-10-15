/**
 * SUBJECT IDEAS: three other subject lines for an email, drawn from its words.
 * The model is a fake that answers what a real one gets wrong — a repeat of
 * the current subject, an unknown merge tag, a list in prose — and what comes
 * out is three distinct plain lines, or as many good ones as came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claudeEmailModel,
  createEmailBuilderHandler,
  createEmailGenerator,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  emailWords,
  reviewSubjects,
} from '../../src/server/index.js';
import { buildSubjectsPrompt, cleanSubjectsInput, parseSubjects } from '../../src/features/generate/subjects.js';
import { createHttpStorage, createMemoryStorage } from '../../src/storage/client.js';

const EMAIL =
  '<mjml><mj-head><mj-title>Hidden</mj-title><mj-style>.x{color:red}</mj-style></mj-head><mj-body><mj-section><mj-column>' +
  '<mj-text><p>Hello {{contact.firstname|there}},</p><p>Our <b>spring sale</b> starts&nbsp;today &amp; ends Sunday.</p></mj-text>' +
  '<mj-button href="https://example.com/sale">Shop the sale</mj-button>' +
  '</mj-column></mj-section></mj-body></mjml>';

/** A fake model answering `answers` (arrays of subjects) in turn; records its requests. */
function fakeModel(answers) {
  const requests = [];
  const model = async (request) => {
    requests.push(structuredClone({ ...request, signal: undefined }));
    const answer = answers[Math.min(requests.length - 1, answers.length - 1)];
    return typeof answer === 'string' ? answer : JSON.stringify({ subjects: answer });
  };
  return { model, requests };
}

test('emailWords: what a reader sees, one line per paragraph, no head, no markup', () => {
  assert.equal(emailWords(EMAIL), 'Hello {{contact.firstname|there}},\nOur spring sale starts today & ends Sunday.\nShop the sale');
  assert.equal(emailWords(''), '');
  assert.equal(emailWords(`<mjml><mj-body><mj-text>${'word '.repeat(2000)}</mj-text></mj-body></mjml>`).length, 4000);
});

test('cleanSubjectsInput: nothing to draw from is refused; link variables and unsubscribe are not offered', () => {
  assert.throws(() => cleanSubjectsInput({}), (error) => error.code === 'NOTHING_TO_SUGGEST' && error.status === 400);
  const request = cleanSubjectsInput({ subject: '  "Spring news"  ', text: 'Hi', language: 'xx-!!', avoid: ['', 'Old one'] });
  assert.equal(request.subject, 'Spring news');
  assert.equal(request.language, 'en');
  assert.deepEqual(request.avoid, ['Old one']);
  const keys = request.variables.map((variable) => variable.key);
  assert.ok(keys.includes('contact.firstname'));
  assert.ok(!keys.includes('unsubscribe'));
  // A subject alone is enough.
  assert.equal(cleanSubjectsInput({ subject: 'Spring news' }).text, '');
});

test('buildSubjectsPrompt: the inbox, the ideas to avoid, the merge tags, the words', () => {
  const prompt = buildSubjectsPrompt(cleanSubjectsInput({ subject: 'Spring news', preheader: 'Up to 30% off', text: 'Our sale', avoid: ['Old one'] }));
  assert.match(prompt, /^Current subject: Spring news\nPreview text: Up to 30% off\nAlready suggested, do not repeat: "Old one"\n/);
  assert.match(prompt, /\{\{contact\.firstname\}\} \(First name\)/);
  assert.ok(prompt.endsWith('<email>\nOur sale\n</email>'));
  assert.doesNotMatch(prompt, /no words yet/);
  // No words yet: the interface language says which language to write in.
  assert.match(buildSubjectsPrompt(cleanSubjectsInput({ subject: 'Soldes', language: 'fr' })), /no words yet: write in French/);
});

test('parseSubjects: the JSON field, fenced; else one per line, list marks and quotes removed', () => {
  assert.deepEqual(parseSubjects('```json\n{"subjects":[" A ","<b>B</b>","C"]}\n```'), ['A', 'B', 'C']);
  assert.deepEqual(parseSubjects('1. "First"\n- Second\n• «Third»'), ['First', 'Second', 'Third']);
  // A sentence starts with a capital; a word styled on purpose stays.
  assert.deepEqual(parseSubjects('{"subjects":["votre commande est partie","iPhone deals","{{contact.firstname}}, hi","été 2026"]}'), [
    'Votre commande est partie',
    'iPhone deals',
    '{{contact.firstname}}, hi',
    'Été 2026',
  ]);
});

test('reviewSubjects: repeats and unknown merge tags are left out and explained', () => {
  const request = cleanSubjectsInput({ subject: 'Spring news', text: 'Hi', avoid: ['Old one'] });
  assert.deepEqual(reviewSubjects(['A', 'B', '{{contact.firstname}}, C', 'D'], request), { usable: ['A', 'B', '{{contact.firstname}}, C'], problems: [] });
  const { usable, problems } = reviewSubjects(['spring NEWS', 'old one', '{{coupon}} inside', 'A', 'a'], request);
  assert.deepEqual(usable, ['A']);
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /\{\{coupon\}\}, which is not in the list/);
  assert.deepEqual(reviewSubjects(['A'], request).problems, ['Give exactly 3 subjects.']);
});

test('suggester: one call when fine (task "subjects"); one repair turn; fewer than three still shown; refusal', async () => {
  const fine = fakeModel([['A', 'B', 'C']]);
  assert.deepEqual(await createEmailGenerator({ model: fine.model }).suggestSubjects({ text: 'Hi' }), { subjects: ['A', 'B', 'C'], attempts: 1 });
  assert.equal(fine.requests[0].task, 'subjects');

  const repaired = fakeModel([['Spring news', 'A', 'A'], ['A', 'B', 'C']]);
  const result = await createEmailGenerator({ model: repaired.model }).suggestSubjects({ subject: 'Spring news', text: 'Hi' });
  assert.deepEqual(result, { subjects: ['A', 'B', 'C'], attempts: 2 });
  assert.match(repaired.requests[1].messages[2].content, /repeats the current subject/);

  const short = fakeModel([['A'], ['A', 'B']]);
  assert.deepEqual((await createEmailGenerator({ model: short.model }).suggestSubjects({ text: 'Hi' })).subjects, ['A', 'B']);
  await assert.rejects(
    createEmailGenerator({ model: fakeModel([[]]).model }).suggestSubjects({ text: 'Hi' }),
    (error) => error.code === 'SUBJECTS_UNUSABLE' && error.status === 502
  );
  const refused = createEmailGenerator({
    model: claudeEmailModel({
      client: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'refusal', content: [] }) }) } },
    }),
  });
  await assert.rejects(refused.suggestSubjects({ text: 'Hi' }), (error) => error.code === 'SUBJECTS_REFUSED' && error.status === 422);
});

test('claudeEmailModel: subject ideas ask for the light effort', async () => {
  const efforts = [];
  const client = {
    messages: {
      stream: (params) => {
        efforts.push(params.output_config.effort);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"subjects":[]}' }] }) };
      },
    },
  };
  await claudeEmailModel({ client })({ system: '', messages: [], schema: {}, task: 'subjects' });
  await claudeEmailModel({ client, effort: 'high' })({ system: '', messages: [], schema: {}, task: 'generate' });
  assert.deepEqual(efforts, ['low', 'high']);
});

test('route POST /subjects: 501 without a suggester, the server catalog, rate limit, errors translated', async () => {
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
        new Request('https://app.example.com/api/email-builder/subjects', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
          body: JSON.stringify(body),
        })
      );
  };
  assert.equal((await make({})({ text: 'Hi' })).status, 501);
  assert.equal((await make({ generator: { generate: async () => ({}) } })({ text: 'Hi' })).status, 501);

  const fake = fakeModel([['{{secret.token}} for you', 'A', 'B', 'C']]);
  const post = make({ generator: createEmailGenerator({ model: fake.model }), rateLimits: { subjectsPerHour: 2 }, locale: 'fr', lang: 'fr' });
  assert.equal((await post({ text: 'Hi' }, { auth: false })).status, 401);
  // The browser's list of merge tags is ignored: the server's catalog wins.
  const ok = await post({ text: 'Bonjour', variables: [{ key: 'secret.token', label: 'Secret' }] });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.subjects, ['A', 'B', 'C']);
  assert.doesNotMatch(fake.requests[0].messages[0].content, /secret\.token/);
  const empty = await post({ text: '' });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /Rédigez d'abord/);
  assert.equal((await post({ text: 'Hi' })).status, 429);
});

test('storages: HTTP suggestSubjects with generate, memory when given', async () => {
  assert.equal(createHttpStorage().suggestSubjects, undefined);
  const seen = [];
  const storage = createHttpStorage({
    generate: true,
    fetch: async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ data: { subjects: ['A', 'B', 'C'] } }), { status: 200 });
    },
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await storage.suggestSubjects({ text: 'Hi' }, { signal }), { subjects: ['A', 'B', 'C'] });
  assert.equal(seen[0].url, '/api/email-builder/subjects');
  assert.equal(seen[0].init.signal, signal);
  assert.equal(createMemoryStorage().suggestSubjects, undefined);
  const suggestSubjects = async () => ({ subjects: ['A'] });
  assert.equal(createMemoryStorage({ suggestSubjects }).suggestSubjects, suggestSubjects);
});
