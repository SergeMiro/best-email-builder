/**
 * Server: HTTP handler end to end (memory repositories), rendering, test send,
 * uploaded images. Nothing is sent: the transport is simulated.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTemplateRepository,
  createMemoryVariableRepository,
  inspectAsset,
  personalize,
  renderEmail,
  sendTestEmail,
  absoluteAssetUrls,
  isAssetPath,
  applyServiceLinks,
  DEFAULT_VARIABLES,
  EXAMPLE_VARIABLES,
} from '../../src/server/index.js';
import { createDocument } from '../../src/core/document.js';
import { STARTER_MJML, createStarterMjml } from '../../src/features/templates/starter.js';
import { translatorFor } from '../../src/i18n/index.js';

const ORIGIN = 'https://app.example.com';
// 1×1 transparent PNG.
const PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
);
const DOC = createDocument({ engine: 'grapesjs', engineVersion: '0.22.16', project: { pages: [] } });
// The application's own variables: there are none by default but the unsubscribe link.
const VARIABLES = [...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES];
const MJML = '<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.firstname}}</mj-text></mj-column></mj-section></mj-body></mjml>';

function setup(overrides = {}) {
  const sent = [];
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    variableStore: createMemoryVariableRepository(),
    variables: VARIABLES,
    authorize: (request) => (request.headers.get('authorization') === 'Bearer ok' ? { id: 7, name: 'ada' } : null),
    publicUrl: ORIGIN,
    transport: { send: async (email) => void sent.push(email) },
    ...overrides,
  });
  const call = (method, path, body, { auth = true, raw = false } = {}) =>
    handler(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: {
          ...(auth ? { authorization: 'Bearer ok' } : {}),
          ...(body && !raw ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? (raw ? body : JSON.stringify(body)) : undefined,
      })
    );
  return { handler, call, sent };
}

test('handler refuses to start without authorize', () => {
  assert.throws(() => createEmailBuilderHandler({ templates: {}, assets: {} }), /authorize/);
});

test('templates: create, load, save with revision, conflict, versions, duplicate, delete', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/email-builder/templates', null, { auth: false })).status, 401);

  const created = await call('POST', '/api/email-builder/templates', { name: 'Welcome', subject: 'Hi', document: DOC, mjml: MJML });
  assert.equal(created.status, 201);
  const { template } = (await created.json()).data;
  assert.equal(template.name, 'Welcome');
  assert.equal(template.createdBy, 'ada');
  assert.match(template.html, /^<!doctype html>/i);
  assert.match(template.html, /<title>Hi<\/title>/);

  const loaded = (await (await call('GET', `/api/email-builder/templates/${template.id}`)).json()).data;
  assert.deepEqual(loaded.document, DOC);

  const saved = await call('PUT', `/api/email-builder/templates/${template.id}`, {
    document: DOC,
    mjml: MJML,
    name: 'Welcome v2',
    revision: loaded.revision,
    createVersion: true,
  });
  assert.equal(saved.status, 200);
  const savedData = (await saved.json()).data;
  assert.equal(savedData.version.versionNumber, 2);
  assert.equal(savedData.template.document, undefined);

  // Stale revision: refused, nothing overwritten.
  const stale = await call('PUT', `/api/email-builder/templates/${template.id}`, { document: DOC, mjml: MJML, revision: loaded.revision });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, 'CONFLICT');

  const versions = (await (await call('GET', `/api/email-builder/templates/${template.id}/versions`)).json()).data;
  assert.deepEqual(versions.map((v) => v.versionNumber), [2, 1]);
  const v1 = (await (await call('GET', `/api/email-builder/templates/${template.id}/versions/${versions[1].id}`)).json()).data;
  assert.equal(v1.name, 'Welcome');
  assert.deepEqual(v1.document, DOC);

  const copy = (await (await call('POST', '/api/email-builder/templates', { duplicateOf: template.id })).json()).data;
  assert.equal(copy.template.name, 'Welcome v2 (copy)');

  const list = (await (await call('GET', '/api/email-builder/templates')).json()).data;
  assert.equal(list.length, 2);
  assert.equal(list[0].document, undefined);

  assert.equal((await call('DELETE', `/api/email-builder/templates/${copy.template.id}`)).status, 200);
  assert.equal((await call('GET', `/api/email-builder/templates/${copy.template.id}`)).status, 404);
});

test('templates: invalid input is refused with a status, never stored', async () => {
  const { call } = setup();
  const noName = await call('POST', '/api/email-builder/templates', { name: ' ', document: DOC, mjml: MJML });
  assert.equal(noName.status, 400);
  const script = await call('POST', '/api/email-builder/templates', {
    name: 'X',
    document: DOC,
    mjml: '<mjml><mj-body><mj-raw><script>alert(1)</script></mj-raw></mj-body></mjml>',
  });
  assert.equal(script.status, 422);
  const badJson = await call('POST', '/api/email-builder/templates', '{nope', { raw: true });
  assert.equal(badJson.status, 400);
  assert.equal((await (await call('GET', '/api/email-builder/templates')).json()).data.length, 0);
  assert.equal((await call('GET', '/api/email-builder/unknown')).status, 404);
});

test('server messages follow the configured locale', async () => {
  const { call } = setup({ locale: 'fr' });
  const res = await call('GET', '/api/email-builder/templates/999');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, translatorFor('fr')('Template not found'));
  assert.notEqual(translatorFor('fr')('Template not found'), 'Template not found');
});

test('render: sample values, inert unsubscribe, relative images, quality report', async () => {
  const { call } = setup();
  const res = await call('POST', '/api/email-builder/render', { mjml: STARTER_MJML, subject: 'Hello' });
  const { html, quality } = (await res.json()).data;
  assert.ok(html.includes('Hello,'));
  assert.ok(!html.includes('{{'));
  assert.deepEqual(quality, []);
});

test('test send: one address at a time, [TEST] subject, failures isolated, rate limited', async () => {
  const { call, sent } = setup({ rateLimits: { testPerHour: 1 } });
  const res = await call('POST', '/api/email-builder/test', {
    mjml: STARTER_MJML,
    subject: 'Letter',
    emails: ['Reviewer@Example.com', 'reviewer@example.com', 'not-an-address'],
  });
  const report = (await res.json()).data;
  assert.equal(report.sent, 1);
  assert.deepEqual(report.invalid, ['not-an-address']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'reviewer@example.com');
  assert.equal(sent[0].subject, '[TEST] Letter');
  assert.ok(sent[0].text.includes('Hello,') && !sent[0].text.includes('<'));
  const again = await call('POST', '/api/email-builder/test', { mjml: STARTER_MJML, emails: ['a@example.com'] });
  assert.equal(again.status, 429);
});

test('test send without transport: 501', async () => {
  const { call } = setup({ transport: null });
  assert.equal((await call('POST', '/api/email-builder/test', { mjml: STARTER_MJML, emails: ['a@example.com'] })).status, 501);
});

/** A host's contacts: user 7 sees Ada (and her empty last name), never Bob. */
function contactStore() {
  const rows = [
    { id: '1', owner: 7, email: 'ada@example.com', label: 'Ada', detail: 'Acme', lists: ['5'], values: { 'contact.firstname': 'Ada', 'contact.lastname': '' } },
    { id: '2', owner: 8, email: 'bob@example.com', label: 'Bob', detail: 'Other', values: { 'contact.firstname': 'Bob' } },
  ];
  const calls = [];
  const visible = (user) => rows.filter((r) => r.owner === user.id);
  return {
    calls,
    search: async (query, { user, limit, list }) => {
      calls.push({ query, limit, list });
      return visible(user).filter(
        (r) => (!list || r.lists?.includes(list)) && `${r.label} ${r.email}`.toLowerCase().includes(query.toLowerCase())
      );
    },
    get: async (ids, { user }) => visible(user).filter((r) => ids.includes(r.id)),
    lists: async ({ user }) => (user.id === 7 ? [{ id: 5, name: 'Clients', detail: 'Acme', count: '1' }] : []),
  };
}

test('contacts: searched for the user, without their values; 501 without a store', async () => {
  const store = contactStore();
  const { call } = setup({ contactStore: store });
  const res = await call('GET', '/api/email-builder/contacts?q=ad');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).data, [{ id: '1', email: 'ada@example.com', label: 'Ada', detail: 'Acme' }]);
  assert.deepEqual(store.calls, [{ query: 'ad', limit: 50, list: null }]);
  assert.equal((await call('GET', '/api/email-builder/contacts?q=ad', null, { auth: false })).status, 401);
  assert.equal((await setup().call('GET', '/api/email-builder/contacts')).status, 501);
});

test('contacts: the user’s lists, and the contacts of one list', async () => {
  const store = contactStore();
  const { call } = setup({ contactStore: store });
  const lists = await call('GET', '/api/email-builder/contacts/lists');
  assert.equal(lists.status, 200);
  assert.deepEqual((await lists.json()).data, [{ id: '5', name: 'Clients', detail: 'Acme', count: 1 }]);
  assert.deepEqual((await (await call('GET', '/api/email-builder/contacts?q=&list=5')).json()).data.map((c) => c.id), ['1']);
  assert.deepEqual((await (await call('GET', '/api/email-builder/contacts?q=&list=9')).json()).data, []);
  assert.equal(store.calls.at(-1).list, '9');
  // A store without lists: none, not an error.
  const { lists: _lists, ...noLists } = contactStore();
  assert.deepEqual((await (await setup({ contactStore: noLists }).call('GET', '/api/email-builder/contacts/lists')).json()).data, []);
  assert.equal((await setup().call('GET', '/api/email-builder/contacts/lists')).status, 501);
  assert.equal((await call('GET', '/api/email-builder/contacts/lists', null, { auth: false })).status, 401);
});

test('render: the values the variables took come back with the email', async () => {
  const { call } = setup({ contactStore: contactStore() });
  const values = async (body) =>
    (await (await call('POST', '/api/email-builder/render', { mjml: MJML, ...body })).json()).data.values;
  assert.equal((await values({ contactId: '1' }))['contact.firstname'], 'Ada');
  assert.equal((await values({ contactId: '1' }))['contact.lastname'], '');
  assert.equal((await values({ email: 'rev@example.com' }))['contact.email'], 'rev@example.com');
  assert.notEqual((await values({}))['contact.firstname'], 'Ada');
});

test('render: without samples, every variable stays a tag; a contact or an address keeps its values', async () => {
  const { call } = setup({ contactStore: contactStore() });
  const render = async (body) =>
    (await (await call('POST', '/api/email-builder/render', { mjml: MJML, subject: 'Hi {{contact.firstname}}', ...body })).json()).data;
  const raw = await render({ samples: false, mjml: MJML.replace('</mj-text>', ' {{unsubscribe}}</mj-text>') });
  assert.match(raw.html, /Hello \{\{contact\.firstname\}\} \{\{unsubscribe\}\}/);
  assert.equal(raw.subject, 'Hi {{contact.firstname}}');
  assert.deepEqual(raw.values, {});
  assert.doesNotMatch((await render({})).html, /\{\{/);
  assert.match((await render({ contactId: '1', samples: false })).html, /Hello Ada/);
  assert.doesNotMatch((await render({ email: 'rev@example.com', samples: false })).html, /\{\{/);
});

test('render: a contact’s own values, a typed address’s samples, another user’s contact refused', async () => {
  const { call } = setup({ contactStore: contactStore() });
  const render = (body) => call('POST', '/api/email-builder/render', { mjml: MJML, ...body });
  const html = async (body) => (await (await render(body)).json()).data.html;
  assert.match(await html({ contactId: '1' }), /Hello Ada/);
  assert.doesNotMatch(await html({}), /Hello Ada|Hello Bob/);
  // Bob belongs to another user: neither his values nor samples posing as his.
  const bob = await render({ contactId: '2' });
  assert.equal(bob.status, 404);
  assert.equal((await bob.json()).code, 'CONTACT_UNAVAILABLE');
  assert.equal((await setup().call('POST', '/api/email-builder/render', { mjml: MJML, contactId: '1' })).status, 404);
});

test('test send: a contact gets its values, empty ones included; a typed address the samples', async () => {
  const { call, sent } = setup({ contactStore: contactStore() });
  const mjml = MJML.replace('Hello {{contact.firstname}}', 'Hello {{contact.firstname}} [{{contact.lastname}}]');
  const res = await call('POST', '/api/email-builder/test', {
    mjml,
    subject: 'Hi {{contact.firstname}}',
    emails: ['reviewer@example.com', 'ADA@example.com'],
    contacts: ['1', '2', '1'],
  });
  const report = (await res.json()).data;
  // Bob is not the user's: not sent, and said so. Ada typed again: one send, with her values.
  assert.deepEqual(report.results.map((r) => r.email), ['ada@example.com', 'reviewer@example.com']);
  assert.deepEqual(report.skipped, ['2']);
  assert.equal(sent[0].subject, '[TEST] Hi Ada');
  assert.match(sent[0].html, /Hello Ada \[\]/);
  assert.doesNotMatch(sent[1].html, /Hello Ada/);
  assert.doesNotMatch(sent[1].html, /\[\]/);
});

test('test send to contacts: none left is an error, too many is refused, never cut', async () => {
  const { call, sent } = setup({ contactStore: contactStore(), maxTestRecipients: 2 });
  const only = await call('POST', '/api/email-builder/test', { mjml: MJML, contacts: ['2'] });
  assert.equal(only.status, 400);
  assert.equal((await only.json()).code, 'CONTACT_UNAVAILABLE');
  const many = await call('POST', '/api/email-builder/test', { mjml: MJML, contacts: ['1', '2', '3'] });
  assert.equal(many.status, 400);
  assert.equal((await many.json()).code, 'TOO_MANY_RECIPIENTS');
  // Contacts and typed addresses count together.
  const mixed = await call('POST', '/api/email-builder/test', { mjml: MJML, contacts: ['1'], emails: ['a@example.com', 'b@example.com'] });
  assert.equal(mixed.status, 400);
  assert.equal(sent.length, 0);
});

test('sendTestEmail: a contact with an unusable address is listed as invalid', async () => {
  const report = await sendTestEmail({
    mjml: STARTER_MJML,
    contacts: [{ email: 'not-an-address', values: {} }, { email: 'Ada@Example.com', values: { 'contact.firstname': 'Ada' } }],
    transport: { send: async () => {} },
  });
  assert.deepEqual(report.invalid, ['not-an-address']);
  assert.deepEqual(report.results.map((r) => r.email), ['ada@example.com']);
});

test('sendTestEmail: a failing address does not stop the others', async () => {
  const report = await sendTestEmail({
    mjml: STARTER_MJML,
    emails: 'a@example.com, fail@example.com',
    transport: {
      send: async (email) => {
        if (email.to.startsWith('fail')) throw new Error('mailbox full');
      },
    },
  });
  assert.equal(report.sent, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.results[1].error, 'mailbox full');
  await assert.rejects(
    sendTestEmail({ mjml: STARTER_MJML, emails: Array.from({ length: 11 }, (_, i) => `a${i}@example.com`), transport: { send: async () => {} } }),
    (error) => error.status === 400
  );
});

test('assets: upload, dedupe, public GET with safe headers, refusals', async () => {
  const { call } = setup();
  const form = () => {
    const data = new FormData();
    data.append('file', new Blob([PNG], { type: 'image/png' }), 'pixel.png');
    return data;
  };
  const first = await call('POST', '/api/email-builder/assets', form(), { raw: true });
  assert.equal(first.status, 201);
  const uploaded = (await first.json()).data;
  assert.match(uploaded.path, /^\/api\/email-builder\/assets\/[a-f0-9]{32}\.png$/);
  assert.ok(isAssetPath(uploaded.path));
  const second = await call('POST', '/api/email-builder/assets', form(), { raw: true });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).data.path, uploaded.path);

  const image = await call('GET', uploaded.path, null, { auth: false });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('cache-control'), /immutable/);
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), PNG);

  assert.equal((await call('GET', '/api/email-builder/assets/0000.png', null, { auth: false })).status, 404);
  assert.equal((await call('POST', '/api/email-builder/assets', form(), { raw: true, auth: false })).status, 401);

  const svg = new FormData();
  svg.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'], { type: 'image/png' }), 'x.png');
  assert.equal((await call('POST', '/api/email-builder/assets', svg, { raw: true })).status, 415);
});

test('inspectAsset reads the type from the bytes', async () => {
  const { type, key } = inspectAsset(PNG);
  assert.equal(type, 'image/png');
  assert.match(key, /^[a-f0-9]{32}\.png$/);
  assert.throws(() => inspectAsset(new Uint8Array()), (e) => e.status === 400);
  assert.throws(() => inspectAsset(new Uint8Array(3 * 1024 * 1024).fill(0x89)), (e) => e.status === 413);
});

test('links: uploaded images become absolute at send time only', async () => {
  const path = '/email-assets/0123456789abcdef0123456789abcdef.png';
  const html = `<img src="${path}"><td style="background:url(${path})"><a href="https://x.com${path}">`;
  assert.equal(
    absoluteAssetUrls(html, 'https://mail.example.com/'),
    `<img src="https://mail.example.com${path}"><td style="background:url(https://mail.example.com${path})"><a href="https://x.com${path}">`
  );
  assert.equal(absoluteAssetUrls(html, null), html);
  assert.ok(!isAssetPath('/email-assets/../0123456789abcdef0123456789abcdef.png'));
  assert.ok(!isAssetPath('/images/logo.png'));
  assert.equal(
    personalize(`<img src="${path}">`, { values: {}, unsubscribeUrl: '#', baseUrl: 'https://e.com' }),
    `<img src="https://e.com${path}">`
  );
  assert.equal(applyServiceLinks('<a href="{{ unsubscribe }}">x</a><a href="{{mirror}}">y</a>', { unsubscribeUrl: 'https://u/?a=1&b=2' }),
    '<a href="https://u/?a=1&amp;b=2">x</a><a href="#">y</a>');
});

test('renderEmail: values escaped, missing value empty, never a raw tag', async () => {
  const { html } = await renderEmail({ mjml: MJML, values: { 'contact.firstname': '<b>Jo</b>' }, variables: VARIABLES });
  assert.ok(html.includes('Hello &lt;b&gt;Jo&lt;/b&gt;'));
  assert.ok(!(await renderEmail({ mjml: MJML, variables: VARIABLES })).html.includes('{{'));
});

test('starter template: sender, translated texts', () => {
  const mjml = createStarterMjml({ sender: { name: 'ACME & Co', address: '1 Main St' }, t: translatorFor('fr') });
  assert.ok(mjml.includes('ACME &amp; Co · 1 Main St'));
  assert.ok(mjml.includes('{{ unsubscribe }}'));
  assert.ok(!mjml.includes('Your headline'));
});

test('custom variables: create, edit, delete, used by preview and test send', async () => {
  const { call, handler, sent } = setup();
  const created = await call('POST', '/api/email-builder/variables', {
    label: 'Order number',
    key: 'order.number',
    sample: 'CMD-1042',
    fallback: 'your order',
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).data.group, 'Custom');

  // System keys and duplicates are refused; the key of an existing variable never changes.
  assert.equal((await call('POST', '/api/email-builder/variables', { label: 'X', key: 'contact.firstname' })).status, 400);
  assert.equal((await call('POST', '/api/email-builder/variables', { label: 'X', key: 'order.number' })).status, 400);
  assert.equal((await call('POST', '/api/email-builder/variables', { label: 'X', key: 'Bad Key' })).status, 400);
  const edited = await call('PUT', '/api/email-builder/variables/order.number', { key: 'other', label: 'Order', group: 'Orders' });
  const variable = (await edited.json()).data;
  assert.equal(variable.key, 'order.number');
  assert.equal(variable.group, 'Orders');
  assert.equal(variable.fallback, 'your order');

  const list = (await (await call('GET', '/api/email-builder/variables')).json()).data;
  assert.deepEqual(list.map((v) => v.key), ['order.number']);
  assert.ok((await handler.catalog()).some((v) => v.key === 'contact.firstname'));

  const mjml =
    '<mjml><mj-body><mj-section><mj-column><mj-text>Order {{order.number}} for {{contact.firstname}} {{contact.fistname}}</mj-text></mj-column></mj-section></mj-body></mjml>';
  const preview = (await (await call('POST', '/api/email-builder/render', { mjml, subject: 'Order {{order.number}}' })).json()).data;
  assert.ok(preview.html.includes('Order CMD-1042 for Jane'));
  assert.equal(preview.subject, 'Order CMD-1042');
  const unknown = preview.quality.find((q) => q.code === 'UNKNOWN_VARIABLE');
  assert.ok(unknown && unknown.message.includes('{{contact.fistname}}'));

  await call('POST', '/api/email-builder/test', { mjml, subject: 'Hi {{contact.firstname}}', emails: ['a@example.com'] });
  assert.equal(sent[0].subject, '[TEST] Hi Jane');

  assert.equal((await call('DELETE', '/api/email-builder/variables/order.number')).status, 200);
  assert.equal((await call('DELETE', '/api/email-builder/variables/order.number')).status, 404);
});

test('a system variable edited by a user: its sample in the preview, its tag kept; deleted, the application’s is back', async () => {
  const { call, handler } = setup();
  const put = (key, body) => call('PUT', `/api/email-builder/variables/${key}`, body);
  const edited = await put('contact.firstname', { key: 'other', label: 'Given name', sample: 'Jo', token: '{{ evil }}' });
  assert.equal(edited.status, 200);
  const variable = (await edited.json()).data;
  assert.equal(variable.key, 'contact.firstname');
  assert.equal(variable.label, 'Given name');
  assert.equal(variable.edited, true);
  // Edited again: the first edit is updated, not inserted twice.
  assert.equal((await put('contact.firstname', { label: 'Given name', group: '', sample: 'Joe' })).status, 200);
  const list = (await (await call('GET', '/api/email-builder/variables')).json()).data;
  assert.deepEqual(list.map((v) => [v.key, v.sample, v.group, v.custom]), [['contact.firstname', 'Joe', 'Recipient', undefined]]);
  const firstname = (await handler.catalog()).find((v) => v.key === 'contact.firstname');
  assert.equal(firstname.token, undefined);
  assert.equal(firstname.label, 'Given name');

  const preview = (await (await call('POST', '/api/email-builder/render', { mjml: MJML })).json()).data;
  assert.ok(preview.html.includes('Hello Joe'));
  // A label is still required.
  assert.equal((await put('contact.firstname', { label: '' })).status, 400);

  assert.equal((await call('DELETE', '/api/email-builder/variables/contact.firstname')).status, 200);
  assert.equal((await handler.catalog()).find((v) => v.key === 'contact.firstname').label, 'First name');
});

test('the unsubscribe link edited: its sample in the preview and tests, its value if empty when sending gives none', async () => {
  const { call, handler, sent } = setup();
  const put = (body) => call('PUT', '/api/email-builder/variables/unsubscribe', body);
  const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text><a href="{{ unsubscribe }}">Stop</a></mj-text></mj-column></mj-section></mj-body></mjml>';
  const preview = async () => (await (await call('POST', '/api/email-builder/render', { mjml })).json()).data.html;
  assert.ok((await preview()).includes('href="#"'), 'inert by default');

  // Never a script, whatever the spacing.
  assert.equal((await put({ label: 'Unsubscribe', sample: 'java\tscript:alert(1)' })).status, 400);
  assert.equal((await put({ label: 'Unsubscribe', fallback: 'data:text/html,x' })).status, 400);
  const edited = await put({ label: 'Opt out', sample: 'https://example.com/stop?a=1&b=2', fallback: '*|UNSUB|*', token: '{{ evil }}' });
  assert.equal(edited.status, 200);
  const link = (await handler.catalog()).find((v) => v.key === 'unsubscribe');
  assert.deepEqual([link.label, link.kind, link.token, link.edited], ['Opt out', 'link', '{{ unsubscribe }}', true]);

  assert.ok((await preview()).includes('href="https://example.com/stop?a=1&amp;b=2"'));
  await call('POST', '/api/email-builder/test', { mjml, emails: ['a@example.com'] });
  assert.ok(sent[0].html.includes('href="https://example.com/stop?a=1&amp;b=2"'));

  const compiled = '<a href="{{ unsubscribe }}">Stop</a>';
  const catalog = await handler.catalog();
  assert.equal(personalize(compiled, { values: {}, variables: catalog }), '<a href="*|UNSUB|*">Stop</a>');
  assert.equal(personalize(compiled, { values: {}, unsubscribeUrl: 'https://u/1', variables: catalog }), '<a href="https://u/1">Stop</a>');
  assert.equal(personalize(compiled, { values: {}, variables: VARIABLES }), '<a href="#">Stop</a>');

  assert.equal((await call('DELETE', '/api/email-builder/variables/unsubscribe')).status, 200);
  assert.ok((await preview()).includes('href="#"'));
});

test('custom variables without a store: listing is empty, writes are 501', async () => {
  const { call } = setup({ variableStore: null });
  assert.deepEqual((await (await call('GET', '/api/email-builder/variables')).json()).data, []);
  assert.equal((await call('POST', '/api/email-builder/variables', { label: 'X', key: 'x' })).status, 501);
});

test('variable groups: authenticated creation, duplicates and empty groups survive variable deletion', async () => {
  const { call } = setup();
  assert.equal((await call('POST', '/api/email-builder/variable-groups', { name: 'Brevo' }, { auth: false })).status, 401);
  assert.equal((await call('POST', '/api/email-builder/variable-groups', { name: 'Brevo' })).status, 201);
  assert.equal((await call('POST', '/api/email-builder/variable-groups', { name: ' brevo ' })).status, 409);
  assert.equal((await call('POST', '/api/email-builder/variable-groups', { name: '' })).status, 400);
  assert.equal((await call('POST', '/api/email-builder/variables', { key: 'group_test', label: 'Group test', group: 'Brevo' })).status, 201);
  await call('DELETE', '/api/email-builder/variables/group_test');
  const groups = (await (await call('GET', '/api/email-builder/variable-groups')).json()).data;
  assert.ok(groups.includes('Brevo'));
});

test('variable groups: renamed and deleted by name, with authentication', async () => {
  const { call } = setup();
  await call('POST', '/api/email-builder/variable-groups', { name: 'Brevo' });
  await call('POST', '/api/email-builder/variable-groups', { name: 'SFR' });
  const groups = async () => (await (await call('GET', '/api/email-builder/variable-groups')).json()).data;
  assert.equal((await call('PUT', '/api/email-builder/variable-groups/Brevo', { name: 'Sendinblue' }, { auth: false })).status, 401);
  assert.equal((await call('PUT', '/api/email-builder/variable-groups/Brevo', { name: 'sfr' })).status, 409);
  assert.equal((await call('PUT', '/api/email-builder/variable-groups/Brevo', { name: '' })).status, 400);
  const renamed = await call('PUT', '/api/email-builder/variable-groups/Brevo', { name: 'Sendinblue' });
  assert.equal((await renamed.json()).data, 'Sendinblue');
  assert.deepEqual((await groups()).slice(0, 2), ['Sendinblue', 'SFR']);
  assert.equal((await call('DELETE', '/api/email-builder/variable-groups/SFR', null, { auth: false })).status, 401);
  assert.equal((await call('DELETE', '/api/email-builder/variable-groups/SFR')).status, 200);
  assert.ok(!(await groups()).includes('SFR'));
});
