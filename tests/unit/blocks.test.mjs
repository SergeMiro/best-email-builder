/**
 * BLOCKS — every block of the registry is complete, accepted by the server
 * validator and compiles without MJML warning; attribute helpers keep the
 * canvas and the sent email identical.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailBlocks } from '../../src/blocks/index.js';
import { validateMjml } from '../../src/validation/mjmlValidator.js';
import { resolveBlock } from '../../src/core/EmailEditor.js';
import { translatorFor } from '../../src/i18n/index.js';
import { compileMjml, opaqueBgcolors } from '../../src/server/compileMjml.js';
import { parseSpacing, formatSpacing, parseBorder, formatBorder, toAttributes, toValues, cleanAttributeValue } from '../../src/core/mjmlAttributes.js';
import { STARTER_MJML, createStarterMjml } from '../../src/features/templates/starter.js';

const PROPERTY_TYPES = new Set(['text', 'textarea', 'color', 'size', 'select', 'align', 'url', 'image', 'spacing', 'border']);
const KINDS = new Set(['content', 'layout', 'structure']);
const BOX_ROLES = new Set(['margin', 'border', 'padding']);
const doc = (inner) => `<mjml><mj-body>${inner}</mj-body></mjml>`;

test('attributes: longhand paddings, safe values', () => {
  assert.deepEqual(parseSpacing('10px'), ['10px', '10px', '10px', '10px']);
  assert.deepEqual(parseSpacing('10px 25px'), ['10px', '25px', '10px', '25px']);
  assert.deepEqual(parseSpacing('1px 2px 3px'), ['1px', '2px', '3px', '2px']);
  assert.equal(formatSpacing(['10px', '25px', '10px', '25px']), '10px 25px');
  assert.equal(formatSpacing(['4px', '4px', '4px', '4px']), '4px');
  const attrs = toAttributes({ padding: '12px 18px', color: '#123456', href: '' });
  assert.equal(attrs['padding-top'], '12px');
  assert.equal(attrs['padding-right'], '18px');
  assert.equal(attrs['padding-bottom'], '12px');
  assert.equal(attrs['padding-left'], '18px');
  assert.equal(attrs.padding, null, 'shorthand removed');
  assert.equal(attrs.href, null, 'empty value → attribute removed');
  assert.equal(attrs.color, '#123456');
  const cleared = toAttributes({ padding: '' });
  assert.equal(cleared['padding-top'], null);
  assert.equal(cleared.padding, null);
  assert.equal(toAttributes({ 'inner-padding': '12px 30px' })['inner-padding'], '12px 30px');
  assert.equal(cleanAttributeValue('https://x.com/?a="b"<c>\n'), 'https://x.com/?a=bc');
  const values = toValues(
    { 'padding-top': '10px', 'padding-right': '25px', 'padding-bottom': '10px', 'padding-left': '25px', color: '#fff' },
    [{ key: 'padding' }, { key: 'color' }, { key: 'align' }]
  );
  assert.deepEqual(values, { padding: '10px 25px', color: '#fff', align: '' });
  assert.equal(
    toValues({ padding: '8px 4px', 'padding-top': '20px' }, [{ key: 'padding' }]).padding,
    '20px 4px 8px',
    'longhand wins over shorthand (like MJML)'
  );
});

test('attributes: a border is one value, written per side only when the widths differ', () => {
  assert.deepEqual(parseBorder('2px dashed #ff0000'), { widths: [2, 2, 2, 2], style: 'dashed', color: '#ff0000' });
  assert.deepEqual(parseBorder('1px 4px double rgba(0, 0, 0, 0.5)'), { widths: [1, 4, 1, 4], style: 'double', color: 'rgba(0, 0, 0, 0.5)' });
  assert.deepEqual(parseBorder('dotted'), { widths: [3, 3, 3, 3], style: 'dotted', color: '' }, 'CSS default width');
  assert.deepEqual(parseBorder('thin solid red').widths, [1, 1, 1, 1]);
  assert.equal(parseBorder('99px solid red').widths[0], 20, 'width clamped');
  for (const none of ['', 'none', '0px solid red', '2px red', '1px hidden']) assert.equal(parseBorder(none), null, none);
  assert.equal(formatBorder({ widths: [2, 2, 2, 2], style: 'solid', color: '#000' }), '2px solid #000');
  assert.equal(formatBorder({ widths: [0, 3, 0, 3], style: 'ridge', color: '' }), '0px 3px ridge');
  assert.equal(formatBorder({ widths: [0, 0, 0, 0], style: 'solid', color: '#000' }), '');

  const even = toAttributes({ border: '2px dashed #f00' });
  assert.equal(even.border, '2px dashed #f00');
  for (const side of ['top', 'right', 'bottom', 'left']) assert.equal(even[`border-${side}`], null, 'sides cleared');
  const sides = toAttributes({ border: '1px 0px 3px double #f00' });
  assert.equal(sides.border, null);
  assert.equal(sides['border-top'], '1px double #f00');
  assert.equal(sides['border-right'], null, 'a 0 side has no line');
  assert.equal(sides['border-bottom'], '3px double #f00');
  assert.equal(sides['border-left'], null);
  const removed = toAttributes({ border: '' });
  assert.equal(removed.border, null);
  assert.equal(removed['border-top'], null);

  assert.equal(toValues(sides, [{ key: 'border' }]).border, '1px 0px 3px double #f00', 'round trip');
  assert.equal(toValues({ border: '2px solid #000', 'border-left': 'none' }, [{ key: 'border' }]).border, '2px 2px 2px 0px solid #000', 'a side wins over the border');
  assert.equal(toValues({ 'border-bottom': '4px dotted #00f' }, [{ key: 'border' }]).border, '0px 0px 4px dotted #00f', 'one side alone');
  assert.equal(toValues({}, [{ key: 'border' }]).border, '');
});

test('borders render in the email: same widths, or per side', async () => {
  const sides = Object.entries(toAttributes({ border: '1px 0px 3px double #ff0000' }))
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  const mjml = doc(`<mj-section border="2px dashed #ff0000"><mj-column ${sides}>
    <mj-image src="https://example.com/a.png" border="4px ridge #00ff00"></mj-image>
    <mj-button href="https://example.com" border="2px dotted #0000ff">Go</mj-button>
  </mj-column></mj-section>`);
  const { ok, issues } = validateMjml(mjml);
  assert.ok(ok, JSON.stringify(issues));
  const { html, warnings } = await compileMjml(mjml);
  assert.deepEqual(warnings, []);
  for (const css of ['border:2px dashed #ff0000', 'border-top:1px double #ff0000', 'border-bottom:3px double #ff0000', 'border:4px ridge #00ff00', 'border:2px dotted #0000ff']) {
    assert.ok(html.replace(/;\s+/g, ';').includes(css), css);
  }
});

test('registry: unique ids, structures present', () => {
  const all = emailBlocks.list();
  assert.ok(all.length > 0);
  assert.equal(new Set(all.map((b) => b.id)).size, all.length);
  for (const id of ['body', 'section', 'column']) assert.equal(emailBlocks.get(id)?.kind, 'structure', id);
});

for (const block of emailBlocks.list()) {
  test(`block "${block.id}"`, async () => {
    assert.ok(KINDS.has(block.kind) && /^mj-/.test(block.tagName) && block.label && block.icon, 'complete identity');
    const keys = block.properties.map((p) => p.key);
    assert.equal(new Set(keys).size, keys.length, 'unique properties');
    for (const property of block.properties) {
      assert.ok(PROPERTY_TYPES.has(property.type), `${property.key}: known type`);
      assert.ok(property.label && property.group, `${property.key}: label and group`);
      if (['select', 'align'].includes(property.type)) assert.ok((property.options || []).length > 1, `${property.key}: options`);
    }
    // The box diagram: one property per zone, a border only where MJML draws one.
    const boxes = block.properties.filter((p) => p.box);
    assert.equal(new Set(boxes.map((p) => p.box)).size, boxes.length, 'one property per zone');
    for (const property of boxes) {
      assert.ok(BOX_ROLES.has(property.box), `${property.key}: known zone`);
      assert.equal(property.type === 'border', property.box === 'border', `${property.key}: the border zone is the border`);
    }
    if (block.kind === 'structure') {
      assert.ok(!block.mjml, 'a structure cannot be inserted');
      return;
    }
    const { mjml, sectionMjml } = resolveBlock(block);
    assert.ok(typeof mjml === 'string' && mjml.length > 0);
    assert.ok(mjml.startsWith(`<${block.tagName}`));
    if (block.kind === 'layout') assert.equal(block.tagName, 'mj-section', 'a layout is a section of the body');
    if (block.kind === 'content') {
      assert.ok(sectionMjml?.startsWith('<mj-section') && sectionMjml.includes(mjml), 'section wrapper');
    }
    // The texts a block brings come in the interface's language.
    const french = resolveBlock(block, translatorFor('fr'));
    for (const english of ['Your text.', 'Your headline', 'Learn more', 'Title', 'Shop', 'Your big announcement']) {
      assert.ok(!french.mjml.includes(`>${english}<`), `"${english}" translated in French`);
    }
    const wrapped = block.kind === 'layout' ? mjml : sectionMjml;
    const { ok, issues } = validateMjml(doc(wrapped));
    assert.ok(ok, issues.map((i) => i.message).join('; '));
    const { html, warnings } = await compileMjml(doc(wrapped));
    assert.ok(html.includes('<!doctype html>'));
    assert.deepEqual(warnings, []);
    if (['mj-text', 'mj-button'].includes(block.tagName)) {
      for (const attr of ['font-family=', 'font-size=', 'color=']) assert.ok(mjml.includes(attr), `explicit ${attr}`);
      assert.ok(!html.includes('Ubuntu'), "MJML's default font does not appear");
    }
  });
}

test('starter template', async () => {
  const { ok, issues } = validateMjml(STARTER_MJML);
  assert.ok(ok, issues.map((i) => i.message).join('; '));
  const { html, warnings } = await compileMjml(STARTER_MJML);
  assert.deepEqual(warnings, []);
  assert.ok(html.includes('{{ unsubscribe }}'), 'unsubscribe link');
  assert.ok(!/\spadding="/.test(STARTER_MJML), 'no shorthand padding (canvas = email)');
  const withSender = createStarterMjml({ sender: { name: 'ACME', address: '1 Main Street', logoUrl: 'https://example.com/logo.png' } });
  assert.ok(validateMjml(withSender).ok);
  assert.ok(withSender.includes('1 Main Street'), 'sender address (CAN-SPAM, GDPR)');
  assert.ok(withSender.includes('<mj-image src="https://example.com/logo.png"'));
});

test('template gallery: every template validates, compiles cleanly and carries the legal footer', async () => {
  const { TEMPLATE_GALLERY, buildGallery, withThumbnailImages, withPlaceholderImages } = await import(
    '../../src/features/templates/gallery.js'
  );
  const gallery = buildGallery({ sender: { name: 'ACME', address: '1 Main Street' } });
  assert.equal(new Set(gallery.map((g) => g.id)).size, TEMPLATE_GALLERY.length, 'unique ids');
  for (const entry of gallery) {
    assert.ok(entry.name && entry.description, `${entry.id}: name and description`);
    const { ok, issues } = validateMjml(entry.mjml);
    assert.ok(ok, `${entry.id}: ${issues.map((i) => i.message).join('; ')}`);
    const { html, warnings } = await compileMjml(entry.mjml);
    assert.deepEqual(warnings, [], `${entry.id}: no MJML warning`);
    const images = withPlaceholderImages(html).match(/<img\b[^>]*>/g) || [];
    assert.ok(images.every((img) => /\ssrc="/.test(img)), `${entry.id}: every image of the preview has a source`);
    assert.ok(!/\spadding="/.test(entry.mjml), `${entry.id}: no shorthand padding (canvas = email)`);
    assert.ok(!/(<mj-[a-z-]+)[^>]*\s(padding-top)="[^"]*"[^>]*\s\2="/.test(entry.mjml), `${entry.id}: no duplicate attribute`);
    if (entry.id !== 'blank') {
      assert.ok(entry.mjml.includes('{{ unsubscribe }}') && entry.mjml.includes('1 Main Street'), `${entry.id}: legal footer`);
    }
    assert.ok(!entry.mjml.includes('data:image'), `${entry.id}: no inline image saved`);
    if (entry.mjml.includes('<mj-image')) assert.ok(withThumbnailImages(entry.mjml).includes('data:image/svg+xml'), 'thumbnail frame');
  }
  const fr = buildGallery({ t: (key) => ({ Newsletter: 'Lettre', News: 'Actualités' })[key] ?? key });
  assert.equal(fr.find((g) => g.id === 'newsletter').name, 'Lettre', 'names translated');
  // Tags are the gallery's filters, translated too; an entry without any has none.
  assert.ok(gallery.every((entry) => entry.tags.length > 0), 'every base has a tag');
  assert.deepEqual(fr.find((g) => g.id === 'newsletter').tags, ['Marketing', 'Actualités']);
  assert.deepEqual(buildGallery({ templates: [{ id: 'x', name: 'X', description: '', create: () => '' }] })[0].tags, []);
});

test('a color with transparency: rgba() for the clients, an opaque bgcolor for classic Outlook', async () => {
  assert.equal(opaqueBgcolors('<td bgcolor="rgba(0, 0, 0, 0.5)" style="background:rgba(0, 0, 0, 0.5)">'), '<td bgcolor="#808080" style="background:rgba(0, 0, 0, 0.5)">');
  assert.equal(opaqueBgcolors('<td bgcolor="#ffffff">'), '<td bgcolor="#ffffff">');
  const { html, warnings } = await compileMjml(
    '<mjml><mj-body><mj-section background-color="rgba(255, 0, 0, 0.25)"><mj-column><mj-text color="rgba(0, 0, 255, 0.5)">Hi</mj-text></mj-column></mj-section></mj-body></mjml>'
  );
  assert.deepEqual(warnings, []);
  assert.ok(html.includes('bgcolor="#ffbfbf"'), 'bgcolor flattened over white');
  assert.ok(!/bgcolor="rgba/.test(html));
  assert.ok(html.includes('background-color:rgba(255, 0, 0, 0.25)') || html.includes('background:rgba(255, 0, 0, 0.25)'), 'CSS keeps the transparency');
  assert.ok(html.includes('color:rgba(0, 0, 255, 0.5)'));
});
