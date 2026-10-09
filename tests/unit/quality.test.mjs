/** QUALITY checks shown in the preview. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualityReport, GMAIL_CLIP_BYTES } from '../../src/validation/quality.js';
import { STARTER_MJML } from '../../src/features/templates/starter.js';
import { translatorFor } from '../../src/i18n/index.js';

const FLAWED =
  '<mjml><mj-body><mj-image></mj-image><mj-image src="https://x.com/a.png" alt="A"></mj-image>' +
  '<mj-image src="https://x.com/b.png"></mj-image><mj-button>Go</mj-button>' +
  '<mj-text><a href="http://x.com">x</a></mj-text></mj-body></mjml>';

test('the starter template has nothing to fix', () => {
  assert.deepEqual(qualityReport({ mjml: STARTER_MJML, html: '<html></html>', subject: 'Subject' }), []);
});

test('every check is detected', () => {
  const codes = qualityReport({ mjml: FLAWED, html: 'x'.repeat(GMAIL_CLIP_BYTES + 10), subject: ' ' }).map((i) => i.code);
  for (const code of ['NO_UNSUBSCRIBE', 'IMAGE_NO_SRC', 'IMAGE_NO_ALT', 'BUTTON_NO_LINK', 'HTTP_LINK', 'NO_SUBJECT', 'GMAIL_CLIP']) {
    assert.ok(codes.includes(code), code);
  }
});

test('messages follow the translator', () => {
  const en = qualityReport({ mjml: FLAWED, html: '', subject: '' });
  const fr = qualityReport({ mjml: FLAWED, html: '', subject: '' }, { t: translatorFor('fr') });
  assert.equal(en.length, fr.length);
  assert.notDeepEqual(en.map((i) => i.message), fr.map((i) => i.message));
});
