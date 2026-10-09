/**
 * STORAGE (memory implementation of the browser contract), URL / MJML /
 * project VALIDATION, and server-side PREPARATION and COMPILATION.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStorage, StorageError } from '../../src/storage/client.js';
import { createDocument } from '../../src/core/document.js';
import { validateMjml, assertValidMjml } from '../../src/validation/mjmlValidator.js';
import { validateProject } from '../../src/validation/projectValidator.js';
import { isSafeUrl } from '../../src/validation/urls.js';
import { prepareMjml } from '../../src/renderer/prepareMjml.js';
import { compileMjml } from '../../src/server/compileMjml.js';
import { translatorFor } from '../../src/i18n/index.js';

const MJML =
  '<mjml><mj-body background-color="#eceff4"><mj-section background-color="#ffffff"><mj-column>' +
  '<mj-text font-family="Arial, Helvetica, sans-serif" color="#2b3038">Hello <b>{{contact.firstname}}</b></mj-text>' +
  '<mj-image src="https://example.com/logo.png" alt="Logo"></mj-image>' +
  '<mj-button href="https://example.com/contact" background-color="#212e5a">Write to us</mj-button>' +
  '<mj-divider border-color="#dfe6f0"></mj-divider><mj-spacer height="24px"></mj-spacer>' +
  '<mj-text><a href="{{ unsubscribe }}">Unsubscribe</a></mj-text></mj-column></mj-section></mj-body></mjml>';

function project(extra = {}) {
  return {
    pages: [
      {
        frames: [
          {
            component: {
              type: 'wrapper',
              components: [
                {
                  type: 'mjml',
                  components: [
                    {
                      type: 'mj-body',
                      components: [{ type: 'mj-text', components: [{ type: 'textnode', content: 'Hello' }] }],
                      ...extra,
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
const doc = createDocument({ engine: 'grapesjs-mjml', engineVersion: '0.22.16', project: project() });

test('memory storage: create → save → reload, versions, conflicts, duplicate', async () => {
  const storage = createMemoryStorage();
  const { template } = await storage.create({ name: 'October letter', document: doc, mjml: MJML, subject: 'Subject' });
  assert.equal(template.id, 1);
  assert.ok(template.revision);

  const loaded = await storage.load(template.id);
  assert.deepEqual(loaded.document, doc, 'document re-read byte for byte');
  assert.equal(loaded.mjml, MJML);

  const doc2 = createDocument({
    engine: 'grapesjs-mjml',
    engineVersion: '0.22.16',
    project: project({ attributes: { 'background-color': '#ffffff' } }),
  });
  const saved = await storage.save(template.id, { document: doc2, mjml: MJML, revision: loaded.revision, createVersion: true });
  assert.equal(saved.version?.versionNumber, 2);
  assert.notEqual(saved.template.revision, loaded.revision);

  const auto = await storage.save(template.id, { document: doc2, mjml: MJML, revision: saved.template.revision });
  assert.equal(auto.version, null, 'autosave creates no version');

  await assert.rejects(
    storage.save(template.id, { document: doc, mjml: MJML, revision: loaded.revision }),
    (error) => error instanceof StorageError && error.status === 409 && /changed in the meantime/.test(error.message)
  );

  const versions = await storage.listVersions(template.id);
  assert.deepEqual(versions.map((v) => v.versionNumber), [2, 1]);
  const v1 = await storage.getVersion(template.id, versions[1].id);
  assert.deepEqual(v1.document, doc);

  const copy = await storage.duplicate(template.id);
  assert.equal(copy.template.name, 'October letter (copy)');
  await assert.rejects(storage.load(99), /not found/);
  await assert.rejects(storage.create({ name: ' ', document: doc, mjml: MJML }), /Name required/);
});

test('URLs: safe links and images', () => {
  const cases = [
    ['https://www.example.com', 'link', true],
    ['http://example.com', 'link', true],
    ['mailto:contact@example.com', 'link', true],
    ['tel:+15550000000', 'link', true],
    ['#top', 'link', true],
    ['{{ unsubscribe }}', 'link', true],
    ['{{contact.email}}', 'link', true],
    ['javascript:alert(1)', 'link', false],
    ['  JaVaScRiPt:alert(1)', 'link', false],
    ['java\tscript:alert(1)', 'link', false],
    ['&#106;avascript:alert(1)', 'link', false],
    ['&#x6A;avascript&colon;alert(1)', 'link', false],
    ['data:text/html;base64,AAAA', 'link', false],
    ['vbscript:x', 'link', false],
    ['https://cdn.example.com/a.png', 'image', true],
    ['/email-assets/0123456789abcdef0123456789abcdef.png', 'image', true],
    ['/email-assets/../0123456789abcdef0123456789abcdef.png', 'image', false],
    ['/images/logo.png', 'image', false],
    ['http://cdn.example.com/a.png', 'image', false],
    ['data:image/png;base64,AAAA', 'image', false],
  ];
  for (const [value, kind, expected] of cases) {
    assert.equal(isSafeUrl(value, kind), expected, `${kind} "${value}"`);
  }
});

test('MJML validation: allow-list', () => {
  assert.ok(validateMjml(MJML).ok);
  const refused = [
    ['<mjml><mj-body><mj-include path="/etc/passwd" /></mj-body></mjml>', 'FORBIDDEN_TAG'],
    ['<mjml><mj-body><mj-raw><p>x</p></mj-raw></mj-body></mjml>', 'FORBIDDEN_TAG'],
    ['<mjml><mj-body><mj-text><script>alert(1)</script></mj-text></mj-body></mjml>', 'FORBIDDEN_TAG'],
    ['<mjml><mj-body><mj-text><img src="https://x.com/a.png" onerror="alert(1)"></mj-text></mj-body></mjml>', 'EVENT_ATTRIBUTE'],
    ['<mjml><mj-body><mj-button href="javascript:alert(1)">x</mj-button></mj-body></mjml>', 'UNSAFE_URL'],
    ['<mjml><mj-body><mj-text><a href="&#106;avascript:alert(1)">x</a></mj-text></mj-body></mjml>', 'UNSAFE_URL'],
    ['<mjml><mj-body><mj-image src="http://x.com/a.png"></mj-image></mj-body></mjml>', 'UNSAFE_IMAGE'],
    ['<mjml><mj-body><mj-text><span style="background:url(javascript:x)">x</span></mj-text></mj-body></mjml>', 'UNSAFE_STYLE'],
    ['<mjml><mj-body><mj-text><iframe src="https://x.com"></iframe></mj-text></mj-body></mjml>', 'FORBIDDEN_TAG'],
    ['<mjml><mj-body><mj-text><marquee>x</marquee></mj-text></mj-body></mjml>', 'UNKNOWN_TAG'],
    ['<mjml><mj-body><!--[if mso]><p>x</p><![endif]--></mj-body></mjml>', 'CONDITIONAL_COMMENT'],
    ['<html><body></body></html>', 'ROOT'],
    ['', 'EMPTY'],
  ];
  for (const [source, code] of refused) {
    const { ok, issues } = validateMjml(source);
    assert.ok(!ok && issues.some((i) => i.code === code), `${code}: ${source.slice(0, 60)}`);
  }
  assert.throws(
    () => assertValidMjml('<mjml><mj-body><mj-raw></mj-raw></mj-body></mjml>'),
    (error) => error.status === 422 && /Template rejected/.test(error.message)
  );
  const fr = translatorFor('fr');
  assert.throws(
    () => assertValidMjml('<mjml><mj-body><mj-raw></mj-raw></mj-body></mjml>', { t: fr }),
    (error) => error.message.startsWith(fr('Template rejected: {issues}', { issues: '' }).trim().slice(0, 10))
  );
  const big = `<mjml><mj-body><mj-text>${'x'.repeat(600 * 1024)}</mj-text></mj-body></mjml>`;
  assert.ok(validateMjml(big).issues.some((i) => i.code === 'TOO_LARGE'));
});

test('project validation', () => {
  assert.ok(validateProject(doc).ok);
  // A text link is, for the engine, a component of TYPE "link" (tag <a>).
  const withLink = createDocument({
    engine: 'grapesjs-mjml',
    engineVersion: '0.22.16',
    project: project({ components: [{ type: 'link', tagName: 'a', attributes: { href: '{{ unsubscribe }}' } }] }),
  });
  assert.ok(validateProject(withLink).ok);
  assert.ok(validateProject(JSON.stringify(doc)).ok);
  const tampered = [
    [{ type: 'script', content: 'alert(1)' }, 'FORBIDDEN_TAG'],
    [{ type: 'default', tagName: 'iframe' }, 'FORBIDDEN_TAG'],
    [{ type: 'default', tagName: 'link', attributes: { rel: 'stylesheet' } }, 'FORBIDDEN_TAG'],
    [{ type: 'mj-text', attributes: { onclick: 'alert(1)' } }, 'EVENT_ATTRIBUTE'],
    [{ type: 'mj-button', attributes: { href: 'javascript:alert(1)' } }, 'UNSAFE_URL'],
    [{ type: 'mj-image', attributes: { src: 'data:image/png;base64,AA' } }, 'UNSAFE_IMAGE'],
    [{ type: 'default', script: 'function(){}' }, 'SCRIPT'],
    [{ type: 'textnode', content: '<script>alert(1)</script>' }, 'UNSAFE_CONTENT'],
  ];
  for (const [node, code] of tampered) {
    const bad = createDocument({ engine: 'grapesjs-mjml', engineVersion: '0.22.16', project: project({ components: [node] }) });
    const { ok, issues } = validateProject(bad);
    assert.ok(!ok && issues.some((i) => i.code === code), code);
  }
  assert.equal(validateProject('{').ok, false);
});

test('preparation and server compilation', () => {
  const prepared = prepareMjml(MJML, { title: 'Subject <test>', preheader: 'Preview & more' });
  assert.ok(
    prepared.startsWith(
      '<mjml lang="en"><mj-head><mj-title>Subject &lt;test&gt;</mj-title><mj-preview>Preview &amp; more</mj-preview></mj-head>'
    )
  );
  const twice = prepareMjml(prepared, { title: 'New', preheader: null });
  assert.equal((twice.match(/<mj-title>/g) || []).length, 1);
  assert.ok(!twice.includes('<mj-preview>'));
  assert.ok(prepareMjml('<mjml lang="fr"><mj-body></mj-body></mjml>').startsWith('<mjml lang="fr">'));
  assert.ok(prepareMjml('<mjml><mj-body></mj-body></mjml>', { lang: 'de' }).startsWith('<mjml lang="de">'));

  const { html, warnings } = compileMjml(prepared);
  assert.match(html, /^<!doctype html>/i);
  assert.ok(html.includes('<title>Subject &lt;test&gt;</title>'));
  assert.ok(html.includes('Preview &amp; more'));
  assert.ok(html.includes('{{contact.firstname}}') && html.includes('{{ unsubscribe }}'), 'merge tags survive compilation');
  assert.match(html, /<!--\[if mso/, 'Outlook conditional comments generated by MJML');
  assert.ok(!/fonts\.googleapis/.test(html), 'no Google font added');
  assert.deepEqual(warnings, []);

  const soft = compileMjml(
    '<mjml><mj-body><mj-section><mj-column><mj-text font-size="abc">x</mj-text></mj-column></mj-section></mj-body></mjml>'
  );
  assert.ok(soft.html.length > 0 && soft.warnings.length > 0, 'an invalid value is a warning, not a failure');
});
