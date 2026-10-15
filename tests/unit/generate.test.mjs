/**
 * GENERATE: an email written by a model, from a purpose. The model is a fake
 * that answers what a real one gets wrong — prose around the JSON, shorthand
 * padding, content outside columns, stock photos, invented variables,
 * forbidden HTML — and the email that comes out must open in the builder and
 * pass the server's checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMjml,
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  createMemoryVariableRepository,
  qualityReport,
  validateMjml,
} from '../../src/server/index.js';
import {
  EMAIL_PURPOSES,
  PURPOSE_CATEGORIES,
  SYSTEM_PROMPT,
  buildUserPrompt,
  claudeEmailModel,
  cleanGenerateInput,
  createEmailGenerator,
  normalizeGeneratedMjml,
  parseDraft,
  purposeById,
} from '../../src/ai/server.js';
import { parseMjml } from '../../src/engine/mjml.js';

const GOOD_MJML =
  '<mjml><mj-body background-color="#eceff4" width="600px">' +
  '<mj-section background-color="#ffffff" padding-top="24px" padding-bottom="24px"><mj-column>' +
  '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="28px" line-height="36px" color="#212e5a" font-weight="bold" padding-left="32px" padding-right="32px">Hello {{contact.firstname|there}}</mj-text>' +
  '<mj-button href="https://example.com/shop" background-color="#2977bc" color="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15px" line-height="20px" font-weight="bold" border-radius="6px" inner-padding="12px 28px">Shop the sale</mj-button>' +
  '</mj-column></mj-section>' +
  '<mj-section padding-top="20px" padding-bottom="28px"><mj-column>' +
  '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="12px" line-height="18px" color="#6d7484" align="center">Shop · [Company address]<br /><a href="{{ unsubscribe }}" style="color:#6d7484;text-decoration:underline;">Unsubscribe</a></mj-text>' +
  '</mj-column></mj-section>' +
  '</mj-body></mjml>';

const answer = (mjml, extra = {}) =>
  JSON.stringify({ name: 'Summer sale', subject: 'Summer sale: 30% off', preheader: 'Three days only, on everything in store.', mjml, ...extra });

/** A model that plays back answers and records what it was asked. */
function scripted(...answers) {
  const calls = [];
  const model = async (request) => {
    calls.push(structuredClone({ system: request.system, messages: request.messages, schema: request.schema }));
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { model, calls };
}

test('purposes: a rich catalog, unique ids, every one in a category, with a brief and a kind', () => {
  assert.ok(EMAIL_PURPOSES.length >= 60);
  const ids = EMAIL_PURPOSES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const categories = new Set(PURPOSE_CATEGORIES.map((c) => c.id));
  for (const entry of EMAIL_PURPOSES) {
    assert.ok(categories.has(entry.category), entry.id);
    assert.ok(entry.brief.length > 40, entry.id);
    assert.ok(['marketing', 'transactional', 'security'].includes(entry.kind), entry.id);
  }
  for (const id of ['password-reset', 'sale', 'meeting-reminder', 'christmas', 'birthday', 'order-confirmation']) {
    assert.ok(purposeById(id), id);
  }
  assert.equal(purposeById('password-reset').kind, 'security');
});

test('prompt: purpose brief, language, sender, variables and the footer rule of its kind', () => {
  const prompt = buildUserPrompt({
    purpose: purposeById('password-reset'),
    details: 'Link valid 30 minutes',
    language: 'fr',
    sender: { name: 'Maison Lumière', address: '12 rue des Fleurs, Dijon' },
    variables: [{ key: 'contact.firstname', label: 'First name' }, { key: 'unsubscribe' }],
  });
  assert.match(prompt, /Password reset/);
  assert.match(prompt, /Link valid 30 minutes/);
  assert.match(prompt, /French/);
  assert.match(prompt, /Maison Lumière/);
  assert.match(prompt, /\{\{contact\.firstname\}\}: First name/);
  assert.doesNotMatch(prompt, /\{\{unsubscribe\}\}:/);
  assert.match(prompt, /NO unsubscribe/);
  assert.match(buildUserPrompt({ purpose: purposeById('sale') }), /MUST contain the unsubscribe link/);
  assert.match(buildUserPrompt({ details: 'A note to our volunteers' }), /Write the email described below/);
  // The rules the builder depends on are in the system prompt.
  for (const rule of [/padding-top, padding-right, padding-bottom, padding-left/, /src EMPTY/, /Never use mj-hero/, /web-safe/]) {
    assert.match(SYSTEM_PROMPT, rule);
  }
});

test('input is cleaned: unknown purpose dropped, bounded details, https logo only, safe variable keys', () => {
  const input = cleanGenerateInput({
    purpose: 'nope',
    details: 'x'.repeat(5000),
    language: 'fr"; drop',
    sender: { name: 'Shop', logoUrl: 'javascript:alert(1)' },
    variables: [{ key: 'order.number', label: 'Order' }, { key: '}}<script>' }],
  });
  assert.equal(input.purpose, null);
  assert.equal(input.details.length, 2000);
  assert.equal(input.language, 'en');
  assert.equal(input.sender.logoUrl, '');
  assert.deepEqual(input.variables.map((v) => v.key), ['order.number']);
  assert.equal(cleanGenerateInput({ sender: { logoUrl: 'https://cdn.example.com/logo.png' } }).sender.logoUrl, 'https://cdn.example.com/logo.png');
});

test('parseDraft: JSON in fences or prose, bare MJML, plain one-line texts; anything else refused', () => {
  const fenced = parseDraft('Here it is:\n```json\n' + answer(GOOD_MJML, { subject: '<b>Summer</b>\n sale' }) + '\n```');
  assert.equal(fenced.subject, 'Summer sale');
  assert.equal(fenced.name, 'Summer sale');
  assert.equal(parseDraft(GOOD_MJML).mjml, GOOD_MJML);
  assert.throws(() => parseDraft('Sorry, I cannot.'), (error) => error.code === 'INVALID_ANSWER');
  assert.throws(() => parseDraft('{"subject": "no mjml"}'), (error) => error.code === 'INVALID_ANSWER');
});

test('parseDraft: markup a model escaped twice is decoded once more; real quotes are left alone', () => {
  // Seen from a free model: the MJML still JSON-escaped once the answer is read.
  const twice = JSON.stringify(GOOD_MJML).slice(1, -1);
  assert.match(twice, /=\\"/);
  assert.equal(parseDraft(answer(twice)).mjml, GOOD_MJML);
  // Quotes only, a raw line break inside (not a JSON string body).
  const quotesOnly = '<mjml><mj-body width=\\"600px\\">\n<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>';
  assert.equal(parseDraft(answer(quotesOnly)).mjml, '<mjml><mj-body width="600px">\n<mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>');
  // A text that quotes a backslash among real attributes stays as written.
  const real = '<mjml><mj-body width="600px"><mj-section><mj-column><mj-text>Use a=\\"b\\" here</mj-text></mj-column></mj-section></mj-body></mjml>';
  assert.equal(parseDraft(answer(real)).mjml, real);
});

test('normalize: longhand padding, content put in columns and sections, hero and wrapper flattened', () => {
  const messy =
    '<mjml><mj-head><mj-attributes><mj-all font-family="Comic Sans" /></mj-attributes><mj-style>.x{}</mj-style></mj-head>' +
    '<mj-body width="640px">' +
    '<mj-text padding="10px 20px" font-size="14" css-class="x">Loose text</mj-text>' +
    '<mj-hero background-color="#000000" background-url="https://picsum.photos/600" mode="fluid-height" padding="40px 0px">' +
    '<mj-text color="#ffffff">Hero</mj-text><mj-button href="https://example.com">Go</mj-button></mj-hero>' +
    '<mj-wrapper background-color="#fafafa"><mj-section><mj-group><mj-column><mj-image src="https://via.placeholder.com/300" alt="Product"></mj-image></mj-column><mj-column><mj-text>Name</mj-text></mj-column></mj-group></mj-section></mj-wrapper>' +
    '<mj-section><mj-text>Text without a column</mj-text></mj-section>' +
    '</mj-body></mjml>';
  const out = normalizeGeneratedMjml(messy);

  assert.doesNotMatch(out, /\spadding="/, 'no shorthand padding');
  assert.match(out, /padding-top="10px" padding-right="20px" padding-bottom="10px" padding-left="20px"/);
  assert.match(out, /font-size="14px"/);
  for (const gone of ['mj-head', 'mj-hero', 'mj-wrapper', 'mj-group', 'mj-style', 'css-class', 'background-url', 'picsum', 'placeholder.com']) {
    assert.ok(!out.includes(gone), gone);
  }
  assert.match(out, /<mj-body background-color="#eceff4" width="600px">/);
  assert.match(out, /<mj-image src="" alt="Product"/, 'stock photo removed, alt kept');

  // Every content element is in a column, every column in a section.
  const tree = parseMjml(out);
  const body = tree.children.find((n) => n.tag === 'mj-body');
  for (const section of body.children) {
    assert.equal(section.tag, 'mj-section');
    for (const column of section.children) assert.equal(column.tag, 'mj-column');
  }
  assert.equal(body.children.length, 4);
  assert.equal(body.children[1].attributes['background-color'], '#000000', 'hero keeps its color');
  assert.equal(body.children[2].attributes['background-color'], '#fafafa', 'wrapper color goes to its section');
  assert.equal(body.children[2].children.length, 2, 'group columns stay side by side');
});

test('normalize: the sender logo is kept; unknown variables become placeholders, example links in URLs', () => {
  const mjml =
    '<mjml><mj-body><mj-section><mj-column>' +
    '<mj-image src="https://cdn.example.com/logo.png" alt="Shop"></mj-image>' +
    '<mj-text>Order {{order.number}} for {{contact.firstname|there}}, <a href="{{order.url}}">see it</a></mj-text>' +
    '<mj-button href="{{reset_link}}">Reset</mj-button>' +
    '<mj-text><a href="{{ unsubscribe }}">Unsubscribe</a></mj-text>' +
    '</mj-column></mj-section></mj-body></mjml>';
  const out = normalizeGeneratedMjml(mjml, {
    variables: [{ key: 'contact.firstname' }],
    keepImages: ['https://cdn.example.com/logo.png'],
  });
  assert.match(out, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.match(out, /Order \[order number\] for \{\{contact\.firstname\|there\}\}/);
  assert.match(out, /<a href="https:\/\/example\.com">see it<\/a>/);
  assert.match(out, /<mj-button href="https:\/\/example\.com"/);
  assert.match(out, /href="\{\{ unsubscribe \}\}"/);
});

test('generator: a messy answer comes out valid, compiled and clean in one call', async () => {
  const messy = GOOD_MJML.replace('padding-top="24px" padding-bottom="24px"', 'padding="24px 0px"').replace(
    '<mj-column>',
    '<mj-column><mj-image src="https://picsum.photos/600/300" alt="Beach"></mj-image>'
  );
  const { model, calls } = scripted('```json\n' + answer(messy) + '\n```');
  const generator = createEmailGenerator({ model, compile: compileMjml });
  const email = await generator.generate({ purpose: 'sale', language: 'en', sender: { name: 'Shop' } });

  assert.equal(calls.length, 1);
  assert.equal(email.attempts, 1);
  assert.deepEqual(email.warnings, []);
  assert.equal(email.subject, 'Summer sale: 30% off');
  assert.ok(validateMjml(email.mjml).ok);
  assert.doesNotMatch(email.mjml, /\spadding="/);
  assert.match(email.mjml, /<mj-image src="" alt="Beach"/);
  const { html, warnings } = await compileMjml(email.mjml);
  assert.deepEqual(warnings, []);
  const quality = qualityReport({ mjml: email.mjml, html, subject: email.subject }).map((issue) => issue.code);
  assert.deepEqual(quality, ['IMAGE_NO_SRC'], 'only the photo to upload is left to the user');
  // What the model was asked.
  assert.equal(calls[0].system, SYSTEM_PROMPT);
  assert.match(calls[0].messages[0].content, /Store sale/);
  assert.deepEqual(calls[0].schema.required, ['name', 'subject', 'preheader', 'mjml']);
});

test('generator: forbidden HTML is sent back once with the problems, the corrected email is used', async () => {
  const bad = GOOD_MJML.replace('Shop the sale', 'Shop<script>alert(1)</script>');
  const { model, calls } = scripted(answer(bad), answer(GOOD_MJML));
  const email = await createEmailGenerator({ model }).generate({ purpose: 'sale' });
  assert.equal(calls.length, 2);
  assert.equal(email.attempts, 2);
  assert.equal(calls[1].messages.length, 3);
  assert.equal(calls[1].messages[1].role, 'assistant');
  assert.match(calls[1].messages[2].content, /script not allowed/);
  assert.ok(validateMjml(email.mjml).ok);
});

test('generator: a missing unsubscribe link is asked for, and the email is still used if it stays missing', async () => {
  const noUnsubscribe = GOOD_MJML.replace(/<a href="\{\{ unsubscribe \}\}"[^>]*>Unsubscribe<\/a>/, '');
  const { model, calls } = scripted(answer(noUnsubscribe), answer(noUnsubscribe));
  const email = await createEmailGenerator({ model }).generate({ purpose: 'newsletter' });
  assert.equal(calls.length, 2);
  assert.match(calls[1].messages[2].content, /unsubscribe/);
  assert.equal(email.attempts, 2);
  assert.match(email.warnings.join(' '), /unsubscribe/);

  // A security email must NOT have one.
  const security = scripted(answer(GOOD_MJML), answer(noUnsubscribe));
  const reset = await createEmailGenerator({ model: security.model }).generate({ purpose: 'password-reset' });
  assert.match(security.calls[1].messages[2].content, /must not have an unsubscribe link/);
  assert.doesNotMatch(reset.mjml, /unsubscribe/);
});

test('generator: unusable twice → INVALID_OUTPUT; nothing asked → 400; model errors and aborts go through', async () => {
  const unreadable = scripted('I cannot help', 'still prose');
  await assert.rejects(createEmailGenerator({ model: unreadable.model }).generate({ purpose: 'sale' }), (error) => error.code === 'INVALID_OUTPUT');
  assert.match(unreadable.calls[1].messages[2].content, /expected JSON object/);

  await assert.rejects(createEmailGenerator({ model: scripted().model }).generate({}), (error) => error.code === 'NOTHING_TO_GENERATE' && error.status === 400);

  const failing = scripted(new Error('overloaded'));
  await assert.rejects(createEmailGenerator({ model: failing.model }).generate({ purpose: 'sale' }), /overloaded/);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(createEmailGenerator({ model: scripted(answer(GOOD_MJML)).model }).generate({ purpose: 'sale' }, { signal: controller.signal }), (error) => error.name === 'AbortError');
});

test('claudeEmailModel: streamed request with structured output; refusal and truncation are errors', async () => {
  const requests = [];
  const client = (message) => ({
    messages: {
      stream: (params, options) => {
        requests.push({ params, options });
        return { finalMessage: async () => message };
      },
    },
  });
  const ok = claudeEmailModel({ client: client({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '…' }, { type: 'text', text: answer(GOOD_MJML) }] }) });
  const signal = new AbortController().signal;
  const text = await ok({ system: 'S', messages: [{ role: 'user', content: 'U' }], schema: { type: 'object' }, signal });
  assert.equal(JSON.parse(text).name, 'Summer sale');
  const { params, options } = requests[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.system, 'S');
  assert.deepEqual(params.output_config, { effort: 'medium', format: { type: 'json_schema', schema: { type: 'object' } } });
  assert.equal(params.thinking, undefined, 'thinking is always on for this model: not sent');
  assert.equal(options.signal, signal);

  const refused = claudeEmailModel({ client: client({ stop_reason: 'refusal', content: [] }) });
  await assert.rejects(refused({ system: '', messages: [], schema: {} }), (error) => error.code === 'REFUSED');
  const cut = claudeEmailModel({ client: client({ stop_reason: 'max_tokens', content: [] }) });
  await assert.rejects(cut({ system: '', messages: [], schema: {} }), (error) => error.code === 'TRUNCATED');
  assert.throws(() => claudeEmailModel({}), /Anthropic client/);
});

const ORIGIN = 'https://app.example.com';
function handlerWith(options) {
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    variableStore: createMemoryVariableRepository(),
    authorize: (request) => (request.headers.get('authorization') === 'Bearer ok' ? { id: 7 } : null),
    onError: () => {},
    ...options,
  });
  const post = (body, { auth = true } = {}) =>
    handler(
      new Request(`${ORIGIN}/api/email-builder/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ok' } : {}) },
        body: JSON.stringify(body),
      })
    );
  return { handler, post };
}

test('route POST /generate: 501 without generator, the server catalog as variables, rate limit, errors translated', async () => {
  assert.equal((await handlerWith({}).post({ purpose: 'sale' })).status, 501);

  const inputs = [];
  const generator = {
    generate: async (input) => {
      inputs.push(input);
      return { name: 'N', subject: 'S', preheader: 'P', mjml: GOOD_MJML, warnings: [], attempts: 1 };
    },
  };
  const { post } = handlerWith({ generator, rateLimits: { generatePerHour: 2 }, locale: 'fr' });
  assert.equal((await post({ purpose: 'sale' }, { auth: false })).status, 401);
  const response = await post({ purpose: 'sale', variables: [{ key: 'evil' }] });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.subject, 'S');
  assert.equal(inputs[0].language, 'fr', 'the server language by default');
  assert.ok(inputs[0].variables.some((v) => v.key === 'contact.firstname'));
  assert.ok(!inputs[0].variables.some((v) => v.key === 'evil'), 'the browser does not choose the variables');
  await post({ purpose: 'sale' });
  const limited = await post({ purpose: 'sale' });
  assert.equal(limited.status, 429);

  // A real generator: a failed model is a 502 that says why, in the server's language.
  const { post: postFailing } = handlerWith({ generator: createEmailGenerator({ model: async () => 'prose' }), locale: 'fr' });
  const failed = await postFailing({ purpose: 'sale' });
  assert.equal(failed.status, 502);
  assert.equal((await failed.json()).code, 'INVALID_OUTPUT');
  const { post: postDown } = handlerWith({ generator: createEmailGenerator({ model: async () => { throw new Error('ECONNRESET'); } }) });
  const down = await postDown({ purpose: 'sale' });
  assert.equal(down.status, 502);
  assert.match((await down.json()).error, /did not answer/);
  const { post: postEmpty } = handlerWith({ generator: createEmailGenerator({ model: async () => answer(GOOD_MJML) }), locale: 'fr' });
  const empty = await postEmpty({});
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /Choisissez/);
});
