/**
 * PHONE STYLES — an element's `mobile-*` values reach the sent email as
 * styles under the breakpoint, every style property of every block, and only
 * there: the computer's look does not move.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileMjml } from '../../src/server/compileMjml.js';
import { emailBlocks } from '../../src/blocks/index.js';
import { parseMjml, serializeMjml } from '../../src/engine/mjml.js';
import { walk } from '../../src/engine/model.js';
import { MJML_DEFAULTS } from '../../src/core/mjmlDefaults.js';
import { compileEditorMjml } from '../../src/renderer/compileEditorMjml.js';
import { MOBILE_MISMATCH } from '../../src/renderer/mobileStyles.js';
import { mobileAllowed, mobileOverrides, toAttributes, toMobileAttributes, toValues, withMobile } from '../../src/core/mjmlAttributes.js';

const propertiesOf = (tag) => emailBlocks.list().filter((block) => block.tagName === tag && !block.insertOnly).flatMap((block) => block.properties || []);

const STYLE_TYPES = new Set(['color', 'size', 'select', 'align', 'spacing', 'border']);

/** A value the element does not have yet. */
function another(property, current) {
  switch (property.type) {
    case 'color': return current === '#123456' ? '#654321' : '#123456';
    case 'size': return `${(property.min ?? 10) + 7}px`;
    case 'align': return current === 'right' ? 'left' : 'right';
    case 'spacing': return '7px 9px 11px 13px';
    case 'border': return '3px solid #123456';
    default: return property.options?.find((option) => option.value && option.value !== current)?.value ?? null;
  }
}

const EMAIL =
  '<mjml><mj-body><mj-section background-url="https://example.com/b.png"><mj-column>' +
  '<mj-text font-size="16px">Hello</mj-text>' +
  '<mj-image src="https://example.com/a.png" width="300px"></mj-image>' +
  '<mj-button href="https://example.com">Go</mj-button>' +
  '<mj-divider></mj-divider>' +
  '<mj-spacer height="20px"></mj-spacer>' +
  '<mj-social><mj-social-element name="facebook" href="https://example.com">f</mj-social-element></mj-social>' +
  '<mj-navbar><mj-navbar-link href="https://example.com">Shop</mj-navbar-link></mj-navbar>' +
  '</mj-column><mj-column><mj-text>Two</mj-text></mj-column></mj-section></mj-body></mjml>';

const RULES = /@media only screen and \(max-width:479px\)\{(\.eb-m[\s\S]*?)\}<\/style>/;
const withoutRules = (html) => html.replace(/<style type="text\/css">@media only screen and \(max-width:479px\)\{\.eb-m[\s\S]*?<\/style>/, '').replace(/ class="eb-m\d+"/g, '').replace(/(class=")eb-m\d+ /g, '$1');

test('a phone value replaces the whole attribute it belongs to; the content stays shared', () => {
  const attributes = { 'padding-top': '10px', 'padding-left': '4px', 'mobile-padding-top': '2px', 'font-size': '40px', 'mobile-font-size': '32px', href: 'https://a' };
  assert.deepEqual(withMobile(attributes), { 'padding-top': '2px', 'font-size': '32px', href: 'https://a' });
  assert.deepEqual([...mobileOverrides(attributes)], ['padding', 'font-size']);
  assert.deepEqual(toMobileAttributes({ 'font-size': '20px', href: 'https://b', 'vertical-align': 'top' }, 'mj-text'), {
    'mobile-font-size': '20px',
    href: 'https://b',
    'vertical-align': 'top',
  });
  assert.equal(mobileAllowed('mj-image', 'width'), true);
  assert.equal(mobileAllowed('mj-column', 'width'), false);
});

test('every style property of every block, set for phones only, becomes a phone style; the computer keeps its look', async () => {
  const desktop = (await compileMjml(EMAIL)).html;
  const missing = [];
  const tags = new Set();
  walk(parseMjml(EMAIL), (node) => {
    tags.add(node.tag);
  });
  for (const tag of tags) {
    for (const property of propertiesOf(tag)) {
      if (!STYLE_TYPES.has(property.type) || !mobileAllowed(tag, property.key)) continue;
      const root = parseMjml(EMAIL);
      let node = null;
      walk(root, (each) => {
        node ??= each.tag === tag ? each : null;
      });
      const value = another(property, toValues({ ...MJML_DEFAULTS[tag], ...node.attributes }, [property])[property.key]);
      if (!value) continue;
      Object.assign(node.attributes, toMobileAttributes(toAttributes({ [property.key]: value }), tag));
      for (const [key, set] of Object.entries(node.attributes)) if (set === null) delete node.attributes[key];
      const { html } = await compileMjml(serializeMjml(root));
      if (!RULES.test(html)) missing.push(`${tag} ${property.key}=${value}`);
      // A box (margin, border or padding the editor draws around an element) is
      // given to the computer too, empty: the same look, not the same markup.
      else if (property.key !== 'margin' && !property.key.startsWith('box-') && !(tag === 'mj-column' && property.key === 'padding')) assert.equal(withoutRules(html), desktop, `${tag} ${property.key}: the computer's email changed`);
    }
  }
  assert.deepEqual(missing, []);
});

test('the phone styles cannot leave their rule', async () => {
  const { html } = await compileMjml(
    '<mjml><mj-body><mj-section><mj-column><mj-text color="#000" mobile-color="red}body{background:url(https://evil.example/x)" mobile-font-size="20px">Hi</mj-text></mj-column></mj-section></mj-body></mjml>'
  );
  const rules = RULES.exec(html)?.[1] || '';
  assert.match(rules, /font-size:20px!important/);
  assert.doesNotMatch(rules, /evil|body\{/);
});

test('a phone version built differently keeps the computer\'s look, and says so', async () => {
  // A compiler whose phone version has one tag more.
  const compile = async (/** @type {string} */ mjml) => ({ html: mjml.includes('20px') ? '<div><p>Hi</p><br></div>' : '<div><p>Hi</p></div>', errors: [] });
  const result = await compileEditorMjml('<mjml><mj-body><mj-section><mj-column><mj-text mobile-font-size="20px">Hi</mj-text></mj-column></mj-section></mj-body></mjml>', compile);
  assert.equal(result.html, '<div><p>Hi</p></div>');
  assert.deepEqual(result.errors, [{ message: MOBILE_MISMATCH }]);
  const { warnings } = await compileMjml('<mjml><mj-body><mj-section><mj-column><mj-text mobile-font-size="20px">Hi</mj-text></mj-column></mj-section></mj-body></mjml>');
  assert.deepEqual(warnings, []);
});
