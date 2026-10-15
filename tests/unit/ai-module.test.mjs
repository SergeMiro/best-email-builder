/**
 * THE AI MODULE — `createAi` (best-email-builder/ai) and what a server
 * without the AI does.
 *
 * The builder side (no button without the module, only the parts the module
 * has) is driven in the browser: e2e/ai-module.stories.spec.js. That no entry
 * of the core reaches the module's code: entries.test.mjs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  LOCALES,
  messagesOf,
} from '../../src/server/index.js';
import { AI_MESSAGES, createEmailGenerator } from '../../src/ai/server.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The module's browser entry, JSX compiled (its packages stay external, resolved from node_modules). */
async function loadAiEntry() {
  const outfile = path.join(root, 'node_modules', '.cache', 'eb-unit', 'ai-entry.mjs');
  await build({
    entryPoints: [path.join(root, 'src/ai/index.js')],
    bundle: true,
    outfile,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.js': 'jsx' },
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?t=${fs.statSync(outfile).mtimeMs}`);
}
const { createAi } = await loadAiEntry();

/** A fetch that answers `data` (or an error) and records what it was asked. */
function fakeFetch(answer = () => ({ status: 200, body: { data: { ok: true } } })) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const { status, body } = answer(url, init);
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const PARTS = ['generate', 'rewrite', 'suggestSubjects'];
const on = (ai) => PARTS.filter((part) => typeof ai[part] === 'function');

test('createAi(): the three parts over HTTP, at the handler’s routes, with the host’s headers and the signal', async () => {
  const { fetch, calls } = fakeFetch((url) => ({ status: 200, body: { data: { url } } }));
  let token = 'a';
  const ai = createAi({ baseUrl: '/api/mail/', headers: () => ({ Authorization: `Bearer ${token}` }), fetch });
  assert.deepEqual(on(ai), PARTS);
  const signal = new AbortController().signal;
  assert.deepEqual(await ai.generate({ purpose: 'sale' }, { signal }), { url: '/api/mail/generate' });
  token = 'b';
  await ai.rewrite({ action: 'fix', text: 'Hi' });
  await ai.suggestSubjects({ text: 'Hi' });
  assert.deepEqual(
    calls.map((c) => [c.url, c.init.method, c.init.headers.Authorization, c.init.headers['Content-Type']]),
    [
      ['/api/mail/generate', 'POST', 'Bearer a', 'application/json'],
      ['/api/mail/rewrite', 'POST', 'Bearer b', 'application/json'],
      ['/api/mail/subjects', 'POST', 'Bearer b', 'application/json'],
    ]
  );
  assert.equal(calls[0].init.signal, signal);
  assert.deepEqual(calls[0].body, { purpose: 'sale' });
  // Without any option: the handler's default base path.
  const plain = fakeFetch();
  const ai2 = createAi({ fetch: plain.fetch });
  await ai2.suggestSubjects({ text: 'Hi' });
  assert.equal(plain.calls[0].url, '/api/email-builder/subjects');
  assert.deepEqual(on(createAi()), PARTS);
});

test('createAi(): a server error comes back with its message, status and code', async () => {
  const { fetch } = fakeFetch(() => ({ status: 501, body: { error: 'Subject ideas are not configured', code: 'NO_GENERATOR' } }));
  const ai = createAi({ fetch });
  await assert.rejects(ai.suggestSubjects({ text: 'Hi' }), (error) => {
    assert.equal(error.name, 'StorageError');
    assert.equal(error.message, 'Subject ideas are not configured');
    assert.equal(error.status, 501);
    assert.equal(error.code, 'NO_GENERATOR');
    return true;
  });
  // Not JSON at all (a proxy's error page): still a clear error.
  const broken = createAi({ fetch: async () => new Response('<html>Bad gateway</html>', { status: 502 }) });
  await assert.rejects(broken.rewrite({ action: 'fix', text: 'Hi' }), /HTTP 502/);
});

test('createAi(): only the parts asked for — false leaves one out, functions of one’s own are the only ones on', async () => {
  const { fetch, calls } = fakeFetch();
  const noGenerate = createAi({ fetch, generate: false });
  assert.deepEqual(on(noGenerate), ['rewrite', 'suggestSubjects']);
  assert.equal(noGenerate.generate, null);

  const rewrite = async () => ({ text: 'Hello' });
  const own = createAi({ rewrite });
  assert.deepEqual(on(own), ['rewrite']);
  assert.equal(own.rewrite, rewrite);
  assert.equal(own.generate, null);
  assert.equal(own.suggestSubjects, null);

  // A function of one's own next to the server: that part is the host's, the others the server's.
  const mixed = createAi({ fetch, rewrite });
  assert.deepEqual(on(mixed), PARTS);
  assert.equal(mixed.rewrite, rewrite);
  await mixed.generate({ purpose: 'sale' });
  assert.equal(calls.at(-1).url, '/api/email-builder/generate');

  const none = createAi({ fetch, generate: false, rewrite: false, suggestSubjects: false });
  assert.deepEqual(on(none), []);
});

test('createAi({ model }): the generator runs in the page — the model is asked, the network is not', async () => {
  const asked = [];
  const model = async ({ task }) => {
    asked.push(task);
    return JSON.stringify({ subjects: ['First idea', 'Second idea', 'Third idea'] });
  };
  const ai = createAi({ model });
  assert.deepEqual(on(ai), PARTS);
  const { subjects } = await ai.suggestSubjects({ subject: 'Spring news', text: 'Our spring collection is here.' });
  assert.deepEqual(subjects, ['First idea', 'Second idea', 'Third idea']);
  assert.deepEqual(asked, ['subjects']);
  assert.deepEqual(on(createAi({ model, suggestSubjects: false })), ['generate', 'rewrite']);
});

test('createAi(): wrong options are refused at once, with what to do', () => {
  assert.throws(() => createAi({ model: async () => '', baseUrl: '/api' }), /not both/);
  assert.throws(() => createAi({ model: 'claude' }), /`model` must be a function/);
  assert.throws(() => createAi({ generate: 'yes' }), /`generate` must be a function, true or false/);
  assert.throws(() => createAi(null), /options must be an object/);
});

test('createAi(): what the builder reads — frozen, its three components, its own French texts', () => {
  const ai = createAi({ rewrite: async () => ({ text: '' }) });
  assert.ok(Object.isFrozen(ai) && Object.isFrozen(ai.components));
  assert.throws(() => {
    'use strict';
    ai.generate = async () => ({});
  }, TypeError);
  for (const name of ['Generate', 'Rewrite', 'Subjects']) assert.equal(typeof ai.components[name], 'function', name);
  assert.deepEqual(ai.messages, AI_MESSAGES);
  assert.equal(ai.messages.fr['Suggest subjects'], 'Suggérer des objets');
});

test('dictionaries: the AI’s texts are in its own, not in the core’s; the core keeps what both use', () => {
  const core = LOCALES.fr;
  const aiFr = AI_MESSAGES.fr;
  for (const key of ['Suggest subjects', 'Rewrite with AI', 'Generate an email', 'More ideas', 'Done', 'No usable subject came back. Try again.']) {
    assert.ok(key in aiFr, `${key} in the AI's dictionary`);
    assert.ok(!(key in core), `${key} not shipped without the AI`);
  }
  assert.deepEqual(Object.keys(aiFr).filter((key) => key in core), [], 'no text in both');
  // Words the core shows too stay the core's.
  for (const key of ['Cancel', 'Retry']) assert.ok(key in core, key);
  assert.ok(Object.keys(aiFr).length > 100);
});

test('messagesOf: the dictionary of a locale among several', () => {
  const dictionaries = { en: {}, fr: { Save: 'Enregistrer' } };
  assert.equal(messagesOf(dictionaries, 'fr-FR'), dictionaries.fr);
  assert.equal(messagesOf(dictionaries, 'FR'), dictionaries.fr);
  assert.deepEqual(messagesOf(dictionaries, 'de'), {});
  assert.deepEqual(messagesOf(dictionaries, 'constructor'), {}, 'not the prototype of a plain object');
  assert.deepEqual(messagesOf(null, 'fr'), {});
});

/** A handler, and a POST to one of its routes. */
function server(options = {}) {
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    authorize: () => ({ id: 1 }),
    onError: () => {},
    ...options,
  });
  return async (route, body) => {
    const response = await handler(
      new Request(`https://app.example.com/api/email-builder/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    return { status: response.status, ...(await response.json()) };
  };
}

test('server without the AI: every AI route answers 501 NO_GENERATOR, the rest works', async () => {
  const post = server();
  for (const [route, body] of [
    ['generate', { purpose: 'sale' }],
    ['rewrite', { action: 'fix', text: 'Hi' }],
    ['subjects', { text: 'Hi' }],
  ]) {
    const answer = await post(route, body);
    assert.equal(answer.status, 501, route);
    assert.equal(answer.code, 'NO_GENERATOR', route);
  }
  // A generator with one part only: the others stay 501.
  const partial = server({ generator: { rewrite: async ({ text }) => ({ text: `${text}!` }) } });
  assert.equal((await partial('generate', { purpose: 'sale' })).status, 501);
  assert.equal((await partial('subjects', { text: 'Hi' })).status, 501);
  assert.deepEqual((await partial('rewrite', { action: 'fix', text: 'Hi' })).data, { text: 'Hi!' });
});

test('server with the AI: its errors are recognised without importing it, in the server’s language', async () => {
  const thrown = (error) => server({ generator: { suggestSubjects: async () => Promise.reject(error) } });
  // Shaped like EmailGenerationError (best-email-builder/ai/server): its status and code.
  const refused = await thrown(
    Object.assign(new Error('The AI declined to suggest subjects for this email.'), { name: 'EmailGenerationError', status: 422, code: 'SUBJECTS_REFUSED' })
  )('subjects', { text: 'Hi' });
  assert.deepEqual([refused.status, refused.code], [422, 'SUBJECTS_REFUSED']);
  // Anything else is the model service failing: 502, and nothing of it leaks.
  const down = await thrown(Object.assign(new Error('ECONNRESET 10.0.0.3'), { status: 500, code: 'X' }))('subjects', { text: 'Hi' });
  assert.deepEqual([down.status, down.code], [502, 'MODEL_ERROR']);
  assert.doesNotMatch(down.error, /ECONNRESET|10\.0\.0\.3/);

  // The generator's own texts in French, under the host's.
  const french = server({ locale: 'fr', generator: createEmailGenerator({ model: async () => '{"subjects": []}' }) });
  const unusable = await french('subjects', { text: 'Bonjour' });
  assert.equal(unusable.status, 502);
  assert.equal(unusable.code, 'SUBJECTS_UNUSABLE');
  assert.equal(unusable.error, AI_MESSAGES.fr['No usable subject came back. Try again.']);
  const hosted = server({
    locale: 'fr',
    messages: { 'No usable subject came back. Try again.': 'Rien de bon, réessayez.' },
    generator: createEmailGenerator({ model: async () => '{"subjects": []}' }),
  });
  assert.equal((await hosted('subjects', { text: 'Bonjour' })).error, 'Rien de bon, réessayez.');
});
