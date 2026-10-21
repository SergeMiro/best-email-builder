/** Variables: catalog rules, replacement, fallbacks, unknown tags, memory storage. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VARIABLES,
  EXAMPLE_VARIABLES,
  defineVariables,
  keyFromLabel,
  mergeVariables,
  tokenOf,
  validateCustomVariable,
} from '../../src/features/variables/catalog.js';
import {
  applyVariables,
  applyVariablesToText,
  mapVariables,
  sampleValues,
  unknownVariables,
  usedVariables,
} from '../../src/features/variables/service.js';
import { STARTER_MJML } from '../../src/features/templates/starter.js';
import { createMemoryStorage } from '../../src/storage/client.js';

const CUSTOM = { key: 'order.number', label: 'Order number', group: 'Orders', sample: 'CMD-1', fallback: 'your order', custom: true };
/** An application's system variables: the ready-made set, then the default ones. */
const SYSTEM = [...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES];
const CATALOG = mergeVariables(SYSTEM, [CUSTOM]);

test('catalog: none by default but the unsubscribe link; unique keys, tags', () => {
  assert.deepEqual(DEFAULT_VARIABLES.map((v) => v.key), ['unsubscribe']);
  assert.equal(tokenOf(DEFAULT_VARIABLES[0]), '{{ unsubscribe }}');
  assert.equal(new Set(SYSTEM.map((v) => v.key)).size, SYSTEM.length);
  assert.equal(tokenOf(EXAMPLE_VARIABLES[0]), '{{contact.firstname}}');
  assert.throws(() => defineVariables([{ key: 'a' }, { key: 'a' }]), /duplicate/);
  assert.throws(() => defineVariables([{ key: 'A B' }]), /invalid key/);
  // The capitals of an email provider's tags (Brevo), in system variables only.
  assert.doesNotThrow(() => defineVariables([{ key: 'contact.FIRSTNAME' }]));
  assert.ok(validateCustomVariable({ key: 'contact.FIRSTNAME', label: 'First name' }).errors.key);
});

test('keys proposed from labels', () => {
  assert.equal(keyFromLabel('Numéro de commande'), 'numero_de_commande');
  assert.equal(keyFromLabel('  2nd Order #'), 'nd_order');
  assert.equal(keyFromLabel('!!!'), 'variable');
});

test('custom variables are validated', () => {
  const ok = validateCustomVariable({ label: ' Order  number ', key: 'order.number' });
  assert.equal(ok.variable.label, 'Order number');
  assert.equal(ok.variable.group, 'Custom');
  assert.ok(validateCustomVariable({ label: '', key: 'x' }).errors.label);
  assert.ok(validateCustomVariable({ label: 'X', key: 'Bad key' }).errors.key);
  assert.ok(validateCustomVariable({ label: 'X', key: 'unsubscribe' }).errors.key);
  assert.ok(validateCustomVariable({ label: 'X', key: 'contact.email' }, { existing: SYSTEM }).errors.key);
  // Editing keeps the key, whatever is sent.
  assert.equal(validateCustomVariable({ label: 'Y', key: 'hack' }, { editing: 'order.number' }).variable.key, 'order.number');
  // A custom variable never replaces a system one.
  const merged = mergeVariables(SYSTEM, [{ ...CUSTOM, key: 'contact.firstname', label: 'Fake' }]);
  assert.equal(merged.find((v) => v.key === 'contact.firstname').label, 'First name');
});

test('replacement: escaped values, inline and defined fallbacks, never a raw tag', () => {
  const html =
    '<p>Hello {{ contact.firstname | dear customer }} of {{company.name}}, order {{order.number}}. {{contact.EMAIL}} {{ mirror }}</p>';
  const out = applyVariables(html, { 'contact.firstname': '<b>Jo</b>' }, CATALOG);
  assert.equal(out, '<p>Hello &lt;b&gt;Jo&lt;/b&gt; of , order your order. {{contact.EMAIL}} {{ mirror }}</p>');
  const fallbacks = applyVariables(html, {}, CATALOG);
  assert.ok(fallbacks.startsWith('<p>Hello dear customer of , order your order.'));
  assert.equal(applyVariablesToText('{{contact.firstname|there}}, <your> order', {}, CATALOG), 'there, <your> order');
  assert.equal(applyVariablesToText('{{order.number}}', { 'order.number': 'A&B' }, CATALOG), 'A&B');
});

test('provider merge tags, used and unknown tags, samples', () => {
  assert.equal(
    mapVariables('{{contact.firstname}} {{campaign.name}}', { 'contact.firstname': '{{ contact.FIRSTNAME }}' }, CATALOG),
    '{{ contact.FIRSTNAME }} {{campaign.name}}'
  );
  // The starter holds no variable: only the unsubscribe link.
  assert.deepEqual(usedVariables(STARTER_MJML), ['unsubscribe']);
  assert.deepEqual(unknownVariables(STARTER_MJML), []);
  assert.deepEqual(unknownVariables('{{contact.fistname}} {{ unsubscribe }} {{order.number|x}} {{other}}', CATALOG), [
    'contact.fistname',
    'other',
  ]);
  const samples = sampleValues(CATALOG, { 'contact.email': 'reviewer@example.com', 'contact.firstname': '' });
  assert.equal(samples['contact.email'], 'reviewer@example.com');
  assert.equal(samples['contact.firstname'], 'Jane');
  assert.equal(samples['order.number'], 'CMD-1');
});

test('memory storage keeps custom variables', async () => {
  // No system variable by default: any key but the reserved ones can be created.
  const empty = createMemoryStorage();
  await empty.saveVariable({ label: 'Email', key: 'contact.email' }, { create: true });
  await assert.rejects(empty.saveVariable({ label: 'X', key: 'unsubscribe' }, { create: true }), (e) => e.status === 400);

  const storage = createMemoryStorage({ systemVariables: SYSTEM });
  await storage.saveVariable({ label: 'Order number', key: 'order.number' }, { create: true });
  await assert.rejects(storage.saveVariable({ label: 'X', key: 'contact.email' }, { create: true }), (e) => e.status === 400);
  await storage.saveVariable({ key: 'order.number', label: 'Order no.', sample: '42' });
  assert.deepEqual(
    (await storage.listVariables()).map((v) => [v.key, v.label, v.sample]),
    [['order.number', 'Order no.', '42']]
  );
  await storage.deleteVariable('order.number');
  assert.deepEqual(await storage.listVariables(), []);
});
