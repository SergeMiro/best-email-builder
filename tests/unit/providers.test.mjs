/**
 * AI PROVIDERS — `providerEmailModel` (src/ai/providers.js) against a fake
 * provider, and `createAi({ provider, apiKey | askKey })` with the user's key.
 *
 * The real providers are called by hand (see the README's "AI" section); here
 * every request is checked for its shape and every answer for its reading.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { AI_PROVIDERS, EmailGenerationError, GENERATION_ERRORS, providerEmailModel, resolveProvider } from '../../src/ai/server.js';
import { fr } from '../../src/ai/i18n/fr.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A provider that answers in turn what `answers` gives, and records each request. */
function fakeProvider(...answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body), signal: init.signal });
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    const { status = 200, body } = typeof answer === 'function' ? answer(calls.at(-1)) : answer;
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

/** An OpenAI-style answer with this text. */
const reply = (content, finish = 'stop') => ({ body: { choices: [{ message: { role: 'assistant', content }, finish_reason: finish }] } });

const REQUEST = {
  system: 'You rewrite texts.',
  messages: [{ role: 'user', content: 'Make it shorter.' }],
  schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
  task: /** @type {const} */ ('rewrite'),
};

/**
 * The code an EmailGenerationError carries, or the error itself when it is
 * something else. By name: the bundled browser entry has its own copy of the class.
 */
async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof EmailGenerationError || error?.name === 'EmailGenerationError') return error.code;
    throw error;
  }
  assert.fail('expected an EmailGenerationError');
}

test('every preset is complete, and a free one says what is free', () => {
  assert.ok(Object.keys(AI_PROVIDERS).length >= 8);
  for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
    assert.equal(provider.id, id);
    assert.ok(provider.name, id);
    if (id !== 'openai-compatible') assert.match(provider.baseUrl, /^https?:\/\/[^/]+/, id);
    assert.ok(['json_schema', 'json_object', 'text'].includes(provider.format), id);
    if (provider.keyUrl) assert.match(provider.keyUrl, /^https:\/\//, id);
    if (!provider.keyless) assert.ok(provider.keyUrl, `${id}: a user needs to know where to get a key`);
    if (provider.free) assert.ok(fr[provider.free], `${id}: "${provider.free}" has a French text`);
    assert.ok(Object.isFrozen(provider), id);
  }
  // The ones a user can start with for free.
  for (const id of ['openrouter', 'gemini', 'groq', 'mistral', 'cerebras', 'ollama']) assert.ok(AI_PROVIDERS[id].free, id);
  assert.equal(AI_PROVIDERS.openrouter.model, 'openrouter/free');
});

test('resolveProvider: a known id, a provider of one’s own, and nothing else', () => {
  assert.equal(resolveProvider('groq'), AI_PROVIDERS.groq);
  const own = resolveProvider({ baseUrl: 'http://localhost:1234/v1', model: 'qwen3' });
  assert.equal(own.id, 'openai-compatible');
  assert.equal(own.keyless, true);
  const tuned = resolveProvider({ id: 'groq', model: 'llama-4' });
  assert.equal(tuned.model, 'llama-4');
  assert.equal(tuned.baseUrl, AI_PROVIDERS.groq.baseUrl);
  assert.throws(() => resolveProvider('nope'), /Unknown AI provider "nope"/);
  assert.throws(() => resolveProvider('toString'), /Unknown AI provider/);
  assert.throws(() => resolveProvider(/** @type {any} */ (42)), TypeError);
});

test('providerEmailModel refuses what cannot work, before any call', () => {
  assert.throws(() => providerEmailModel({ provider: 'openrouter' }), /needs an `apiKey` \(https:\/\/openrouter\.ai\/keys\)/);
  assert.throws(() => providerEmailModel({ provider: 'ollama' }), /needs a `model`/);
  assert.throws(() => providerEmailModel({ provider: 'openai-compatible', model: 'x' }), /needs a `baseUrl`/);
  // Keyless: a local server.
  assert.doesNotThrow(() => providerEmailModel({ provider: 'ollama', model: 'llama3.2' }));
});

test('the request: chat completions, the key, the schema as structured output and in the instructions', async () => {
  const { fetch, calls } = fakeProvider(reply('{"text":"Hi"}'));
  const model = providerEmailModel({ provider: 'openrouter', apiKey: 'sk-or-test', fetch });
  assert.equal(model.model, 'openrouter/free');
  const controller = new AbortController();
  assert.equal(await model({ ...REQUEST, signal: controller.signal }), '{"text":"Hi"}');
  const [{ url, headers, body, signal }] = calls;
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(headers.Authorization, 'Bearer sk-or-test');
  assert.equal(headers['X-Title'], 'Best Email Builder');
  assert.equal(signal, controller.signal);
  assert.equal(body.model, 'openrouter/free');
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /^You rewrite texts\./);
  assert.match(body.messages[0].content, /ONE JSON object/);
  assert.ok(body.messages[0].content.includes(JSON.stringify(REQUEST.schema)));
  assert.deepEqual(body.messages.slice(1), REQUEST.messages);
  assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'rewrite', strict: true, schema: REQUEST.schema } });
  assert.equal(body.max_tokens, 16000);
  assert.equal('temperature' in body, false);
});

test('per provider: its address, its name for the output limit, its answer format; options override', async () => {
  const openai = fakeProvider(reply('{}'));
  await providerEmailModel({ provider: 'openai', apiKey: 'sk-x', fetch: openai.fetch, maxTokens: 900 })(REQUEST);
  assert.equal(openai.calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(openai.calls[0].body.max_completion_tokens, 900);
  assert.equal('max_tokens' in openai.calls[0].body, false);
  assert.equal(openai.calls[0].headers['X-Title'], undefined);

  const deepseek = fakeProvider(reply('{}'));
  await providerEmailModel({ provider: 'deepseek', apiKey: 'sk-x', fetch: deepseek.fetch })(REQUEST);
  assert.deepEqual(deepseek.calls[0].body.response_format, { type: 'json_object' });

  const local = fakeProvider(reply('{}'));
  await providerEmailModel({
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:47822/v1/',
    model: 'auto',
    headers: { 'X-Team': 'mail' },
    temperature: 0.4,
    fetch: local.fetch,
  })(REQUEST);
  assert.equal(local.calls[0].url, 'http://127.0.0.1:47822/v1/chat/completions');
  assert.equal(local.calls[0].headers.Authorization, undefined);
  assert.equal(local.calls[0].headers['X-Team'], 'mail');
  assert.equal(local.calls[0].body.model, 'auto');
  assert.equal(local.calls[0].body.temperature, 0.4);

  const gemini = fakeProvider(reply('{}'));
  await providerEmailModel({ provider: 'gemini', apiKey: 'AIza-x', model: 'gemini-x', fetch: gemini.fetch })(REQUEST);
  assert.equal(gemini.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(gemini.calls[0].body.model, 'gemini-x');
});

test('a format the model does not take is stepped down — json_schema, json_object, text — and remembered', async () => {
  const { fetch, calls } = fakeProvider((call) => {
    const format = call.body.response_format?.type;
    return format ? { status: 400, body: { error: { message: `response_format ${format} is not supported by this model` } } } : reply('{"text":"ok"}');
  });
  const model = providerEmailModel({ provider: 'groq', apiKey: 'gsk_x', fetch });
  assert.equal(await model(REQUEST), '{"text":"ok"}');
  assert.deepEqual(
    calls.map((call) => call.body.response_format?.type ?? 'none'),
    ['json_schema', 'json_object', 'none']
  );
  await model(REQUEST);
  assert.equal(calls.at(-1).body.response_format, undefined, 'the next call starts where it worked');
  assert.equal(calls.length, 4);
});

test('another 400 is not about the format: no second try', async () => {
  const { fetch, calls } = fakeProvider({ status: 400, body: { error: { message: 'model not found' } } });
  const model = providerEmailModel({ provider: 'groq', apiKey: 'gsk_x', fetch });
  await assert.rejects(model(REQUEST), (error) => error.code === 'MODEL_ERROR' && /Groq 400: .*model not found/.test(error.detail));
  assert.equal(calls.length, 1);
});

test('the provider’s failures, as the errors the interface explains', async () => {
  const cases = [
    [{ status: 401, body: { error: { message: 'Invalid key' } } }, 'KEY_REFUSED'],
    [{ status: 403, body: 'Forbidden' }, 'KEY_REFUSED'],
    [{ status: 402, body: { error: { message: 'Insufficient credits' } } }, 'MODEL_CREDITS'],
    [{ status: 429, body: { error: { message: 'Rate limited' } } }, 'MODEL_BUSY'],
    [{ status: 503, body: 'Overloaded' }, 'MODEL_BUSY'],
    [{ status: 500, body: 'Boom' }, 'MODEL_ERROR'],
    [{ status: 200, body: 'not json' }, 'MODEL_ERROR'],
    // OpenRouter: an upstream failure inside a 200.
    [{ status: 200, body: { error: { code: 429, message: 'Upstream rate limited' } } }, 'MODEL_BUSY'],
    [{ status: 200, body: { error: { code: 401, message: 'User not found' } } }, 'KEY_REFUSED'],
    [{ status: 200, body: { error: { code: 502, message: 'Provider returned error' } } }, 'MODEL_ERROR'],
    [reply('{"text":"half', 'length'), 'TRUNCATED'],
    [reply('', 'content_filter'), 'REFUSED'],
    [{ body: { choices: [{ message: { content: null, refusal: 'I cannot help' }, finish_reason: 'stop' }] } }, 'REFUSED'],
  ];
  for (const [answer, code] of cases) {
    const { fetch } = fakeProvider(answer);
    const model = providerEmailModel({ provider: 'openrouter', apiKey: 'sk-or-x', fetch });
    assert.equal(await codeOf(model(REQUEST)), code, JSON.stringify(answer).slice(0, 80));
  }
  // Never a 401 to the browser: the key is the AI's, not the user's session.
  for (const code of ['KEY_MISSING', 'KEY_REFUSED', 'MODEL_CREDITS', 'MODEL_BUSY', 'MODEL_ERROR']) {
    assert.ok(GENERATION_ERRORS[code], code);
    assert.ok(GENERATION_ERRORS[code].status >= 500, code);
    assert.ok(fr[GENERATION_ERRORS[code].message], `${code} has a French text`);
  }
});

test('the network down is a MODEL_ERROR; an abort stays an abort', async () => {
  const down = providerEmailModel({
    provider: 'openrouter',
    apiKey: 'sk-or-x',
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(await codeOf(down(REQUEST)), 'MODEL_ERROR');

  const controller = new AbortController();
  const slow = providerEmailModel({
    provider: 'openrouter',
    apiKey: 'sk-or-x',
    fetch: (url, init) =>
      new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })),
  });
  const pending = slow({ ...REQUEST, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('the text of an answer in parts is joined', async () => {
  const { fetch } = fakeProvider({ body: { choices: [{ message: { content: [{ type: 'text', text: '{"te' }, { type: 'text', text: 'xt":"a"}' }] }, finish_reason: 'stop' }] } });
  assert.equal(await providerEmailModel({ provider: 'mistral', apiKey: 'k', fetch })(REQUEST), '{"text":"a"}');
});

test('a key given by a function is read at each call; none is KEY_MISSING, with no request', async () => {
  let current = 'sk-or-one';
  const { fetch, calls } = fakeProvider(reply('{}'));
  const model = providerEmailModel({ provider: 'openrouter', apiKey: async () => current, fetch });
  await model(REQUEST);
  current = 'sk-or-two';
  await model(REQUEST);
  assert.deepEqual(
    calls.map((call) => call.headers.Authorization),
    ['Bearer sk-or-one', 'Bearer sk-or-two']
  );
  current = '';
  assert.equal(await codeOf(model(REQUEST)), 'KEY_MISSING');
  assert.equal(calls.length, 2);
});

/* ── createAi({ provider }) ─────────────────────────────────────────────── */

/** The module's browser entry, JSX compiled (its own output file: test files run in parallel). */
async function loadAiEntry() {
  const outfile = path.join(root, 'node_modules', '.cache', 'eb-unit', 'ai-entry-providers.mjs');
  await build({
    entryPoints: [path.join(root, 'src/ai/index.js')],
    bundle: true,
    outfile,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    packages: 'external',
    loader: { '.js': 'jsx' },
    charset: 'utf8',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?t=${fs.statSync(outfile).mtimeMs}`);
}
const { createAi } = await loadAiEntry();

/** A browser's localStorage, in memory. */
function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const REWRITE = { action: 'shorter', text: 'Hello and welcome to our shop, we are glad to see you.' };
const REWRITTEN = reply('{"text":"Welcome to our shop!"}');

test('createAi({ provider }): what goes together, and what does not', () => {
  const fetch = async () => new Response('{}');
  assert.throws(() => createAi({ provider: 'openrouter' }), /OpenRouter needs a key — `apiKey`, or `askKey: true`/);
  assert.throws(() => createAi({ provider: 'openrouter', apiKey: 'k', askKey: true }), /not both/);
  assert.throws(() => createAi({ provider: 'openrouter', apiKey: 'k', baseUrl: '/api' }), /`provider` runs the AI in the page/);
  assert.throws(() => createAi({ provider: 'openrouter', apiKey: 'k', headers: {} }), /`provider` runs the AI in the page/);
  assert.throws(() => createAi({ provider: 'openrouter', apiKey: 'k', model: async () => '' }), /`provider` runs the AI in the page/);
  assert.throws(() => createAi({ apiKey: 'k' }), /go with a `provider`/);
  assert.throws(() => createAi({ askKey: true }), /go with a `provider`/);
  assert.throws(() => createAi({ provider: 'openrouter', askKey: 'yes' }), /`askKey` must be true or false/);
  assert.throws(() => createAi({ provider: 'openrouter', apiKey: '' }), /non-empty string/);
  assert.throws(() => createAi({ compile: async () => ({}) }), /`compile`/);
  assert.throws(() => createAi({ provider: 'nope', apiKey: 'k' }), /Unknown AI provider/);

  const shared = createAi({ provider: 'openrouter', apiKey: 'k', fetch });
  assert.equal(shared.key, null, 'one key for all: nothing to ask');
  assert.equal(shared.components.Connect, null);
  assert.equal(typeof shared.generate, 'function');
  const local = createAi({ provider: { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' }, fetch });
  assert.equal(local.key, null);
  // askKey off is the default: a provider's key must then be given.
  const asking = createAi({ provider: 'openrouter', askKey: true, fetch });
  assert.equal(typeof asking.components.Connect, 'function');
  assert.equal(asking.key.provider.name, 'OpenRouter');
  assert.equal(asking.key.provider.keyUrl, 'https://openrouter.ai/keys');
});

test('createAi({ provider, apiKey }): the three parts run in the page, against the provider', async () => {
  const { fetch, calls } = fakeProvider(REWRITTEN);
  const ai = createAi({ provider: 'groq', apiKey: 'gsk_team', fetch });
  assert.deepEqual(await ai.rewrite(REWRITE), { text: 'Welcome to our shop!', attempts: 1 });
  assert.equal(calls[0].url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer gsk_team');
  assert.equal(calls[0].body.model, 'openai/gpt-oss-120b');
});

test('askKey: the first action asks for the key, keeps it in this browser, and goes on', async (t) => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider(REWRITTEN);
  const ai = createAi({ provider: 'openrouter', askKey: true, fetch });
  const changes = [];
  const unsubscribe = ai.key.subscribe(() => changes.push(ai.key.state()));
  assert.equal(ai.key.state().connected, false);

  const running = ai.rewrite(REWRITE);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ai.key.state().asking, true, 'the Connect dialog opens');
  assert.equal(calls.length, 0, 'nothing is sent before the key');
  ai.key.answer('  sk-or-mine  ');
  assert.deepEqual(await running, { text: 'Welcome to our shop!', attempts: 1 });
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-or-mine');
  assert.equal(storage.map.get('best-email-builder:ai-key:openrouter'), 'sk-or-mine');
  assert.deepEqual(ai.key.state(), { asking: false, refused: false, connected: true });
  assert.deepEqual(
    changes.map((state) => state.asking),
    [true, false]
  );

  // The next action: no question.
  await ai.rewrite(REWRITE);
  assert.equal(changes.length, 2);
  // Another page of the same browser finds it.
  assert.equal(createAi({ provider: 'openrouter', askKey: true, fetch }).key.get(), 'sk-or-mine');
  // Another provider does not.
  assert.equal(createAi({ provider: 'groq', askKey: true, fetch }).key.get(), '');

  ai.key.forget();
  assert.equal(storage.map.has('best-email-builder:ai-key:openrouter'), false);
  assert.equal(ai.key.state().connected, false);
  unsubscribe();
});

test('askKey: Cancel ends the action with KEY_MISSING; two actions waiting share one question', async (t) => {
  globalThis.localStorage = memoryStorage();
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider(REWRITTEN);
  const ai = createAi({ provider: 'openrouter', askKey: true, fetch });
  const codes = Promise.all([ai.rewrite(REWRITE), ai.suggestSubjects({ subject: 'Spring sale', text: 'Our spring sale starts today.' })].map(codeOf));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ai.key.state().asking, true);
  ai.key.answer(null);
  assert.deepEqual(await codes, ['KEY_MISSING', 'KEY_MISSING']);
  assert.equal(calls.length, 0);
  assert.equal(ai.key.state().asking, false);
});

test('askKey: a refused key is forgotten and asked again in the same action; refused twice, the action fails', async (t) => {
  const storage = memoryStorage();
  storage.setItem('best-email-builder:ai-key:openrouter', 'sk-or-old');
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider((call) =>
    call.headers.Authorization === 'Bearer sk-or-good' ? REWRITTEN : { status: 401, body: { error: { message: 'No auth credentials found' } } }
  );
  const ai = createAi({ provider: 'openrouter', askKey: true, fetch });
  assert.equal(ai.key.state().connected, true);

  const running = ai.rewrite(REWRITE);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(ai.key.state(), { asking: true, refused: true, connected: false }, 'the dialog says the last key was refused');
  assert.equal(storage.map.has('best-email-builder:ai-key:openrouter'), false);
  ai.key.answer('sk-or-good');
  assert.equal((await running).text, 'Welcome to our shop!');
  assert.deepEqual(ai.key.state(), { asking: false, refused: false, connected: true });

  ai.key.set('sk-or-bad');
  const again = codeOf(ai.rewrite(REWRITE));
  await new Promise((resolve) => setTimeout(resolve, 10));
  ai.key.answer('sk-or-worse');
  assert.equal(await again, 'KEY_REFUSED');
  assert.equal(ai.key.get(), '', 'a refused key is never kept');
  assert.equal(ai.key.state().refused, true);
  assert.deepEqual(
    calls.map((call) => call.headers.Authorization),
    ['Bearer sk-or-old', 'Bearer sk-or-good', 'Bearer sk-or-bad', 'Bearer sk-or-worse']
  );
});

test('askKey without a working localStorage: the key lives as long as the page', async (t) => {
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider(REWRITTEN);
  const ai = createAi({ provider: 'openrouter', askKey: true, fetch });
  ai.key.set('sk-or-page');
  await ai.rewrite(REWRITE);
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-or-page');
  ai.key.forget();
  assert.equal(ai.key.get(), '');
  assert.throws(() => ai.key.set('  '), TypeError);
});
