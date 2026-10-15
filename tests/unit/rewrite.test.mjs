/**
 * REWRITE: one text of an email rewritten by a model. The model is a fake
 * that answers what a real one gets wrong — a lost variable, a lost or
 * invented link, forbidden HTML, markup in a button label — and what comes
 * out must keep what the email depends on, or not be used at all.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
} from '../../src/server/index.js';
import {
  REWRITE_ACTIONS,
  REWRITE_LANGUAGES,
  claudeEmailModel,
  createEmailGenerator,
  reviewRewrite,
} from '../../src/ai/server.js';
import { buildRewritePrompt, cleanRewriteInput, parseRewrite } from '../../src/ai/rewrite.js';

const GREETING = 'Hello {{contact.firstname|there}}, see <a href="https://example.com/news">the news</a>.';

/** A fake model answering `answers` in turn; records its requests. @param {string[]} answers */
function fakeModel(answers) {
  const requests = [];
  const model = async (request) => {
    requests.push(structuredClone({ ...request, signal: undefined }));
    return JSON.stringify({ text: answers[Math.min(requests.length - 1, answers.length - 1)] });
  };
  return { model, requests };
}

test('actions and languages: unique ids, each with a label and a change to ask for', () => {
  const ids = REWRITE_ACTIONS.map((action) => action.id);
  assert.deepEqual(ids, ['shorter', 'longer', 'fix', 'friendlier', 'formal']);
  for (const action of REWRITE_ACTIONS) assert.ok(action.label && action.change.length > 20, action.id);
  assert.ok(REWRITE_LANGUAGES.includes('fr') && REWRITE_LANGUAGES.includes('uk'));
  assert.equal(new Set(REWRITE_LANGUAGES).size, REWRITE_LANGUAGES.length);
});

test('input: an action, a language for translate, the user words for custom; empty text refused', () => {
  assert.match(cleanRewriteInput({ action: 'shorter', text: GREETING }).change, /shorter/);
  assert.match(cleanRewriteInput({ action: 'translate', text: 'Hi', targetLanguage: 'de' }).change, /German/);
  assert.equal(cleanRewriteInput({ action: 'custom', text: 'Hi', instruction: '  Say hello  ' }).change, 'Say hello');
  assert.equal(cleanRewriteInput({ action: 'fix', text: 'Hi', format: 'plain' }).format, 'plain');
  assert.equal(cleanRewriteInput({ action: 'fix', text: 'Hi', format: 'weird' }).format, 'html');
  for (const input of [
    { action: 'shorter', text: '  <br />  ' },
    { action: 'translate', text: 'Hi', targetLanguage: '<script>' },
    { action: 'custom', text: 'Hi', instruction: '   ' },
    { action: 'delete everything', text: 'Hi' },
    null,
  ]) {
    assert.throws(() => cleanRewriteInput(input), (error) => error.code === 'NOTHING_TO_REWRITE', JSON.stringify(input));
  }
  const prompt = buildRewritePrompt(cleanRewriteInput({ action: 'formal', text: GREETING }));
  assert.match(prompt, /^Change: Make the tone more professional/);
  assert.match(prompt, /Format: HTML/);
  assert.ok(prompt.includes(`<text>\n${GREETING}\n</text>`));
});

test('parseRewrite: the JSON field, fenced or bare; a bare answer is the text itself', () => {
  assert.equal(parseRewrite('{"text":"Hi"}'), 'Hi');
  assert.equal(parseRewrite('```json\n{"text":" Hi "}\n```'), 'Hi');
  assert.equal(parseRewrite('<text>\nHi <b>you</b>\n</text>'), 'Hi <b>you</b>');
  assert.equal(parseRewrite('{not json'), '{not json');
  // Escaped twice by the model: decoded once more, so the link is found again.
  assert.equal(parseRewrite(JSON.stringify({ text: 'Hi <a href=\\"https://example.com\\">you</a>' })), 'Hi <a href="https://example.com">you</a>');
});

test('reviewRewrite: variables and links kept, none added, markup a text block accepts', () => {
  assert.deepEqual(reviewRewrite(GREETING, 'Hi {{ contact.firstname|toi }}, read <a href="https://example.com/news">this</a>.', 'html'), []);
  assert.match(reviewRewrite(GREETING, 'Hi, read <a href="https://example.com/news">this</a>.', 'html')[0], /\{\{contact\.firstname\}\} is missing/);
  assert.match(reviewRewrite(GREETING, 'Hi {{contact.firstname}}, read the news.', 'html')[0], /link to https:\/\/example\.com\/news is missing/);
  assert.ok(
    reviewRewrite(GREETING, `${GREETING} <a href="https://evil.example">More</a>`, 'html').some((p) => /evil\.example was added/.test(p))
  );
  assert.ok(reviewRewrite(GREETING, `${GREETING} {{contact.email}}`, 'html').some((p) => /contact\.email\}\} was added/.test(p)));
  assert.ok(reviewRewrite('Hi', 'Hi <script>alert(1)</script>', 'html').length > 0, 'forbidden HTML');
  assert.deepEqual(reviewRewrite('Learn more', 'Read the story', 'plain'), []);
  assert.deepEqual(reviewRewrite('Hi', '   ', 'html'), ['The answer is empty.']);
});

test('rewriter: one call when the answer is fine; the task is "rewrite"', async () => {
  const { model, requests } = fakeModel(['Hi {{contact.firstname|there}}, the <a href="https://example.com/news">news</a>.']);
  const { rewrite } = createEmailGenerator({ model });
  const result = await rewrite({ action: 'shorter', text: GREETING });
  assert.deepEqual(result, { text: 'Hi {{contact.firstname|there}}, the <a href="https://example.com/news">news</a>.', attempts: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].task, 'rewrite');
  assert.match(requests[0].system, /Keep every link/);
  assert.deepEqual(requests[0].schema.required, ['text']);
});

test('rewriter: a lost variable is sent back once; twice lost → nothing used', async () => {
  const fixed = fakeModel(['Hi, the news.', 'Hi {{contact.firstname}}, the <a href="https://example.com/news">news</a>.']);
  const result = await createEmailGenerator({ model: fixed.model }).rewrite({ action: 'longer', text: GREETING });
  assert.equal(result.attempts, 2);
  assert.equal(fixed.requests[1].messages.length, 3);
  assert.match(fixed.requests[1].messages[2].content, /contact\.firstname\}\} is missing/);

  const lost = fakeModel(['Hi, the news.']);
  await assert.rejects(createEmailGenerator({ model: lost.model }).rewrite({ action: 'fix', text: GREETING }), (error) => {
    assert.equal(error.code, 'REWRITE_UNUSABLE');
    assert.equal(error.status, 502);
    assert.match(error.detail, /missing/);
    return true;
  });
});

test('rewriter: a button label comes back as plain words; refusal and aborts go through', async () => {
  const { model } = fakeModel(['<b>Read  the\nstory</b>']);
  assert.deepEqual(await createEmailGenerator({ model }).rewrite({ action: 'friendlier', text: 'Learn more', format: 'plain' }), {
    text: 'Read the story',
    attempts: 1,
  });

  const refused = createEmailGenerator({
    model: async () => {
      const { EmailGenerationError } = await import('../../src/ai/draft.js');
      throw new EmailGenerationError('REFUSED');
    },
  });
  await assert.rejects(refused.rewrite({ action: 'fix', text: 'Hi' }), (error) => error.code === 'REWRITE_REFUSED' && error.status === 422);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(createEmailGenerator({ model }).rewrite({ action: 'fix', text: 'Hi' }, { signal: controller.signal }), { name: 'AbortError' });
});

test('claudeEmailModel: a rewrite asks for less effort than an email', async () => {
  const efforts = [];
  const client = {
    messages: {
      stream: (params) => {
        efforts.push(params.output_config.effort);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":"Hi"}' }] }) };
      },
    },
  };
  const model = claudeEmailModel({ client });
  await model({ system: '', messages: [], schema: {}, task: 'generate' });
  await model({ system: '', messages: [], schema: {}, task: 'rewrite' });
  await claudeEmailModel({ client, rewriteEffort: 'medium' })({ system: '', messages: [], schema: {}, task: 'rewrite' });
  assert.deepEqual(efforts, ['medium', 'low', 'medium']);
});

test('route POST /rewrite: 501 without a rewriter, rate limit, errors translated', async () => {
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
        new Request('https://app.example.com/api/email-builder/rewrite', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
          body: JSON.stringify(body),
        })
      );
  };
  assert.equal((await make({})({ action: 'fix', text: 'Hi' })).status, 501);
  assert.equal((await make({ generator: { generate: async () => ({}) } })({ action: 'fix', text: 'Hi' })).status, 501);

  const post = make({ generator: createEmailGenerator({ model: fakeModel(['Hello']).model }), rateLimits: { rewritePerHour: 2 }, locale: 'fr' });
  assert.equal((await post({ action: 'fix', text: 'Hi' }, { auth: false })).status, 401);
  const ok = await post({ action: 'fix', text: 'Hi' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.text, 'Hello');
  const empty = await post({ action: 'fix', text: '' });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /Il n'y a pas de texte/);
  assert.equal((await post({ action: 'fix', text: 'Hi' })).status, 429);

  const lost = make({ generator: createEmailGenerator({ model: fakeModel(['No variable']).model }), locale: 'fr' });
  const failed = await lost({ action: 'fix', text: GREETING });
  assert.equal(failed.status, 502);
  const body = await failed.json();
  assert.equal(body.code, 'REWRITE_UNUSABLE');
  assert.match(body.error, /rien n'a été modifié/);
});
