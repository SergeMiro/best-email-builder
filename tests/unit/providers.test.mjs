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
import { AI_MESSAGES, AI_PROVIDERS, EmailGenerationError, GENERATION_ERRORS, claudeEmailModel, listProviderModels, providerEmailModel, resolveProvider } from '../../src/ai/server.js';

/** The built-in translations of the AI module, English aside. */
const TRANSLATIONS = Object.entries(AI_MESSAGES).filter(([locale]) => locale !== 'en');

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
    for (const [locale, messages] of TRANSLATIONS) if (provider.free) assert.ok(messages[provider.free], `${id}: "${provider.free}" in ${locale}`);
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
  // Free models reason first: room for it, and less of it where it can be chosen.
  assert.equal(body.max_tokens, 32000);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal('temperature' in body, false);
});

test('fields of your own in each request; the request itself is not theirs to change', async () => {
  const { fetch, calls } = fakeProvider(reply('{}'));
  const body = { models: ['a/b:free'], reasoning: { effort: 'medium' }, model: 'x/y', messages: [], max_tokens: 5 };
  await providerEmailModel({ provider: 'openrouter', apiKey: 'sk-or-x', fetch, body })(REQUEST);
  const [{ body: sent }] = calls;
  assert.deepEqual(sent.models, ['a/b:free']);
  assert.deepEqual(sent.reasoning, { effort: 'medium' });
  assert.equal(sent.model, 'openrouter/free');
  assert.equal(sent.max_tokens, 32000);
  assert.equal(sent.messages[0].role, 'system');

  const groq = fakeProvider(reply('{}'));
  await providerEmailModel({ provider: 'groq', apiKey: 'gsk_x', fetch: groq.fetch })(REQUEST);
  assert.equal(groq.calls[0].body.max_tokens, 16000);
  assert.equal('reasoning' in groq.calls[0].body, false);
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
  await assert.rejects(model(REQUEST), (error) => error.code === 'MODEL_UNAVAILABLE' && /Groq 400: .*model not found/.test(error.detail));
  assert.equal(calls.length, 1);
});

test('the provider’s failures, as the errors the interface explains', async () => {
  const cases = [
    [{ status: 401, body: { error: { message: 'Invalid key' } } }, 'KEY_REFUSED'],
    [{ status: 403, body: 'Forbidden' }, 'KEY_REFUSED'],
    [{ status: 403, body: { error: { message: 'Invalid API key' } } }, 'KEY_REFUSED'],
    // A 403 about the model, the content or the money: the key stays.
    [{ status: 403, body: { error: { message: 'This model is only available on agentic harnesses' } } }, 'MODEL_ERROR'],
    [{ status: 403, body: { error: { message: 'This model is not available in your region' } } }, 'MODEL_ERROR'],
    [{ status: 403, body: { error: { message: 'Input was flagged by moderation', metadata: { reasons: ['x'] } } } }, 'REFUSED'],
    [{ status: 403, body: { error: { message: 'Key limit exceeded' } } }, 'MODEL_CREDITS'],
    // Gemini: a wrong key is a 400.
    [{ status: 400, body: [{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }] }, 'KEY_REFUSED'],
    // A model the provider does not have (any more): the user chooses another.
    [{ status: 404, body: [{ error: { code: 404, message: 'This model models/gemini-2.5-flash is no longer available to new users.', status: 'NOT_FOUND' } }] }, 'MODEL_UNAVAILABLE'],
    [{ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: claude-x' } } }, 'MODEL_UNAVAILABLE'],
    [{ status: 400, body: { error: { message: 'acme/x is not a valid model ID', code: 400 } } }, 'MODEL_UNAVAILABLE'],
    [{ status: 404, body: 'Not Found' }, 'MODEL_ERROR'],
    [{ status: 402, body: { error: { message: 'Insufficient credits' } } }, 'MODEL_CREDITS'],
    // The money, said with a 429 (OpenAI) or a 400 (Anthropic): not "busy", not "error".
    [{ status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan.', type: 'insufficient_quota' } } }, 'MODEL_CREDITS'],
    [{ status: 400, body: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }, 'MODEL_CREDITS'],
    [{ status: 429, body: { error: { message: 'Rate limited' } } }, 'MODEL_BUSY'],
    [{ status: 503, body: 'Overloaded' }, 'MODEL_BUSY'],
    [{ status: 500, body: 'Boom' }, 'MODEL_ERROR'],
    [{ status: 200, body: 'not json' }, 'MODEL_ERROR'],
    // OpenRouter: an upstream failure inside a 200.
    [{ status: 200, body: { error: { code: 429, message: 'Upstream rate limited' } } }, 'MODEL_BUSY'],
    [{ status: 200, body: { error: { code: 401, message: 'User not found' } } }, 'KEY_REFUSED'],
    [{ status: 200, body: { error: { code: 403, message: 'Provider returned error', metadata: { raw: 'content flagged' } } } }, 'REFUSED'],
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
    for (const [locale, messages] of TRANSLATIONS) assert.ok(messages[GENERATION_ERRORS[code].message], `${code} in ${locale}`);
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
const { createAi, claudeProvider } = await loadAiEntry();

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

test('askKey: a 403 about the model, not the key, keeps the key and asks nothing', async (t) => {
  const storage = memoryStorage();
  storage.setItem('best-email-builder:ai-key:openrouter', 'sk-or-mine');
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider({ status: 403, body: { error: { message: 'This model is only available on agentic harnesses' } } });
  const ai = createAi({ provider: 'openrouter', askKey: true, fetch });
  assert.equal(await codeOf(ai.rewrite(REWRITE)), 'MODEL_ERROR');
  assert.equal(calls.length, 1);
  assert.equal(ai.key.get(), 'sk-or-mine');
  assert.deepEqual(ai.key.state(), { asking: false, refused: false, connected: true });
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

/* ── Several providers, Claude among them ───────────────────────────────── */

test('a list of providers: with askKey only, each once; the first is offered first', () => {
  const fetch = async () => new Response('{}');
  assert.throws(() => createAi({ provider: ['openai', 'gemini'], apiKey: 'k' }), /a list of providers is for `askKey: true`/);
  assert.throws(() => createAi({ provider: [], askKey: true }), /a list of providers/);
  assert.throws(() => createAi({ provider: ['gemini', 'gemini'], askKey: true }), /each provider once/);
  assert.throws(() => createAi({ provider: [{ createModel: () => async () => '' }], askKey: true }), /needs an `id` and a `name`/);
  const ai = createAi({ provider: ['openai', 'gemini', 'openrouter'], askKey: true, fetch });
  assert.deepEqual(
    ai.key.providers.map((provider) => [provider.id, provider.model]),
    [
      ['openai', 'gpt-5-mini'],
      ['gemini', 'gemini-3.5-flash-lite'],
      ['openrouter', 'openrouter/free'],
    ]
  );
  assert.equal(ai.key.provider.id, 'openai');
});

test('a list of providers: the user chooses one when asked; each keeps its own key; the choice is remembered', async (t) => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const { fetch, calls } = fakeProvider(REWRITTEN);
  const ai = createAi({ provider: ['openai', 'gemini'], askKey: true, fetch });

  const running = ai.rewrite(REWRITE);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ai.key.state().asking, true);
  // What the Connect dialog does when the user picks Gemini and pastes a key.
  ai.key.choose('gemini');
  ai.key.answer('AIza-mine');
  assert.equal((await running).text, 'Welcome to our shop!');
  assert.equal(calls[0].url, `${AI_PROVIDERS.gemini.baseUrl}/chat/completions`);
  assert.equal(calls[0].headers.Authorization, 'Bearer AIza-mine');
  assert.equal(storage.map.get('best-email-builder:ai-key:gemini'), 'AIza-mine');
  assert.equal(storage.map.get('best-email-builder:ai-provider'), 'gemini');

  // Another page of this browser: Gemini, with its key.
  const later = createAi({ provider: ['openai', 'gemini'], askKey: true, fetch });
  assert.equal(later.key.provider.id, 'gemini');
  assert.equal(later.key.get(), 'AIza-mine');

  // Back to OpenAI: its own key is asked; Gemini's is kept.
  ai.key.choose('openai');
  assert.equal(ai.key.get(), '');
  assert.equal(ai.key.get('gemini'), 'AIza-mine');
  assert.equal(ai.key.state().connected, false);
  const second = ai.rewrite(REWRITE);
  await new Promise((resolve) => setImmediate(resolve));
  ai.key.answer('sk-openai');
  await second;
  assert.equal(calls[1].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[1].headers.Authorization, 'Bearer sk-openai');
  assert.throws(() => ai.key.choose('groq'), /one of openai, gemini/);

  // No remembered choice: the first provider with a key.
  storage.map.delete('best-email-builder:ai-provider');
  storage.map.delete('best-email-builder:ai-key:openai');
  assert.equal(createAi({ provider: ['openai', 'gemini'], askKey: true, fetch }).key.provider.id, 'gemini');
});

test('claudeProvider: Claude in the list through the application\'s SDK client, one client per key; a refused key is asked again', async (t) => {
  globalThis.localStorage = memoryStorage();
  t.after(() => delete globalThis.localStorage);
  const made = [];
  const requests = [];
  const client = async (apiKey) => {
    made.push(apiKey);
    return {
      messages: {
        stream: (params) => {
          requests.push(params);
          return {
            finalMessage: async () => {
              if (apiKey === 'sk-ant-bad') {
                throw Object.assign(new Error('401 invalid x-api-key'), {
                  status: 401,
                  error: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
                });
              }
              return { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":"Welcome to our shop!"}' }] };
            },
          };
        },
      },
    };
  };
  assert.throws(() => claudeProvider({}), /`client` is a function/);
  const claude = claudeProvider({ client, rewriteEffort: 'medium' });
  assert.equal(claude.id, 'anthropic');
  assert.equal(claude.name, 'Claude');
  assert.equal(claude.model, 'claude-opus-5-5');
  assert.equal(claude.keyHint, 'sk-ant-');

  const ai = createAi({ provider: [claude, 'gemini'], askKey: true });
  assert.equal(ai.key.provider.id, 'anthropic');
  ai.key.set('sk-ant-bad');
  const running = ai.rewrite(REWRITE);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(ai.key.state().refused, true, 'the dialog says the key was refused');
  ai.key.answer('sk-ant-good');
  assert.equal((await running).text, 'Welcome to our shop!');
  assert.deepEqual(made, ['sk-ant-bad', 'sk-ant-good']);
  assert.equal(requests[1].model, 'claude-opus-5-5');
  assert.deepEqual(requests[1].output_config.effort, 'medium');
  assert.equal(requests[1].output_config.format.type, 'json_schema');
  await ai.rewrite(REWRITE);
  assert.deepEqual(made, ['sk-ant-bad', 'sk-ant-good'], 'the same key: the same client');
});

test('claudeEmailModel: the SDK\'s errors become the errors the interface explains; an abort goes through', async () => {
  const failing = (error) => ({ messages: { stream: () => ({ finalMessage: async () => Promise.reject(error) }) } });
  const apiError = (status, message) => Object.assign(new Error(`${status} ${message}`), { status, error: { type: 'error', error: { message } } });
  const cases = [
    [apiError(401, 'invalid x-api-key'), 'KEY_REFUSED'],
    [apiError(400, 'Your credit balance is too low to access the Anthropic API.'), 'MODEL_CREDITS'],
    [apiError(429, 'Number of request tokens has exceeded your rate limit'), 'MODEL_BUSY'],
    [apiError(529, 'Overloaded'), 'MODEL_BUSY'],
    [apiError(500, 'Internal server error'), 'MODEL_ERROR'],
  ];
  for (const [error, code] of cases) {
    assert.equal(await codeOf(claudeEmailModel({ client: failing(error) })(REQUEST)), code, error.message);
  }
  const controller = new AbortController();
  controller.abort();
  const abort = Object.assign(new Error('Request was aborted.'), { name: 'APIUserAbortError', status: undefined });
  await assert.rejects(claudeEmailModel({ client: failing(abort) })({ ...REQUEST, signal: controller.signal }), (error) => error === abort);
  const network = Object.assign(new Error('Connection error.'), { name: 'APIConnectionError' });
  await assert.rejects(claudeEmailModel({ client: failing(network) })(REQUEST), (error) => error.code === 'MODEL_ERROR' && /Connection error/.test(error.detail));
});

/** A provider's `/models`, answered with `body` (or `status`), each request recorded. */
function fakeModels(body, status = 200) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {}, method: init.method || 'GET' });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetch, calls };
}

const OPENROUTER_MODELS = {
  data: [
    { id: 'openai/gpt-5.5', name: 'OpenAI: GPT-5.5', created: 300, pricing: { prompt: '0.000002', completion: '0.00001' }, architecture: { output_modalities: ['text'] } },
    { id: 'google/lyria-3', name: 'Google: Lyria 3', created: 400, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['audio'] } },
    { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA: Nemotron 3 Super (free)', created: 100, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    { id: 'qwen/qwen3-coder:free', name: 'Qwen: Qwen3 Coder (free)', created: 200, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    { id: 'openrouter/free', name: 'Free Models Router', created: 50, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
    { id: 'openai/gpt-5-image', name: 'OpenAI: GPT-5 Image', created: 500, pricing: { prompt: '0.00001', completion: '0.00001' }, architecture: { output_modalities: ['image', 'text'] } },
    { id: 'openai/gpt-5.5', name: 'twice', created: 300 },
  ],
};

test('listProviderModels: OpenRouter\'s list needs no key — the default first, then the free ones, then the newest; nothing but text', async () => {
  const { fetch, calls } = fakeModels(OPENROUTER_MODELS);
  const models = await listProviderModels({ provider: 'openrouter', fetch });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/models');
  assert.equal(calls[0].headers.Authorization, undefined, 'no key: none sent');
  assert.deepEqual(
    models.map((model) => [model.id, model.free]),
    [
      ['openrouter/free', true],
      ['qwen/qwen3-coder:free', true],
      ['nvidia/nemotron-3-super-120b-a12b:free', true],
      ['openai/gpt-5.5', false],
    ]
  );
  assert.equal(models[1].name, 'Qwen: Qwen3 Coder (free)');
  assert.ok(Object.isFrozen(models[0]));
  // With a key, it goes along.
  const withKey = fakeModels(OPENROUTER_MODELS);
  await listProviderModels({ provider: 'openrouter', apiKey: 'sk-or-mine', fetch: withKey.fetch });
  assert.equal(withKey.calls[0].headers.Authorization, 'Bearer sk-or-mine');
});

test('listProviderModels: Gemini\'s ids without "models/", Mistral\'s chat models only; the writers only', async () => {
  const gemini = fakeModels({
    object: 'list',
    data: [
      { id: 'models/gemini-2.5-flash', display_name: 'Gemini 2.5 Flash' },
      { id: 'models/gemini-3.5-flash-lite', display_name: 'Gemini 3.5 Flash-Lite' },
      { id: 'models/gemini-2.5-flash-preview-tts', display_name: 'TTS' },
      { id: 'models/gemini-embedding-001', display_name: 'Embedding' },
      { id: 'models/imagen-4.0-generate-001', display_name: 'Imagen' },
      { id: 'models/veo-3.0-generate-001', display_name: 'Veo' },
      { id: 'models/gemini-2.5-flash-native-audio-latest', display_name: 'Audio' },
      { id: 'models/gemini-live-2.5-flash', display_name: 'Live' },
      { id: 'models/aqa', display_name: 'AQA' },
    ],
  });
  const models = await listProviderModels({ provider: 'gemini', apiKey: 'AIza-mine', fetch: gemini.fetch });
  assert.equal(gemini.calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/models');
  assert.equal(gemini.calls[0].headers.Authorization, 'Bearer AIza-mine');
  assert.deepEqual(
    models.map((model) => `${model.id} ${model.name}`),
    ['gemini-3.5-flash-lite Gemini 3.5 Flash-Lite', 'gemini-2.5-flash Gemini 2.5 Flash']
  );
  // No dates: the newest by the version in the id.
  const undated = fakeModels({ data: ['gemini-2.5-pro', 'gemini-flash-latest', 'gemini-4-argon', 'gemini-3.8-flash', 'gemini-2.5-flash'].map((id) => ({ id: `models/${id}` })) });
  assert.deepEqual(
    (await listProviderModels({ provider: 'gemini', apiKey: 'AIza-mine', fetch: undated.fetch })).map((model) => model.id),
    ['gemini-4-argon', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-flash-latest']
  );

  const mistral = fakeModels({
    data: [
      { id: 'mistral-large-latest', created: 2, capabilities: { completion_chat: true } },
      { id: 'mistral-embed', created: 3, capabilities: { completion_chat: false } },
      { id: 'codestral-mamba', created: 4, capabilities: { completion_chat: false } },
      { id: 'mistral-small-latest', created: 1, capabilities: { completion_chat: true } },
    ],
  });
  const listed = await listProviderModels({ provider: 'mistral', apiKey: 'mk', fetch: mistral.fetch });
  assert.deepEqual(listed.map((model) => model.id), ['mistral-small-latest', 'mistral-large-latest']);
});

test('listProviderModels: no key is KEY_MISSING with no request; the provider\'s failures are the usual errors', async () => {
  const silent = fakeModels({ data: [] });
  assert.equal(await codeOf(listProviderModels({ provider: 'gemini', fetch: silent.fetch })), 'KEY_MISSING');
  assert.equal(silent.calls.length, 0);
  assert.equal(await codeOf(listProviderModels({ provider: 'openai', apiKey: 'sk-bad', fetch: fakeModels({ error: { message: 'Incorrect API key provided' } }, 401).fetch })), 'KEY_REFUSED');
  assert.equal(await codeOf(listProviderModels({ provider: 'openai', apiKey: 'sk', fetch: fakeModels('<html>', 200).fetch })), 'MODEL_ERROR');
  const down = async () => Promise.reject(new TypeError('Failed to fetch'));
  assert.equal(await codeOf(listProviderModels({ provider: 'openai', apiKey: 'sk', fetch: down })), 'MODEL_ERROR');
  // A local model of one's own needs no key.
  const local = fakeModels({ data: [{ id: 'llama3.2' }] });
  assert.deepEqual((await listProviderModels({ provider: 'ollama', fetch: local.fetch })).map((model) => model.id), ['llama3.2']);
  assert.equal(local.calls[0].url, 'http://localhost:11434/v1/models');
});

test('askKey: the model chosen for each provider is remembered and sent; its own model is no choice', async (t) => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const sent = [];
  const fetch = async (url, init = {}) => {
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-3.5-flash-lite' }] }));
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(REWRITTEN.body));
  };
  const ai = createAi({ provider: ['openai', 'gemini'], askKey: true, fetch });
  ai.key.choose('gemini');
  ai.key.set('AIza-mine');
  assert.equal(ai.key.model(), 'gemini-3.5-flash-lite', 'the provider\'s own by default');
  assert.equal(ai.key.model('openai'), 'gpt-5-mini');
  assert.equal(ai.key.providers.find((provider) => provider.id === 'openrouter'), undefined);
  assert.equal(ai.key.providers[0].publicModels, false);

  // The list, with the key kept; asked once.
  const listed = await ai.key.listModels();
  assert.deepEqual(listed.map((model) => model.id), ['gemini-3.5-flash-lite', 'gemini-2.5-flash']);
  assert.equal(await ai.key.listModels('gemini'), listed, 'the same key: the list already made');

  let changes = 0;
  ai.key.subscribe(() => changes++);
  ai.key.chooseModel('gemini-2.5-flash');
  assert.equal(changes, 1);
  assert.equal(ai.key.model(), 'gemini-2.5-flash');
  assert.equal(storage.map.get('best-email-builder:ai-model:gemini'), 'gemini-2.5-flash');
  await ai.rewrite(REWRITE);
  assert.equal(sent.at(-1).body.model, 'gemini-2.5-flash');

  // Another page of this browser: the same model.
  const later = createAi({ provider: ['openai', 'gemini'], askKey: true, fetch });
  assert.equal(later.key.model(), 'gemini-2.5-flash');
  await later.rewrite(REWRITE);
  assert.equal(sent.at(-1).body.model, 'gemini-2.5-flash');

  // Back to the provider's own: no choice kept.
  ai.key.chooseModel('gemini-3.5-flash-lite');
  assert.equal(storage.map.has('best-email-builder:ai-model:gemini'), false);
  await ai.rewrite(REWRITE);
  assert.equal(sent.at(-1).body.model, 'gemini-3.5-flash-lite');
  assert.throws(() => ai.key.chooseModel(''), /a model id/);
  assert.throws(() => ai.key.model('groq'), /no provider "groq"/);
});

test('claudeProvider: the models the key opens, through the SDK; the model chosen is the one asked', async (t) => {
  globalThis.localStorage = memoryStorage();
  t.after(() => delete globalThis.localStorage);
  const requests = [];
  const listings = [];
  const client = async (apiKey) => ({
    models: {
      list: async (params, options) => {
        listings.push({ apiKey, params, signal: options?.signal });
        if (apiKey === 'sk-ant-bad') throw Object.assign(new Error('401 invalid x-api-key'), { status: 401 });
        return {
          data: [
            { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-05-01T00:00:00Z' },
            { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-04-01T00:00:00Z' },
            { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-06-01T00:00:00Z' },
          ],
        };
      },
    },
    messages: {
      stream: (params) => {
        requests.push(params);
        return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"text":"Welcome to our shop!"}' }] }) };
      },
    },
  });
  const ai = createAi({ provider: [claudeProvider({ client }), 'gemini'], askKey: true });
  assert.equal(await codeOf(ai.key.listModels('anthropic')), 'KEY_MISSING');
  assert.equal(await codeOf(ai.key.listModels('anthropic', { apiKey: 'sk-ant-bad' })), 'KEY_REFUSED');
  ai.key.set('sk-ant-good');
  const models = await ai.key.listModels();
  assert.deepEqual(models.map((model) => `${model.id} ${model.name}`), ['claude-opus-5-5 Claude Opus 5.5', 'claude-sonnet-5-5 Claude Sonnet 5.5', 'claude-haiku-5-5 Claude Haiku 5.5']);
  assert.deepEqual(listings.at(-1).params, { limit: 100 });

  await ai.rewrite(REWRITE);
  assert.equal(requests.at(-1).model, 'claude-opus-5-5');
  ai.key.chooseModel('claude-sonnet-5-5');
  await ai.rewrite(REWRITE);
  assert.equal(requests.at(-1).model, 'claude-sonnet-5-5');
});

test('askKey: an OpenAI-compatible API of the user\'s own — its address, a key only if it needs one, a model of its list', async (t) => {
  const storage = memoryStorage();
  globalThis.localStorage = storage;
  t.after(() => delete globalThis.localStorage);
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers || {} });
    if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'qwen3-8b' }, { id: 'text-embedding-nomic' }] }));
    return new Response(JSON.stringify(REWRITTEN.body));
  };
  const ai = createAi({ provider: ['openrouter', 'openai-compatible'], askKey: true, fetch });
  const own = ai.key.providers.find((provider) => provider.id === 'openai-compatible');
  assert.equal(own.needsAddress, true);
  assert.equal(own.keyless, true);
  assert.equal(ai.key.providers[0].needsAddress, false, 'a preset has its own address');
  assert.throws(() => ai.key.setAddress('http://localhost:1234/v1', 'openrouter'), /has an address of its own/);
  assert.throws(() => ai.key.setAddress('localhost:1234', 'openai-compatible'), /an http\(s\) address/);

  // No address: no list, no request.
  assert.deepEqual(await ai.key.listModels('openai-compatible'), []);
  assert.equal(calls.length, 0);
  // The address being typed lists its models, with no key.
  const listed = await ai.key.listModels('openai-compatible', { address: 'http://localhost:1234/v1/' });
  assert.deepEqual(listed.map((model) => model.id), ['qwen3-8b']);
  assert.equal(calls[0].url, 'http://localhost:1234/v1/models');
  assert.equal(calls[0].headers.Authorization, undefined);

  // The action asks: the address, the model, no key; then it goes on.
  const running = ai.rewrite(REWRITE);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ai.key.state().asking, true);
  ai.key.setAddress(' http://localhost:1234/v1/ ', 'openai-compatible');
  ai.key.choose('openai-compatible');
  assert.equal(ai.key.ready(), false, 'no model yet');
  ai.key.chooseModel('qwen3-8b');
  assert.equal(ai.key.ready(), true, 'no key needed');
  ai.key.answer('');
  assert.equal((await running).text, 'Welcome to our shop!');
  assert.equal(calls.at(-1).url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(calls.at(-1).headers.Authorization, undefined);
  assert.equal(storage.map.get('best-email-builder:ai-address:openai-compatible'), 'http://localhost:1234/v1');
  assert.deepEqual(ai.key.state(), { asking: false, refused: false, connected: true });

  // Another page of this browser: the same address and model, no question.
  const later = createAi({ provider: ['openrouter', 'openai-compatible'], askKey: true, fetch });
  assert.equal(later.key.address(), 'http://localhost:1234/v1');
  await later.rewrite(REWRITE);
  assert.equal(later.key.state().asking, false);

  // A key, when the API wants one; a new address is used at once.
  ai.key.set('sk-proxy');
  ai.key.setAddress('https://llm.example.test/v1');
  await ai.rewrite(REWRITE);
  assert.equal(calls.at(-1).url, 'https://llm.example.test/v1/chat/completions');
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer sk-proxy');

  // Cancelled without an address: KEY_MISSING, nothing sent.
  ai.key.setAddress('');
  assert.equal(ai.key.state().connected, false);
  const sent = calls.length;
  const cancelled = codeOf(ai.rewrite(REWRITE));
  await new Promise((resolve) => setImmediate(resolve));
  ai.key.answer(null);
  assert.equal(await cancelled, 'KEY_MISSING');
  assert.equal(calls.length, sent);
});
