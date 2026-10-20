/**
 * SUBJECT IDEAS: three other subject lines for an email, drawn from its words.
 * The model is a fake that answers what a real one gets wrong — a repeat of
 * the current subject, an unknown merge tag, a list in prose — and what comes
 * out is three distinct plain lines, or as many good ones as came back.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
} from '../../src/server/index.js';
import {
  claudeEmailModel,
  createEmailGenerator,
  emailWords,
  reviewSubjects,
} from '../../src/ai/server.js';
import { buildSubjectsPrompt, cleanSubjectsInput, parseSubjects } from '../../src/ai/subjects.js';
import { DEFAULT_VARIABLES, EXAMPLE_VARIABLES } from '../../src/features/variables/catalog.js';

/** What the builder sends: the application's variables (none by default but the unsubscribe link). */
const VARIABLES = [...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES];

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
  const request = cleanSubjectsInput({ subject: '  "Spring news"  ', text: 'Hi', language: 'xx-!!', avoid: ['', 'Old one'], variables: VARIABLES });
  assert.equal(request.subject, 'Spring news');
  assert.equal(request.language, 'en');
  assert.deepEqual(request.avoid, ['Old one']);
  const keys = request.variables.map((variable) => variable.key);
  assert.ok(keys.includes('contact.firstname'));
  assert.ok(!keys.includes('unsubscribe'));
  // A subject alone is enough; without variables, none is offered.
  assert.equal(cleanSubjectsInput({ subject: 'Spring news' }).text, '');
  assert.deepEqual(cleanSubjectsInput({ subject: 'Spring news' }).variables, []);
});

test('buildSubjectsPrompt: the inbox, the ideas to avoid, the merge tags, the words', () => {
  const prompt = buildSubjectsPrompt(cleanSubjectsInput({ subject: 'Spring news', preheader: 'Up to 30% off', text: 'Our sale', avoid: ['Old one'], variables: VARIABLES }));
  assert.match(prompt, /^Current subject: Spring news\nPreview text: Up to 30% off\nAlready suggested, do not repeat: "Old one"\n/);
  assert.match(prompt, /\{\{contact\.firstname\}\} \(First name\)/);
  assert.ok(prompt.endsWith('<email>\nOur sale\n</email>'));
  assert.doesNotMatch(prompt, /no words yet/);
  // No words yet: the interface language says which language to write in.
  // No words yet: the subject's language, the interface's when the subject does not tell.
  assert.match(
    buildSubjectsPrompt(cleanSubjectsInput({ subject: 'Soldes', language: 'FR' })),
    /no words yet: write in the language of its subject \(French if the subject does not tell\)/
  );
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
  const request = cleanSubjectsInput({ subject: 'Spring news', text: 'Hi', avoid: ['Old one'], variables: VARIABLES });
  assert.deepEqual(reviewSubjects(['A', 'B', '{{contact.firstname}}, C', 'D'], request), { usable: ['A', 'B', '{{contact.firstname}}, C'], problems: [] });
  const { usable, problems } = reviewSubjects(['spring NEWS', 'old one', '{{coupon}} inside', 'A', 'a'], request);
  assert.deepEqual(usable, ['A']);
  assert.equal(problems.length, 4);
  assert.match(problems.join('\n'), /\{\{coupon\}\}, which is not in the list/);
  assert.deepEqual(reviewSubjects(['A'], request).problems, ['Give exactly 3 subjects, in the JSON field "subjects".']);
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

test('claudeEmailModel: subject ideas at the effort asked, low by default', async () => {
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
  await claudeEmailModel({ client, effort: 'high' })({ system: '', messages: [], schema: {}, task: 'subjects' });
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
  assert.equal((await make({ generator: { proofread: async () => ({}) } })({ text: 'Hi' })).status, 501);

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

test('parseSubjects: what a model answers instead — an introduction, a wrong key, pretty JSON, things that are not strings', () => {
  // An introduction before the list is not a subject.
  assert.deepEqual(parseSubjects('Sure! Here are three subject lines for your email:\n1. Spring is here\n2. New season\n3. Fresh picks'), [
    'Spring is here',
    'New season',
    'Fresh picks',
  ]);
  // JSON with another key, pretty-printed or not: nothing (the model is asked again), never its punctuation.
  assert.deepEqual(parseSubjects('{\n  "subject_lines": [\n    "A",\n    "B"\n  ]\n}'), []);
  assert.deepEqual(parseSubjects('{"subjects": "A, B, C"}'), []);
  assert.deepEqual(parseSubjects('{"subjects": [ "A",'), [], 'cut JSON');
  // Only strings: no "[object Object]", no "2".
  assert.deepEqual(parseSubjects('{"subjects":[{"t":1},2,null,"Real one"]}'), ['Real one']);
  // Lines with no words, or JSON punctuation, are not subjects.
  assert.deepEqual(parseSubjects('---\n["A",\n42\nGood one'), ['Good one']);
  // The capital letter: after ¿ or «, never inside a merge tag, in the email's language.
  assert.deepEqual(parseSubjects('{"subjects":["¿listo para el verano?","« soldes » ici","{{contact.firstname}}, hi","istanbul calling"]}', 'tr'), [
    '¿Listo para el verano?',
    '« Soldes » ici',
    '{{contact.firstname}}, hi',
    'İstanbul calling',
  ]);
});

test('a subject keeps its own quotes, apostrophes and signs; only one pair around the whole line goes', () => {
  const subject = (text) => cleanSubjectsInput({ subject: text }).subject;
  assert.equal(subject('Our new book "Spring"'), 'Our new book "Spring"');
  assert.equal(subject('« Soldes » : -20 %'), '« Soldes » : -20 %');
  assert.equal(subject("'Tis the season"), "'Tis the season");
  assert.equal(subject('Save when a < b and c > d'), 'Save when a < b and c > d');
  assert.equal(subject('Q&A <live> "today"'), 'Q&A <live> "today"', 'a word in angle brackets is not a tag');
  assert.equal(subject('<b>Spring</b> news'), 'Spring news');
  assert.equal(subject('"Spring news"'), 'Spring news');
  assert.equal(subject('«Spring news»'), 'Spring news');
  assert.equal(subject('"Spring" and "Summer"'), '"Spring" and "Summer"', 'two quoted words are not one wrapped line');
});

test('emailWords: entities decoded once, hex and named ones too; an impossible one stays as written', () => {
  const words = (html) => emailWords(`<mjml><mj-body><mj-text>${html}</mj-text></mj-body></mjml>`);
  assert.equal(words('It&rsquo;s &eacute;t&eacute; &#x2019; &#8364; &euro;'), 'It’s été ’ € €');
  assert.equal(words('&amp;#65; &amp;amp;'), '&#65; &amp;', 'decoded once, not twice');
  assert.equal(words('&#99999999; &#xD800; &unknown;'), '&#99999999; &#xD800; &unknown;');
});

test('reviewSubjects: capitals the email does not have, two "!", too long, the preview text, merge tags of other tools', () => {
  const request = cleanSubjectsInput({ subject: 'Spring news', preheader: 'Up to 30% off', text: 'Our IKEA partner sale', variables: VARIABLES });
  const { usable, problems } = reviewSubjects(
    [
      'HUGE sale today',
      'Hurry!! Last days',
      'x'.repeat(91),
      'up to 30% off',
      'Hi *|FNAME|*',
      'Hi %FIRSTNAME%',
      'Hi {contact.firstname}',
      'Our IKEA picks',
      '{{contact.firstname}}, your spring',
      'Save 30% this week!',
    ],
    request
  );
  assert.deepEqual(usable, ['Our IKEA picks', '{{contact.firstname}}, your spring', 'Save 30% this week!']);
  assert.equal(problems.length, 0, 'three good ones: no repair turn');
  const flagged = reviewSubjects(['HUGE sale today', 'Hurry!! Last days', 'x'.repeat(91), 'up to 30% off', 'Hi *|FNAME|*', 'Hi {contact.firstname}'], request).problems;
  assert.match(flagged.join('\n'), /HUGE in capitals/);
  assert.match(flagged.join('\n'), /more than one "!"/);
  assert.match(flagged.join('\n'), /91 characters long/);
  assert.match(flagged.join('\n'), /repeats the current subject, the preview text/);
  assert.match(flagged.join('\n'), /writes \*\|FNAME\|\*: merge tags are written \{\{key\}\}/);
  assert.match(flagged.join('\n'), /writes \{contact\.firstname\}/);
  // A percent sign in words is not a merge tag.
  assert.deepEqual(reviewSubjects(['20% off, 30% on Sunday', 'B', 'C'], request).usable, ['20% off, 30% on Sunday', 'B', 'C']);
});

test('suggester: an abort between attempts stops; a model error goes through; a worse second answer keeps the first', async () => {
  const controller = new AbortController();
  let calls = 0;
  const aborting = createEmailGenerator({
    model: async () => {
      calls += 1;
      controller.abort();
      return JSON.stringify({ subjects: ['Only one'] });
    },
  });
  await assert.rejects(aborting.suggestSubjects({ text: 'Hi' }, { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 1, 'no second call after the abort');

  const down = createEmailGenerator({ model: async () => Promise.reject(Object.assign(new Error('socket hang up'), { status: 503 })) });
  await assert.rejects(down.suggestSubjects({ text: 'Hi' }), (error) => error.message === 'socket hang up' && error.status === 503);

  const worse = fakeModel([['A', 'B'], ['C']]);
  assert.deepEqual(await createEmailGenerator({ model: worse.model }).suggestSubjects({ text: 'Hi' }), { subjects: ['A', 'B'], attempts: 2 });
  // The repair turn says what was wrong, and the model's own answer is in the conversation.
  assert.equal(worse.requests[1].messages[1].role, 'assistant');
  assert.match(worse.requests[1].messages[2].content, /Give exactly 3 subjects/);
});

test('route POST /subjects: cancelled → 499, bad JSON → 400, the server language when the browser sends none or a wrong one, link variables never offered', async () => {
  const seen = [];
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    authorize: () => ({ id: 1 }),
    onError: () => {},
    lang: 'de',
    variables: [{ key: 'offer.url', label: 'Offer link', kind: 'link' }, { key: 'offer.code', label: 'Code' }],
    generator: {
      suggestSubjects: async (input, { signal } = {}) => {
        seen.push(input);
        if (input.text === 'slow') {
          await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        }
        return createEmailGenerator({
          model: async ({ messages }) => {
            seen.push(messages[0].content);
            return JSON.stringify({ subjects: ['A', 'B', 'C'] });
          },
        }).suggestSubjects(input);
      },
    },
  });
  const post = (body, init = {}) =>
    handler(
      new Request('https://app.example.com/api/email-builder/subjects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        ...init,
      })
    );
  assert.equal((await post('{not json')).status, 400);

  assert.equal((await post({ subject: 'Frühling' })).status, 200);
  assert.equal(seen[0].language, 'de', 'no language sent: the server’s');
  assert.equal((await post({ subject: 'Frühling', language: 'fr!!' })).status, 200);
  assert.equal(seen.at(-2).language, 'de', 'a wrong one: the server’s');
  assert.equal((await post({ subject: 'Spring', language: 'en' })).status, 200);
  assert.equal(seen.at(-2).language, 'en');
  const prompt = seen.at(-1);
  assert.match(prompt, /\{\{offer\.code\}\} \(Code\)/);
  assert.doesNotMatch(prompt, /offer\.url|unsubscribe/, 'link variables are not subject material');

  const controller = new AbortController();
  const pending = post({ text: 'slow' }, { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  const cancelled = await pending;
  assert.equal(cancelled.status, 499);
  assert.equal((await cancelled.json()).code, 'CANCELLED');
});
