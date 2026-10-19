/**
 * Tags on templates: the shared rules, the memory storage, the HTTP storage
 * and the server's routes (memory repositories).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TEMPLATE_TAGS, checkTemplateTags, sortTags, validateTag } from '../../src/features/tags/tags.js';
import { createHttpStorage, createMemoryStorage } from '../../src/storage/client.js';
import {
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryTagRepository,
  createMemoryTemplateRepository,
} from '../../src/server/index.js';
import { createDocument } from '../../src/core/document.js';
import { translatorFor } from '../../src/i18n/index.js';

const DOC = createDocument({ engine: 'beb-mjml', engineVersion: '', project: { format: 1, root: { id: 'r', tag: 'mjml' } } });
const MJML = '<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>';
const TAGS = [
  { id: '1', label: 'Marketing', color: 'blue' },
  { id: '2', label: 'Events', color: 'violet' },
];

test('validateTag: a name, unique case aside, of 24 characters at most, and a color of the palette', () => {
  assert.deepEqual(validateTag({ label: '  Black   Friday ', color: 'red' }), { tag: { label: 'Black Friday', color: 'red' } });
  assert.deepEqual(validateTag({ label: '', color: 'red' }).errors, { label: 'Name is required' });
  assert.deepEqual(validateTag({ label: 'x'.repeat(25), color: 'red' }).errors, { label: '24 characters at most' });
  assert.deepEqual(validateTag({ label: 'MARKETING', color: 'red' }, { existing: TAGS }).errors, { label: 'A tag with this name already exists' });
  // Its own name is no duplicate; accents still tell two names apart.
  assert.ok(validateTag({ label: 'marketing', color: 'red' }, { existing: TAGS, editing: '1' }).tag);
  assert.ok(validateTag({ label: 'Évents', color: 'red' }, { existing: TAGS }).tag);
  assert.deepEqual(validateTag({ label: 'VIP', color: '#ff0000' }).errors, { color: 'Choose a color' });
  const t = translatorFor('fr');
  assert.deepEqual(validateTag({ label: 'events', color: 'red' }, { existing: TAGS, t }).errors, { label: 'Une étiquette porte déjà ce nom' });
});

test('checkTemplateTags: known ids, each once, three at most, in the list’s order', () => {
  assert.deepEqual(checkTemplateTags(['1', 2, '2'], sortTags(TAGS)), { ids: ['2', '1'] });
  assert.deepEqual(checkTemplateTags([], TAGS), { ids: [] });
  assert.equal(checkTemplateTags('1', TAGS).error.code, 'INVALID_TAGS');
  assert.equal(checkTemplateTags(['9'], TAGS).error.code, 'UNKNOWN_TAG');
  const many = Array.from({ length: MAX_TEMPLATE_TAGS + 1 }, (_, i) => ({ id: String(i), label: `T${i}`, color: 'gray' }));
  assert.deepEqual(checkTemplateTags(many.map((tag) => tag.id), many).error, { code: 'TOO_MANY_TAGS', message: '3 tags at most per template' });
});

test('memory storage: tags by name, three per template, a copy keeps them, a deleted tag leaves every template', async () => {
  const storage = createMemoryStorage();
  const vip = await storage.saveTag({ label: 'VIP', color: 'amber' }, { create: true });
  const events = await storage.saveTag({ label: 'Events', color: 'violet' }, { create: true });
  const sale = await storage.saveTag({ label: 'Sale', color: 'red' }, { create: true });
  const news = await storage.saveTag({ label: 'News', color: 'blue' }, { create: true });
  assert.deepEqual((await storage.listTags()).map((tag) => tag.label), ['Events', 'News', 'Sale', 'VIP']);
  await assert.rejects(storage.saveTag({ label: 'vip', color: 'red' }, { create: true }), { status: 400, code: 'INVALID_TAG' });
  await assert.rejects(storage.saveTag({ id: '99', label: 'X', color: 'red' }), { status: 404 });

  const { template } = await storage.create({ name: 'Sale', document: DOC, mjml: MJML });
  assert.deepEqual(template.tags, []);
  assert.deepEqual(await storage.setTemplateTags(template.id, [vip.id, events.id]), [events.id, vip.id]);
  await assert.rejects(storage.setTemplateTags(template.id, [vip.id, events.id, sale.id, news.id]), { code: 'TOO_MANY_TAGS' });
  await assert.rejects(storage.setTemplateTags(template.id, ['99']), { code: 'UNKNOWN_TAG' });
  await assert.rejects(storage.setTemplateTags(999, []), { status: 404 });
  assert.deepEqual((await storage.list())[0].tags, [events.id, vip.id]);

  const renamed = await storage.saveTag({ id: vip.id, label: 'Customers', color: 'teal' });
  assert.deepEqual(renamed, { id: vip.id, label: 'Customers', color: 'teal' });
  const copy = await storage.duplicate(template.id);
  assert.deepEqual(copy.template.tags, [events.id, vip.id]);

  await storage.deleteTag(events.id);
  assert.deepEqual((await storage.list()).map((t) => t.tags), [[vip.id], [vip.id]]);
  await assert.rejects(storage.deleteTag(events.id), { status: 404 });
  assert.deepEqual(storage.dump().tags.map((tag) => tag.label), ['Customers', 'News', 'Sale']);
});

test('memory storage: `compile` keeps the final HTML, given by load() and never by list()', async () => {
  const calls = [];
  const storage = createMemoryStorage({
    compile: async (input) => (calls.push(input), { html: `<html>${input.subject}</html>` }),
  });
  const { template } = await storage.create({ name: 'A', subject: 'Hi', document: DOC, mjml: MJML });
  assert.equal(template.html, '<html>Hi</html>');
  await storage.save(template.id, { document: DOC, mjml: MJML, subject: 'Hello' });
  assert.equal((await storage.load(template.id)).html, '<html>Hello</html>');
  // A save without a subject compiles with the one kept.
  await storage.save(template.id, { document: DOC, mjml: MJML });
  assert.equal(calls.at(-1).subject, 'Hello');
  assert.equal('html' in (await storage.list())[0], false);
  // Without it, no HTML at all: the library shows no Copy HTML / Download.
  const plain = createMemoryStorage();
  const { template: bare } = await plain.create({ name: 'B', document: DOC, mjml: MJML });
  assert.equal('html' in (await plain.load(bare.id)), false);
});

test('HTTP storage: tags only when asked for, on their routes', async () => {
  assert.equal(createHttpStorage().listTags, undefined);
  assert.equal(createHttpStorage().setTemplateTags, undefined);
  const seen = [];
  const fetch = async (url, init = {}) => {
    seen.push([url, init.method || 'GET', init.body]);
    return new Response(JSON.stringify({ data: init.method === 'DELETE' ? { id: '3' } : [] }), { status: 200 });
  };
  const storage = createHttpStorage({ tags: true, fetch });
  await storage.listTags();
  await storage.saveTag({ label: 'VIP', color: 'red' }, { create: true });
  await storage.saveTag({ id: '3', label: 'VIP', color: 'blue' });
  await storage.deleteTag('3');
  await storage.setTemplateTags(12, ['3']);
  assert.deepEqual(seen, [
    ['/api/email-builder/tags', 'GET', undefined],
    ['/api/email-builder/tags', 'POST', JSON.stringify({ label: 'VIP', color: 'red' })],
    ['/api/email-builder/tags/3', 'PUT', JSON.stringify({ id: '3', label: 'VIP', color: 'blue' })],
    ['/api/email-builder/tags/3', 'DELETE', undefined],
    ['/api/email-builder/templates/12/tags', 'PUT', JSON.stringify({ tags: ['3'] })],
  ]);
});

const ORIGIN = 'https://app.example.com';

function setup(overrides = {}) {
  const tagStore = createMemoryTagRepository();
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    tagStore,
    authorize: () => ({ id: 7, name: 'ada' }),
    publicUrl: ORIGIN,
    ...overrides,
  });
  const call = async (method, path, body) => {
    const response = await handler(
      new Request(`${ORIGIN}/api/email-builder${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
    );
    return { status: response.status, body: await response.json() };
  };
  return { call, tagStore };
}

test('server: tag routes, the template’s tags on its list and its page, copies and deletes', async () => {
  const { call, tagStore } = setup();
  const vip = (await call('POST', '/tags', { label: 'VIP', color: 'amber' })).body.data;
  assert.deepEqual(vip, { id: '1', label: 'VIP', color: 'amber' });
  const events = await call('POST', '/tags', { label: 'Events', color: 'violet' });
  assert.equal(events.status, 201);
  const duplicate = await call('POST', '/tags', { label: 'vip', color: 'red' });
  assert.equal(duplicate.status, 400);
  assert.equal(duplicate.body.code, 'INVALID_TAG');
  assert.deepEqual(duplicate.body.issues, { label: 'A tag with this name already exists' });
  assert.deepEqual((await call('GET', '/tags')).body.data.map((tag) => tag.label), ['Events', 'VIP']);

  const { template } = (await call('POST', '/templates', { name: 'Sale', subject: 'Hi', document: DOC, mjml: MJML })).body.data;
  assert.deepEqual((await call('GET', '/templates')).body.data[0].tags, []);
  const set = await call('PUT', `/templates/${template.id}/tags`, { tags: ['1', '2'] });
  assert.deepEqual(set.body.data, ['2', '1']);
  assert.deepEqual((await call('GET', `/templates/${template.id}`)).body.data.tags, ['2', '1']);
  assert.equal((await call('PUT', `/templates/${template.id}/tags`, { tags: ['9'] })).body.code, 'UNKNOWN_TAG');
  assert.equal((await call('PUT', `/templates/${template.id}/tags`, { tags: 'VIP' })).body.code, 'INVALID_TAGS');
  assert.equal((await call('PUT', '/templates/999/tags', { tags: [] })).status, 404);

  const renamed = await call('PUT', '/tags/1', { label: 'Customers' });
  assert.deepEqual(renamed.body.data, { id: '1', label: 'Customers', color: 'amber' });
  assert.equal((await call('PUT', '/tags/99', { label: 'X' })).status, 404);

  const copy = (await call('POST', '/templates', { duplicateOf: template.id })).body.data.template;
  assert.deepEqual(copy.tags, ['1', '2']);
  assert.deepEqual((await call('DELETE', '/tags/2')).body.data, { id: '2' });
  assert.equal((await call('DELETE', '/tags/2')).status, 404);
  const list = (await call('GET', '/templates')).body.data;
  assert.deepEqual(list.map((t) => t.tags), [['1'], ['1']]);

  // A deleted template takes its links with it.
  await call('DELETE', `/templates/${copy.id}`);
  assert.deepEqual(await tagStore.listLinks(), [{ templateId: String(template.id), tagId: '1' }]);
});

test('server without a tag store: no tags on templates, the list is empty, writes are 501', async () => {
  const { call } = setup({ tagStore: null });
  const { template } = (await call('POST', '/templates', { name: 'Sale', document: DOC, mjml: MJML })).body.data;
  assert.equal('tags' in (await call('GET', '/templates')).body.data[0], false);
  assert.deepEqual((await call('GET', '/tags')).body.data, []);
  const create = await call('POST', '/tags', { label: 'VIP', color: 'red' });
  assert.equal(create.status, 501);
  assert.equal(create.body.code, 'NO_TAG_STORE');
  assert.equal((await call('PUT', `/templates/${template.id}/tags`, { tags: [] })).status, 501);
  assert.equal((await call('POST', '/templates', { duplicateOf: template.id })).status, 201);
});
