/**
 * THE BUILDER'S OWN ENGINE, without a browser: MJML ⇄ model, model
 * operations, block placement (click and drop, on measured boxes), the
 * canvas markers, MJML's defaults.
 *
 * The canvas itself (frame, gestures) is covered by the Playwright suites.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mjml2html from 'mjml';
import { parseMjml, parseMjmlFragment, serializeMjml, decodeAttribute, encodeAttribute } from '../../src/engine/mjml.js';
import {
  cloneWithNewIds,
  findFirst,
  fromProject,
  insertNodes,
  moveNode,
  removeNode,
  setAttributes,
  toProject,
  walk,
} from '../../src/engine/model.js';
import { dropTargetFor, placementFor } from '../../src/engine/placement.js';
import { canvasMjml } from '../../src/engine/canvasMjml.js';
import { MJML_DEFAULTS } from '../../src/core/mjmlDefaults.js';
import { resolveBlock } from '../../src/core/EmailEditor.js';
import { emailBlocks } from '../../src/blocks/index.js';
import { createStarterMjml } from '../../src/features/templates/starter.js';
import { TEMPLATE_GALLERY, buildGallery } from '../../src/features/templates/gallery.js';
import { functionExport } from '../../src/engine/unwrapModule.js';

const all = (root, tag) => {
  const out = [];
  walk(root, (node) => node.tag === tag && out.push(node));
  return out;
};

/* ── MJML ⇄ model ─────────────────────────────────────────────────────── */

test('MJML → model → MJML is stable for the starter and every gallery template', () => {
  const sources = [createStarterMjml({ sender: { name: 'A & B "Co"', address: '1 <Main> Street' } })];
  for (const entry of buildGallery({ templates: TEMPLATE_GALLERY, sender: { name: 'ACME' } })) sources.push(entry.mjml);
  for (const source of sources) {
    const once = serializeMjml(parseMjml(source));
    assert.equal(serializeMjml(parseMjml(once)), once);
  }
});

test('the model keeps what MJML means: attributes decoded, contents as written', () => {
  const root = parseMjml(
    '<mjml><mj-body><mj-section><mj-column>' +
      '<mj-button href="https://x.com/?a=1&amp;b=&quot;2&quot;" title=\'it&apos;s\'>Go &amp; <b>see</b></mj-button>' +
      '</mj-column></mj-section></mj-body></mjml>'
  );
  const button = findFirst(root, 'mj-button');
  assert.equal(button.attributes.href, 'https://x.com/?a=1&b="2"');
  assert.equal(button.attributes.title, "it's");
  assert.equal(button.content, 'Go &amp; <b>see</b>');
  const out = serializeMjml(root);
  assert.match(out, /href="https:\/\/x\.com\/\?a=1&amp;b=&quot;2&quot;"/);
  assert.equal(decodeAttribute(encodeAttribute('a<b>&"c"')), 'a<b>&"c"');
});

test('reading tolerates what is not MJML: comments, a ">" in a value, self-closing tags, a missing closing tag', () => {
  const root = parseMjml(
    '<?xml version="1.0"?><!-- note --><mjml><mj-body><mj-section>' +
      '<mj-column><mj-image src="https://x.com/a.png" alt="a > b"/><mj-spacer height=20px/>' +
      '<div>stray</div><mj-text>Hi</mj-text></mj-column>' +
      '</mj-body></mjml>'
  );
  const image = findFirst(root, 'mj-image');
  assert.equal(image.attributes.alt, 'a > b');
  assert.equal(findFirst(root, 'mj-spacer').attributes.height, '20px');
  assert.equal(findFirst(root, 'mj-text').content, 'Hi');
  assert.equal(all(root, 'mj-section').length, 1);
  // A fragment gets a body; an empty source an empty body.
  assert.equal(findFirst(parseMjml('<mj-section><mj-column /></mj-section>'), 'mj-body').children.length, 1);
  assert.equal(findFirst(parseMjml(''), 'mj-body').children.length, 0);
});

test('section margin stays outside its border and padding in canvas and exported MJML', async () => {
  for (const fullWidth of [false, true]) {
    const root = parseMjml('<mjml><mj-body background-color="#eeeeee" content-background-color="#ffffff">' +
      `<mj-section margin="12px 20px 24px 30px" ${fullWidth ? 'full-width="full-width"' : ''} ` +
      'background-color="#f0f0ff" border="3px solid #555555" padding="30px 0px 5px">' +
      '<mj-column><mj-text>Three independent levels</mj-text></mj-column></mj-section></mj-body></mjml>');
    const out = serializeMjml(root, { pretty: false });
    assert.ok(!out.includes('margin='), 'only supported MJML attributes are exported');
    assert.match(out, /<mj-wrapper css-class="eb-section-margin" padding="12px 20px 24px 30px"/);
    assert.match(out, /<mj-section[^>]*border="3px solid #555555"[^>]*padding="30px 0px 5px"/);
    const restored = parseMjml(out);
    assert.equal(findFirst(restored, 'mj-section').attributes.margin, '12px 20px 24px 30px');
    assert.equal(findFirst(restored, 'mj-section').attributes['full-width'], fullWidth ? 'full-width' : undefined);
    if (!fullWidth) assert.equal(findFirst(restored, 'mj-body').attributes['content-background-color'], '#ffffff');
    assert.equal(serializeMjml(restored, { pretty: false }), out);
    for (const source of [out, canvasMjml(root)]) {
      const { html, errors } = await mjml2html(source, { validationLevel: 'strict' });
      assert.deepEqual(errors, []);
      assert.match(html, /padding:12px 20px 24px 30px/);
      assert.match(html, /border:3px solid #555555/);
      assert.match(html, /padding:30px 0px 5px/);
    }
  }
});

test('the color under the content: an mj-wrapper around the sections in the MJML, an attribute of the body in the model', async () => {
  const section = (attrs, text) => `<mj-section ${attrs}><mj-column><mj-text>${text}</mj-text></mj-column></mj-section>`;
  const source =
    '<mjml><mj-body background-color="#eef1f7">' +
    section('background-color="#ffffff"', 'Top') +
    section('background-color="#dd3333" border-radius="24px"', 'Rounded') +
    section('background-color="#222222" full-width="full-width"', 'Band') +
    '<mj-hero background-color="#ffffff"><mj-text>Hero</mj-text></mj-hero>' +
    '<mj-wrapper background-color="#00aa00"><mj-section><mj-column><mj-text>Own wrapper</mj-text></mj-column></mj-section></mj-wrapper>' +
    '</mj-body></mjml>';
  const plain = parseMjml(source);
  const body = findFirst(plain, 'mj-body');
  const root = setAttributes(plain, body.id, { 'content-background-color': '#ffffff' });

  const out = serializeMjml(root, { pretty: false });
  assert.ok(!out.includes('content-background-color'), 'not an MJML attribute');
  const layers = out.match(/<mj-wrapper css-class="eb-content-layer" background-color="#ffffff" padding="0px">/g) || [];
  assert.equal(layers.length, 2, 'the band across the screen splits the layer in two');
  assert.match(out, /<mj-wrapper css-class="eb-content-layer"[^>]*><mj-section[^>]*>.*Top.*Rounded.*<\/mj-section><\/mj-wrapper><mj-section[^>]*full-width/);
  assert.match(out, /full-width.*Band.*<\/mj-section><mj-wrapper css-class="eb-content-layer"[^>]*><mj-hero[^>]*>.*Hero.*<\/mj-hero><\/mj-wrapper><mj-wrapper background-color="#00aa00">/);

  // Read back: the body's attribute again, the sections where they were.
  const back = parseMjml(out);
  assert.equal(findFirst(back, 'mj-body').attributes['content-background-color'], '#ffffff');
  assert.deepEqual(
    findFirst(back, 'mj-body').children.map((c) => c.tag),
    ['mj-section', 'mj-section', 'mj-section', 'mj-hero', 'mj-wrapper']
  );
  assert.equal(serializeMjml(back, { pretty: false }), out);
  // Empty, the email is written exactly as before.
  assert.equal(serializeMjml(setAttributes(root, body.id, { 'content-background-color': null })), serializeMjml(plain));

  // Compiled: the color at the content's width under the rounded section, Outlook's table included.
  const { html, errors } = await mjml2html(out, { validationLevel: 'strict' });
  assert.deepEqual(errors, []);
  assert.match(html, /<div\s+class="eb-content-layer" style="background:#ffffff;background-color:#ffffff;margin:0px auto;max-width:600px;">/);
  assert.match(html, /class="eb-content-layer-outlook"[^>]*bgcolor="#ffffff"/);
  const layer = html.indexOf('class="eb-content-layer"');
  assert.ok(layer > -1 && html.indexOf('border-radius:24px', layer) > layer, 'the rounded section is inside the layer');
});

/* ── Model ─────────────────────────────────────────────────────────────── */

test('operations are pure and keep ids unique', () => {
  const root = parseMjml('<mjml><mj-body><mj-section><mj-column><mj-text>A</mj-text><mj-text>B</mj-text></mj-column></mj-section></mj-body></mjml>');
  const [a, b] = all(root, 'mj-text');
  const column = findFirst(root, 'mj-column');
  const moved = moveNode(root, a.id, column.id, 2); // after B
  assert.deepEqual(all(moved, 'mj-text').map((n) => n.content), ['B', 'A']);
  assert.deepEqual(all(root, 'mj-text').map((n) => n.content), ['A', 'B'], 'the original is untouched');
  assert.equal(moveNode(root, a.id, column.id, 0), root, 'no move: same tree');
  assert.equal(moveNode(root, column.id, column.id, 0), root, 'never inside itself');

  const copy = cloneWithNewIds(findFirst(root, 'mj-section'));
  const doubled = insertNodes(root, findFirst(root, 'mj-body').id, 1, [copy]);
  const ids = [];
  walk(doubled, (n) => ids.push(n.id));
  assert.equal(new Set(ids).size, ids.length, 'unique ids after a copy');
  assert.ok(ids.every((id) => /^[a-z0-9]+$/.test(id)), 'ids fit in a CSS class');

  const styled = setAttributes(root, b.id, { color: '#123456', align: '' });
  assert.equal(findFirst(styled, 'mj-text') === a, true, 'untouched branches are shared');
  assert.equal(all(styled, 'mj-text')[1].attributes.color, '#123456');
  assert.equal(all(removeNode(root, b.id), 'mj-text').length, 1);
});

test('stored project: read back identical; anything else refused', () => {
  const root = parseMjml(createStarterMjml());
  const project = JSON.parse(JSON.stringify(toProject(root)));
  assert.equal(serializeMjml(fromProject(project)), serializeMjml(root));
  assert.throws(() => fromProject({ pages: [] }), /Not a project/);
  assert.throws(() => fromProject({ format: 1, root: { tag: 'script' } }), /Invalid element/);
  assert.throws(() => fromProject({ format: 1, root: { tag: 'mjml' } }), /no email body/);
  // Duplicate or malformed ids are replaced.
  const twice = fromProject({ format: 1, root: { tag: 'mjml', id: 'x', children: [{ tag: 'mj-body', id: 'x' }] } });
  assert.notEqual(twice.id, twice.children[0].id);
});

/* ── Placement ─────────────────────────────────────────────────────────── */

const SAMPLE =
  '<mjml><mj-body>' +
  '<mj-section><mj-column><mj-text>A</mj-text><mj-text>B</mj-text></mj-column></mj-section>' +
  '<mj-section><mj-column></mj-column><mj-column><mj-text>C</mj-text></mj-column></mj-section>' +
  '</mj-body></mjml>';

test('click placement: column → inside, element → after it, nothing → new section at the end, layout → after the section', () => {
  const root = parseMjml(SAMPLE);
  const body = findFirst(root, 'mj-body');
  const [s1] = all(root, 'mj-section');
  const [c1, c2] = all(root, 'mj-column');
  const [a] = all(root, 'mj-text');
  assert.deepEqual(placementFor(root, 'content', null), { parentId: body.id, index: 2, wrap: true });
  assert.deepEqual(placementFor(root, 'content', c2.id), { parentId: c2.id, index: 0, wrap: false });
  assert.deepEqual(placementFor(root, 'content', a.id), { parentId: c1.id, index: 1, wrap: false });
  assert.deepEqual(placementFor(root, 'layout', a.id), { parentId: body.id, index: 1, wrap: false });
  assert.deepEqual(placementFor(root, 'content', s1.id), { parentId: body.id, index: 1, wrap: true });
});

/**
 * Boxes of a laid-out email, as the canvas would measure them:
 *   section 1 (0–100): column 1 full width with A (0–50) and B (50–100)
 *   section 2 (100–200): empty column 2 (left, 100–130), column 3 (right) with C (100–200)
 */
function layout(root) {
  const [s1, s2] = all(root, 'mj-section');
  const [c1, c2, c3] = all(root, 'mj-column');
  const [a, b, c] = all(root, 'mj-text');
  const body = findFirst(root, 'mj-body');
  const boxes = {
    [body.id]: { top: 0, bottom: 200, left: 0, right: 600 },
    [s1.id]: { top: 0, bottom: 100, left: 0, right: 600 },
    [s2.id]: { top: 100, bottom: 200, left: 0, right: 600 },
    [c1.id]: { top: 0, bottom: 100, left: 0, right: 600 },
    [c2.id]: { top: 100, bottom: 130, left: 0, right: 300 },
    [c3.id]: { top: 100, bottom: 200, left: 300, right: 600 },
    [a.id]: { top: 0, bottom: 50, left: 0, right: 600 },
    [b.id]: { top: 50, bottom: 100, left: 0, right: 600 },
    [c.id]: { top: 100, bottom: 200, left: 300, right: 600 },
  };
  return { ids: { body, s1, s2, c1, c2, c3, a, b, c }, boxOf: (id) => boxes[id] || null };
}

test('drop placement: between two texts, into an empty column, beside a shorter column, between sections', () => {
  const root = parseMjml(SAMPLE);
  const { ids, boxOf } = layout(root);
  const content = { kind: 'content' };

  // Over A, lower half: after A.
  const afterA = dropTargetFor(root, content, { x: 300, y: 40 }, ids.a.id, boxOf);
  assert.deepEqual({ ...afterA, line: undefined }, { parentId: ids.c1.id, index: 1, wrap: false, line: undefined });
  assert.equal(afterA.line.y, 50, 'the line sits on top of B');
  // Over A, upper half: before A.
  assert.equal(dropTargetFor(root, content, { x: 300, y: 10 }, ids.a.id, boxOf).index, 0);
  // Into the empty column.
  assert.deepEqual(
    { ...dropTargetFor(root, content, { x: 100, y: 115 }, ids.c2.id, boxOf), line: undefined },
    { parentId: ids.c2.id, index: 0, wrap: false, line: undefined }
  );
  // Over section 2's empty area under the short column: that column.
  assert.equal(dropTargetFor(root, content, { x: 100, y: 180 }, ids.s2.id, boxOf).parentId, ids.c2.id);
  // Over the body outside any section: a new section, by position.
  const below = dropTargetFor(root, content, { x: 300, y: 199 }, ids.body.id, boxOf);
  assert.deepEqual({ parentId: below.parentId, index: below.index, wrap: below.wrap }, { parentId: ids.body.id, index: 2, wrap: true });
  // A layout always goes between sections.
  const layoutDrop = dropTargetFor(root, { kind: 'layout' }, { x: 300, y: 30 }, ids.a.id, boxOf);
  assert.deepEqual({ parentId: layoutDrop.parentId, index: layoutDrop.index, wrap: layoutDrop.wrap }, { parentId: ids.body.id, index: 0, wrap: false });
});

test('a section\'s top and bottom paddings are between sections: the content gets a section of its own', () => {
  const root = parseMjml(SAMPLE);
  const { ids, boxOf } = layout(root);
  // Section 1 with 20 px paddings: its column only spans 20–80.
  const padded = (id) => (id === ids.c1.id ? { top: 20, bottom: 80, left: 0, right: 600 } : boxOf(id));
  const below = dropTargetFor(root, { kind: 'content' }, { x: 300, y: 92 }, ids.s1.id, padded);
  assert.deepEqual({ parentId: below.parentId, index: below.index, wrap: below.wrap }, { parentId: ids.body.id, index: 1, wrap: true });
  const above = dropTargetFor(root, { kind: 'content' }, { x: 300, y: 6 }, ids.s1.id, padded);
  assert.deepEqual({ parentId: above.parentId, index: above.index, wrap: above.wrap }, { parentId: ids.body.id, index: 0, wrap: true });
  // Inside the column's band: the column.
  assert.equal(dropTargetFor(root, { kind: 'content' }, { x: 300, y: 50 }, ids.s1.id, padded).parentId, ids.c1.id);
});

test('moving an element: measured without itself, never dropped inside itself', () => {
  const root = parseMjml(SAMPLE);
  const { ids, boxOf } = layout(root);
  // Dragging A over itself stays in its column; B's box decides the index.
  const self = dropTargetFor(root, { kind: 'content', nodeId: ids.a.id }, { x: 300, y: 70 }, ids.a.id, boxOf);
  assert.equal(self.parentId, ids.c1.id);
  // A moved below B: index 2 in the column (counted before A leaves).
  const below = dropTargetFor(root, { kind: 'content', nodeId: ids.a.id }, { x: 300, y: 90 }, ids.b.id, boxOf);
  assert.deepEqual({ parentId: below.parentId, index: below.index }, { parentId: ids.c1.id, index: 2 });
  const moved = moveNode(root, ids.a.id, below.parentId, below.index);
  assert.deepEqual(all(moved, 'mj-text').map((n) => n.content), ['B', 'A', 'C']);
  // A section dragged over itself: between sections, skipping itself.
  const section = dropTargetFor(root, { kind: 'layout', nodeId: ids.s1.id }, { x: 300, y: 190 }, ids.s1.id, boxOf);
  assert.deepEqual({ parentId: section.parentId, index: section.index }, { parentId: ids.body.id, index: 2 });
});

/* ── Canvas markers ───────────────────────────────────────────────────── */

test('canvas: every element of every block and template is found exactly once in the compiled HTML; placeholders only there', async () => {
  const sources = buildGallery({ templates: TEMPLATE_GALLERY, sender: {} }).map((g) => g.mjml);
  for (const block of emailBlocks.list((b) => b.mjml)) {
    const { mjml, sectionMjml } = resolveBlock(block);
    sources.push(`<mjml><mj-body>${block.kind === 'layout' ? mjml : sectionMjml}</mj-body></mjml>`);
  }
  sources.push('<mjml><mj-body></mj-body></mjml>');
  for (const source of sources) {
    const root = parseMjml(source);
    const { html, errors } = await mjml2html(canvasMjml(root, { t: (k) => k }), { validationLevel: 'soft' });
    assert.deepEqual(errors, []);
    walk(root, (node) => {
      if (node.tag === 'mjml' || node.tag === 'mj-head' || !/^mj-/.test(node.tag)) return;
      const found = html.match(new RegExp(`eb-id-${node.id}(?![\\w-])`, 'g')) || [];
      assert.equal(found.length, 1, `${node.tag} marked once`);
    });
    // The exported MJML carries none of it.
    const exported = serializeMjml(root);
    assert.ok(!exported.includes('eb-id-') && !exported.includes('eb-placeholder') && !exported.includes('data:image'));
  }
});

test('canvas: an empty column says where to drop, an image without file shows a frame sized to its column', () => {
  const root = parseMjml('<mjml><mj-body><mj-section><mj-column></mj-column><mj-column><mj-image /></mj-column></mj-section></mj-body></mjml>');
  const source = canvasMjml(root, { t: (key) => (key === 'Drop a block here' ? 'Déposez un bloc ici' : key) });
  assert.match(source, /eb-placeholder[^>]*>Déposez un bloc ici</);
  const src = /src="(data:image\/svg\+xml[^"]+)"/.exec(source)[1];
  assert.match(decodeURIComponent(src), /width="250"/, 'half of 600 px minus the default padding');
});

test('canvas: uploaded images are shown from the storage’s imageUrl, the template keeps the path', () => {
  const upload = '/email-assets/0123456789abcdef0123456789abcdef.png';
  const root = parseMjml(
    `<mjml><mj-body><mj-section background-url="${upload}"><mj-column><mj-image src="${upload}" />` +
      '<mj-image src="https://example.com/a.png" /></mj-column></mj-section></mj-body></mjml>'
  );
  const source = canvasMjml(root, { imageUrl: (path) => `blob:shown${path}` });
  assert.equal(source.split(`"blob:shown${upload}"`).length - 1, 2, 'the image and the background');
  assert.match(source, /src="https:\/\/example\.com\/a\.png"/);
  assert.ok(canvasMjml(root).includes(`src="${upload}"`), 'without imageUrl, the path as is');
  assert.ok(serializeMjml(root).includes(`src="${upload}"`) && !serializeMjml(root).includes('blob:'));
});

/* ── MJML defaults, checked against the installed MJML ───────────────── */

test('MJML_DEFAULTS match the defaults of the installed mjml components', async () => {
  const modules = {
    'mj-body': ['mjml-body'],
    'mj-section': ['mjml-section'],
    'mj-wrapper': ['mjml-wrapper'],
    'mj-column': ['mjml-column'],
    'mj-text': ['mjml-text'],
    'mj-image': ['mjml-image'],
    'mj-button': ['mjml-button'],
    'mj-divider': ['mjml-divider'],
    'mj-spacer': ['mjml-spacer'],
    'mj-social': ['mjml-social', 'Social'],
    'mj-social-element': ['mjml-social', 'SocialElement'],
    'mj-navbar': ['mjml-navbar', 'Navbar'],
    'mj-navbar-link': ['mjml-navbar', 'NavbarLink'],
    'mj-hero': ['mjml-hero'],
  };
  for (const [tag, [name, member]] of Object.entries(modules)) {
    const module = await import(name);
    const component = member ? module[member] || module.default?.[member] : module.default?.default || module.default;
    const real = component.defaultAttributes;
    for (const [key, value] of Object.entries(MJML_DEFAULTS[tag])) {
      assert.equal(real[key], value, `${tag} ${key}`);
    }
  }
});

test('functionExport: the canvas compiler loads whatever the bundler wraps it in', async () => {
  assert.equal(typeof functionExport(await import('mjml-browser')), 'function');
});

test('a block fragment parses into the elements it announces', () => {
  for (const block of emailBlocks.list((b) => b.mjml)) {
    const { mjml } = resolveBlock(block);
    const [node] = parseMjmlFragment(mjml);
    assert.equal(node.tag, block.tagName, block.id);
  }
});

test('every block has independent box layers; custom spacing survives valid MJML roundtrips and compilation', async () => {
  const { compileMjml } = await import('../../src/server/compileMjml.js');
  for (const block of emailBlocks.list((block) => block.kind === 'content' && !block.insertOnly)) {
    const properties = block.properties;
    for (const role of ['margin', 'border', 'padding']) {
      assert.ok(properties.some((property) => (property.box || (property.type === 'border' ? 'border' : null)) === role), `${block.id}: ${role}`);
    }
    const fragment = typeof block.sectionMjml === 'function' ? block.sectionMjml() : block.sectionMjml;
    const tree = parseMjml(fragment);
    const selected = findFirst(tree, block.tagName);
    const attrs = {};
    for (const role of ['margin', 'border', 'padding']) {
      const property = properties.find((property) => (property.box || (property.type === 'border' ? 'border' : null)) === role);
      attrs[property.key] = role === 'margin' ? '11px 12px 13px 14px' : role === 'border' ? '3px solid #123456' : '21px 22px 23px 24px';
    }
    Object.assign(selected.attributes, attrs);
    const source = serializeMjml(tree);
    const restored = findFirst(parseMjml(source), block.tagName);
    for (const [key, value] of Object.entries(attrs)) assert.equal(restored.attributes[key], value, block.id);
    assert.deepEqual((await mjml2html(source, { validationLevel: 'strict' })).errors, [], block.id);
    const result = await compileMjml(source);
    assert.deepEqual(result.warnings, [], block.id);
    if (block.id !== 'button') {
      assert.match(result.html, /padding:11px 12px 13px 14px/, block.id);
      assert.match(result.html, /padding:21px 22px 23px 24px/, block.id);
      assert.match(result.html, /border-width:3px 3px 3px 3px/, block.id);
    }
  }
});

test('image pixel widths reserve every box layer, including the column, for Outlook', async () => {
  const { compileMjml } = await import('../../src/server/compileMjml.js');
  const { html, warnings } = await compileMjml('<mjml><mj-body><mj-section padding="0px">' +
    '<mj-column margin="10px" padding="20px" border="2px solid #123456">' +
    '<mj-image src="https://example.com/a.png" padding="11px 12px 13px 14px" box-padding="21px 22px 23px 24px" border="3px solid #123456" />' +
    '</mj-column></mj-section></mj-body></mjml>');
  assert.deepEqual(warnings, []);
  // 600 - column (20 + 40 + 4) - image (26 + 46 + 6).
  assert.match(html.match(/<img\b[^>]*>/)[0], /width="458"/);
});
