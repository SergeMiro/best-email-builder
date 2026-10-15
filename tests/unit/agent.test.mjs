/**
 * YOUR OWN AI AGENT — `best-email-builder/agent@1`: the builder's side
 * (agentEmailModel), the agent's side (createAgentEndpoint), the whole way
 * through the handler with who asks forwarded, and checkAgent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMjml,
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  validateMjml,
} from '../../src/server/index.js';
import {
  AGENT_PROTOCOL,
  EMAIL_DRAFT_SCHEMA,
  agentEmailModel,
  checkAgent,
  createAgentEndpoint,
  createEmailGenerator,
} from '../../src/ai/server.js';
import fs from 'node:fs';

const ORIGIN = 'http://localhost';
const AGENT_URL = 'http://agent.test/email-builder';

const GOOD_MJML =
  '<mjml><mj-body background-color="#eceff4" width="600px">' +
  '<mj-section background-color="#ffffff" padding-top="24px" padding-bottom="24px"><mj-column>' +
  '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="28px" line-height="36px" color="#212e5a" font-weight="bold" padding-left="32px" padding-right="32px">Welcome {{contact.firstname|there}}</mj-text>' +
  '<mj-button href="https://example.com/start" background-color="#2977bc" color="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15px" line-height="20px" font-weight="bold" border-radius="6px" inner-padding="12px 28px">Get started</mj-button>' +
  '</mj-column></mj-section>' +
  '<mj-section padding-top="20px" padding-bottom="28px"><mj-column>' +
  '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="12px" line-height="18px" color="#6d7484" align="center">Acme · [Company address]<br /><a href="{{ unsubscribe }}" style="color:#6d7484;text-decoration:underline;">Unsubscribe</a></mj-text>' +
  '</mj-column></mj-section>' +
  '</mj-body></mjml>';

const EMAIL = { name: 'Welcome', subject: 'Welcome to Acme', preheader: 'Everything you need to get started.', mjml: GOOD_MJML };
const REQUEST = { system: 'You write emails.', messages: [{ role: 'user', content: 'A welcome email.' }], schema: EMAIL_DRAFT_SCHEMA };

/** A fake agent behind fetch: answers in turn, records what it was sent. */
function fakeAgent(...answers) {
  const calls = [];
  /** @type {typeof fetch} */
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: { ...init.headers }, body: JSON.parse(init.body) });
    const next = answers.shift() ?? { body: { text: JSON.stringify(EMAIL) } };
    const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body);
    return new Response(body, { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

/** fetch that reaches an endpoint `(Request) => Response` in the same process. */
const fetchTo = (endpoint) => async (url, init) => endpoint(new Request(url, init));

test('agentEmailModel: one POST per turn — the protocol, the task, the instructions with the answer format, the schema; who asks in the headers, never in the body', async () => {
  const { fetch, calls } = fakeAgent();
  const seen = [];
  const model = agentEmailModel({
    url: AGENT_URL,
    fetch,
    headers: (context) => (seen.push(context), { Authorization: `Bearer ${context.user.token}` }),
  });
  const text = await model({ ...REQUEST, task: 'generate', user: { id: 7, token: 'secret-7' } });

  assert.deepEqual(JSON.parse(text), EMAIL);
  assert.equal(model.url, AGENT_URL);
  assert.equal(calls.length, 1);
  const [{ url, headers, body }] = calls;
  assert.equal(url, AGENT_URL);
  assert.equal(headers.Authorization, 'Bearer secret-7');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(body).sort(), ['messages', 'protocol', 'schema', 'system', 'task']);
  assert.equal(body.protocol, AGENT_PROTOCOL);
  assert.equal(body.task, 'generate');
  assert.match(body.system, /^You write emails\.\n\n# Answer format\nAnswer with ONE JSON object/, 'a model given system as it is answers right');
  assert.deepEqual(body.messages, REQUEST.messages);
  assert.deepEqual(body.schema, EMAIL_DRAFT_SCHEMA);
  assert.doesNotMatch(JSON.stringify(body), /secret-7/, 'the user is never in the body');
  assert.deepEqual(seen, [{ task: 'generate', user: { id: 7, token: 'secret-7' } }]);

  // Plain headers; the task defaults to "generate".
  const plain = fakeAgent();
  await agentEmailModel({ url: AGENT_URL, fetch: plain.fetch, headers: { 'X-Key': 'k' } })(REQUEST);
  assert.equal(plain.calls[0].headers['X-Key'], 'k');
  assert.equal(plain.calls[0].body.task, 'generate');
});

test('agentEmailModel: the answer as text, as an object, or as the whole body', async () => {
  const { fetch } = fakeAgent(
    { body: { text: '{"text":"Hi"}' } },
    { body: { output: { text: 'Hi' } } },
    { body: '{"subjects":["A","B","C"]}' },
    { body: 'Hi, plain' },
    // A rewrite's own answer passed on as the body reads as the envelope: its
    // text, which the rewriter takes as it is.
    { body: '{"text":"Hi"}' }
  );
  const model = agentEmailModel({ url: AGENT_URL, fetch });
  assert.equal(await model({ ...REQUEST, task: 'rewrite' }), '{"text":"Hi"}');
  assert.equal(await model({ ...REQUEST, task: 'rewrite' }), '{"text":"Hi"}');
  assert.equal(await model({ ...REQUEST, task: 'subjects' }), '{"subjects":["A","B","C"]}');
  assert.equal(await model({ ...REQUEST, task: 'rewrite' }), 'Hi, plain');
  assert.equal(await model({ ...REQUEST, task: 'rewrite' }), 'Hi');
});

test('agentEmailModel: the agent’s failures, as the errors the interface explains', async () => {
  const cases = [
    [{ status: 503, body: { error: 'All models busy', code: 'MODEL_BUSY' } }, 'MODEL_BUSY'],
    [{ status: 422, body: { error: 'Not this one', code: 'REFUSED' } }, 'REFUSED'],
    [{ status: 502, body: { error: 'Gone', code: 'MODEL_UNAVAILABLE' } }, 'MODEL_UNAVAILABLE'],
    // A code the builder does not know: the status decides.
    [{ status: 500, body: { error: 'x', code: 'KEY_REFUSED' } }, 'MODEL_ERROR'],
    [{ status: 429, body: { detail: 'Too many requests' } }, 'MODEL_BUSY'],
    [{ status: 504, body: 'Gateway Timeout' }, 'MODEL_BUSY'],
    // The session refused: the agent's business, not a key to ask again.
    [{ status: 401, body: { detail: 'Authentication required' } }, 'MODEL_ERROR'],
    [{ status: 500, body: 'Boom' }, 'MODEL_ERROR'],
    // A failure inside a 200.
    [{ status: 200, body: { error: 'Quota', code: 'MODEL_CREDITS' } }, 'MODEL_CREDITS'],
  ];
  for (const [answer, code] of cases) {
    const { fetch } = fakeAgent(answer);
    await assert.rejects(
      agentEmailModel({ url: AGENT_URL, fetch, name: 'Vega' })(REQUEST),
      (error) => error.code === code && error.detail.startsWith(`Vega ${answer.status}: `),
      `${answer.status} ${JSON.stringify(answer.body)} → ${code}`
    );
  }
  // The network itself.
  const down = agentEmailModel({ url: AGENT_URL, fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(down(REQUEST), (error) => error.code === 'MODEL_ERROR' && /fetch failed/.test(error.detail));
});

test('agentEmailModel: a closed dialog cancels the call; an agent too slow is MODEL_BUSY', async () => {
  /** fetch that never answers, until its signal aborts. */
  const hanging = async (_url, init) =>
    new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason ?? new Error('aborted'))));

  const closed = new AbortController();
  const pending = agentEmailModel({ url: AGENT_URL, fetch: hanging })({ ...REQUEST, signal: closed.signal });
  closed.abort(new DOMException('closed', 'AbortError'));
  await assert.rejects(pending, (error) => error.name === 'AbortError' && error.message === 'closed');

  await assert.rejects(
    agentEmailModel({ url: AGENT_URL, fetch: hanging, timeout: 20 })(REQUEST),
    (error) => error.code === 'MODEL_BUSY' && /no answer after 0 s/.test(error.detail)
  );
});

test('agentEmailModel: wrong options are refused at once; the browser entry has it too', () => {
  assert.throws(() => agentEmailModel({}), /`url` is required/);
  assert.throws(() => agentEmailModel({ url: AGENT_URL, headers: 'x' }), /`headers` is an object, or a function/);
  // In the page too, through a route of the application (the entry is JSX: read, not imported).
  const browserEntry = fs.readFileSync(new URL('../../src/ai/index.js', import.meta.url), 'utf8');
  assert.match(browserEntry, /export \{ agentEmailModel, AGENT_PROTOCOL, AGENT_ERROR_CODES \} from '\.\/agent\.js';/);
  assert.equal(AGENT_PROTOCOL, 'best-email-builder/agent@1');
});

test('createAgentEndpoint: what the builder sends is checked; the answer goes back as text or output; a named failure keeps its code, any other is hidden', async () => {
  const errors = [];
  const answers = [
    'the text',
    { text: 'an object' },
    Object.assign(new Error('nothing free'), { code: 'MODEL_BUSY' }),
    new Error('db password=hunter2'),
  ];
  const received = [];
  const endpoint = createAgentEndpoint({
    complete: async (task) => {
      received.push(task);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    onError: (error) => errors.push(error.message),
  });
  const send = async (body, init = {}) => {
    const response = await endpoint(new Request(AGENT_URL, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }));
    return [response.status, await response.json()];
  };
  const good = { protocol: AGENT_PROTOCOL, task: 'rewrite', system: 'S', messages: [{ role: 'user', content: 'U', extra: 1 }], schema: {} };

  assert.deepEqual(await send(good), [200, { text: 'the text' }]);
  assert.equal(received[0].task, 'rewrite');
  assert.deepEqual(received[0].messages, [{ role: 'user', content: 'U' }], 'only role and content are passed on');
  assert.ok(received[0].request instanceof Request && received[0].signal);
  assert.deepEqual(await send(good), [200, { output: { text: 'an object' } }]);
  assert.deepEqual(await send(good), [503, { error: 'nothing free', code: 'MODEL_BUSY' }]);
  assert.deepEqual(await send(good), [502, { error: 'The agent could not answer', code: 'MODEL_ERROR' }]);
  assert.deepEqual(errors, ['db password=hunter2'], 'logged, not answered');

  const refused = [
    [{ ...good, protocol: 'best-email-builder/agent@2' }, /Unsupported protocol "best-email-builder\/agent@2"/],
    [{ ...good, task: 'translate' }, /Unknown task/],
    [{ ...good, system: 1 }, /`system` must be a string/],
    [{ ...good, schema: null }, /`schema` must be an object/],
    [{ ...good, messages: [] }, /`messages` must hold 1 to 20/],
    [{ ...good, messages: [{ role: 'system', content: 'x' }] }, /Each message is/],
  ];
  for (const [body, message] of refused) {
    const [status, data] = await send(body);
    assert.equal(status, 400);
    assert.equal(data.code, 'INVALID_REQUEST');
    assert.match(data.error, message);
  }
  assert.deepEqual(await send('{nope'), [400, { error: 'Invalid JSON', code: 'INVALID_JSON' }]);
  const get = await endpoint(new Request(AGENT_URL));
  assert.equal(get.status, 405);
  assert.equal(received.length, 4, 'nothing refused reached the agent');
});

test('the whole way: the handler’s three AI routes, through the agent — who authorize returned reaches it as a header, its answers are checked', async () => {
  const seen = [];
  const endpoint = createAgentEndpoint({
    complete: async ({ task, request, messages }) => {
      seen.push({ task, who: request.headers.get('x-auth-user'), turns: messages.length });
      if (task === 'generate') return JSON.stringify(EMAIL);
      if (task === 'rewrite') return { text: 'Summer sale: 30% off for three days. <a href="https://example.com/sale">See the offers</a>.' };
      return { subjects: ['Three days, 30% off', 'Your summer sale is here', 'Last call: 30% off ends soon'] };
    },
  });
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    authorize: (request) => (request.headers.get('authorization') === 'Bearer ok' ? { id: 7, name: 'ana', token: 'signed-for-7' } : null),
    generator: createEmailGenerator({
      model: agentEmailModel({ url: AGENT_URL, fetch: fetchTo(endpoint), headers: ({ user }) => ({ 'X-Auth-User': user.token }) }),
      compile: compileMjml,
    }),
    onError: (error) => assert.fail(error),
  });
  const post = async (route, body) => {
    const response = await handler(
      new Request(`${ORIGIN}/api/email-builder/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ok' },
        body: JSON.stringify(body),
      })
    );
    return [response.status, (await response.json()).data];
  };

  const [status, email] = await post('generate', { purpose: 'welcome', language: 'en' });
  assert.equal(status, 200);
  assert.equal(email.subject, 'Welcome to Acme');
  assert.ok(validateMjml(email.mjml).ok);
  const [, rewritten] = await post('rewrite', {
    action: 'shorter',
    format: 'html',
    text: '<p>Our summer sale starts on Monday: 30% off everything in store, for three days only. <a href="https://example.com/sale">See the offers</a>.</p>',
  });
  assert.match(rewritten.text, /href="https:\/\/example\.com\/sale"/);
  const [, ideas] = await post('subjects', { subject: 'Summer sale', text: 'Our summer sale starts on Monday.' });
  assert.equal(ideas.subjects.length, 3);

  assert.deepEqual(
    seen.map(({ task, who }) => `${task} ${who}`),
    ['generate signed-for-7', 'rewrite signed-for-7', 'subjects signed-for-7']
  );
});

test('checkAgent: a good agent passes the three tasks; a broken one says which and why', async () => {
  const good = createAgentEndpoint({
    complete: async ({ task }) =>
      task === 'generate'
        ? EMAIL
        : task === 'rewrite'
          ? { text: 'Summer sale: 30% off until Wednesday. <a href="https://example.com/sale">See the offers</a>.' }
          : { subjects: ['Three days, 30% off', 'Your summer sale is here', 'Last call: 30% off'] },
  });
  const report = await checkAgent({ url: AGENT_URL, fetch: fetchTo(good), compile: compileMjml });
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.results.map((r) => [r.task, r.ok, r.attempts]), [['generate', true, 1], ['rewrite', true, 1], ['subjects', true, 1]]);
  assert.equal(report.results[0].sample.subject, 'Welcome to Acme');

  // Prose instead of an email, a rewrite that drops the link, and no subjects at all.
  const broken = createAgentEndpoint({
    complete: async ({ task }) => {
      if (task === 'subjects') throw Object.assign(new Error('I cannot'), { code: 'REFUSED' });
      return task === 'generate' ? 'Sure! Here is your email: hello.' : { text: 'Summer sale: 30% off.' };
    },
  });
  const failed = await checkAgent({ url: AGENT_URL, fetch: fetchTo(broken) });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.results.map((r) => [r.task, r.ok, r.code]), [
    ['generate', false, 'INVALID_OUTPUT'],
    ['rewrite', false, 'REWRITE_UNUSABLE'],
    ['subjects', false, 'SUBJECTS_REFUSED'],
  ]);
});
