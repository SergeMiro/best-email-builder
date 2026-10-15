/**
 * BRAND — a company's look (name, logo, main color, headings color, font),
 * set by hand or read from its website, and applied to every email.
 *
 * What is locked here:
 *   - an email is repainted by ROLE (buttons, banners, headings, links,
 *     fonts), stays valid, and a second pass changes nothing;
 *   - reading a website finds the brand's name, logo and colors on real-life
 *     markup, and skips what is someone else's (partners, payment, cookies);
 *   - the server never reaches anything but the public web: private and
 *     cloud-metadata addresses, other ports, credentials and redirects there
 *     are refused before any connection;
 *   - routes, storages and the AI generator carry the brand.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import dns from 'node:dns';
import zlib from 'node:zlib';
import {
  applyBrand,
  applyBrandToFragment,
  brandTemplate,
  brandedSender,
  cleanBrand,
  contrastRatio,
  hasBrand,
  isColored,
  parseColor,
  readableOn,
  toHex,
} from '../../src/features/brand/brand.js';
import { brandFromCss, imageSize, logoWidthFor, nearestFont, readPage, tagAttributes } from '../../src/features/brand/extract.js';
import { BRAND_IMPORT_ERRORS, BRAND_NOTES } from '../../src/features/brand/messages.js';
import { brandOf } from '../../src/features/brand/useBrand.js';
import {
  BrandImportError,
  createBrandImporter,
  createBrandService,
  createEmailBuilderHandler,
  createMemoryAssetRepository,
  createMemoryBrandRepository,
  createMemoryTemplateRepository,
  isPublicAddress,
  validateMjml,
  compileMjml,
} from '../../src/server/index.js';
import { createEmailGenerator, buildUserPrompt } from '../../src/ai/server.js';
import { siteUrl } from '../../src/server/brandImport.js';
import { createHttpStorage, createMemoryStorage } from '../../src/storage/client.js';
import { createStarterMjml } from '../../src/features/templates/starter.js';
import { buildGallery } from '../../src/features/templates/gallery.js';
import { emailBlocks } from '../../src/blocks/index.js';
import { createRegistry } from '../../src/core/registry.js';
import { createEmailEditor, resolveBlock } from '../../src/core/EmailEditor.js';
import { parseMjml } from '../../src/engine/mjml.js';
import { FONT_OPTIONS, PALETTE } from '../../src/blocks/shared.js';
import { translatorFor } from '../../src/i18n/index.js';

const PINK = '#e91e63';
const BRAND = { name: 'Acme', primary: PINK, heading: '#1a1a2e', font: FONT_OPTIONS[4].value };
const LOGO = 'https://cdn.acme.com/logo.png';

/** Every node of an email, flat. */
function nodesOf(mjml) {
  const all = [];
  const walk = (node) => {
    all.push(node);
    node.children.forEach(walk);
  };
  walk(parseMjml(mjml));
  return all;
}

/** A PNG header of the given size (enough for detectImage and imageSize). */
function png(width, height) {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

/* ── The brand itself ───────────────────────────────────────────────────── */

test('colors: parsed in every CSS form, contrast, what reads on them, what counts as colored', () => {
  for (const value of ['#e91e63', '#E91E63', 'rgb(233, 30, 99)', 'rgba(233,30,99,1)', 'rgb(233 30 99)']) {
    assert.equal(toHex(parseColor(value)), PINK, value);
  }
  assert.equal(toHex(parseColor('#fff')), '#ffffff');
  assert.equal(toHex(parseColor('hsl(0, 100%, 50%)')), '#ff0000');
  assert.equal(parseColor('#ff000080').a < 0.6, true);
  assert.equal(parseColor('not a color'), null);
  assert.equal(parseColor('var(--x)'), null);
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  assert.equal(readableOn('#212e5a'), PALETTE.white);
  assert.equal(readableOn('#ffe01b'), PALETTE.ink, 'a yellow carries dark text');
  assert.ok(isColored(PINK) && isColored('#2977bc') && isColored('#ffe01b'));
  for (const gray of ['#ffffff', '#f4f6f8', '#6d7484', '#2b3038', '#000000', 'transparent']) assert.equal(isColored(gray), false, gray);
});

test('cleanBrand: colors as #rrggbb, known fonts, https or site-relative logos, bounded width; the rest dropped', () => {
  assert.deepEqual(
    cleanBrand({
      name: '  Acme\n Corp ',
      primary: 'rgb(233, 30, 99)',
      heading: '#1A1A2E',
      font: FONT_OPTIONS[1].value,
      logoUrl: LOGO,
      logoWidth: '180',
      website: 'https://acme.com/',
      evil: '<script>',
    }),
    { name: 'Acme Corp', primary: PINK, heading: '#1a1a2e', font: FONT_OPTIONS[1].value, logoUrl: LOGO, logoWidth: 180, website: 'https://acme.com/' }
  );
  assert.deepEqual(cleanBrand({ logoUrl: '/api/email-builder/assets/a.png', logoWidth: 999 }), { logoUrl: '/api/email-builder/assets/a.png' });
  for (const logoUrl of ['http://acme.com/logo.png', 'javascript:alert(1)', '//evil.com/x.png', 'https://a.com/x".png', 'data:image/png;base64,AA']) {
    assert.equal(cleanBrand({ logoUrl }).logoUrl, undefined, logoUrl);
  }
  assert.deepEqual(cleanBrand({ font: 'Comic Sans MS', primary: 'red-ish', website: 'javascript:x', logoWidth: 100 }), {});
  assert.deepEqual(cleanBrand(null), {});
  assert.deepEqual(cleanBrand('acme'), {});
  assert.equal(hasBrand({}), false);
  assert.equal(hasBrand({ website: 'https://acme.com' }), false, 'where it was read from changes nothing');
  assert.equal(hasBrand({ primary: PINK }), true);
});

test('brandedSender: the brand name and logo over the host sender, whose address stays', () => {
  const sender = { name: 'Host', address: '1 rue X', logoUrl: 'https://host.com/l.png', logoWidth: 120 };
  assert.deepEqual(brandedSender(sender, null), sender);
  assert.deepEqual(brandedSender(sender, { name: 'Acme' }), { ...sender, name: 'Acme' });
  assert.deepEqual(brandedSender(sender, { logoUrl: LOGO, logoWidth: 90 }), { ...sender, logoUrl: LOGO, logoWidth: 90 });
  assert.deepEqual(brandedSender(null, { name: 'Acme' }), { name: 'Acme' });
});

/* ── Painting an email ──────────────────────────────────────────────────── */

test('applyBrand on the starter: button, heading and font by role; footer gray kept; valid; second pass changes nothing', () => {
  const starter = createStarterMjml();
  assert.equal(applyBrand(starter, null), starter);
  assert.equal(applyBrand(starter, {}), starter);
  assert.equal(applyBrand(starter, { website: 'https://acme.com' }), starter);

  const branded = applyBrand(starter, BRAND);
  const nodes = nodesOf(branded);
  const button = nodes.find((n) => n.tag === 'mj-button');
  assert.equal(button.attributes['background-color'], PINK);
  assert.equal(button.attributes.color, PALETTE.white);
  const headline = nodes.find((n) => n.tag === 'mj-text' && n.content.includes('Your headline'));
  assert.equal(headline.attributes.color, '#1a1a2e');
  const body = nodes.find((n) => n.tag === 'mj-text' && n.content.includes('Your text'));
  assert.equal(body.attributes.color, PALETTE.ink, 'body text keeps its color');
  const footer = nodes.find((n) => n.tag === 'mj-text' && n.content.includes('unsubscribe'));
  assert.equal(footer.attributes.color, '#6d7484');
  assert.match(footer.content, /color:#6d7484/, 'a gray link is a choice, kept');
  for (const node of nodes.filter((n) => n.tag === 'mj-text' || n.tag === 'mj-button')) {
    assert.equal(node.attributes['font-family'], BRAND.font);
  }
  assert.ok(validateMjml(branded).ok);
  assert.equal(applyBrand(branded, BRAND), branded, 'idempotent');

  // A light main color: the button text turns dark, links fall back to the headings color.
  const yellow = applyBrand(starter, { primary: '#ffe01b', heading: '#1a1a2e' });
  const yellowButton = nodesOf(yellow).find((n) => n.tag === 'mj-button');
  assert.equal(yellowButton.attributes['background-color'], '#ffe01b');
  assert.equal(yellowButton.attributes.color, PALETTE.ink);
});

test('brandTemplate: the logo, or the name, in the header; the name in the footer; the host sender replaced', () => {
  const t = translatorFor('fr');
  const host = { name: 'Host Corp', address: '1 rue X' };
  const starter = createStarterMjml({ sender: host, t });

  const named = brandTemplate(starter, { name: 'Acme', primary: PINK }, { sender: host, t });
  const header = nodesOf(named).find((n) => n.tag === 'mj-text');
  assert.equal(header.content, 'Acme');
  assert.match(named, /Acme · 1 rue X/);
  assert.doesNotMatch(named, /Host Corp/);

  const withLogo = brandTemplate(starter, { name: 'Acme', logoUrl: LOGO, logoWidth: 160 }, { sender: host, t });
  const logo = nodesOf(withLogo).find((n) => n.tag === 'mj-image');
  assert.deepEqual([logo.attributes.src, logo.attributes.alt, logo.attributes.width], [LOGO, 'Acme', '160px']);
  assert.ok(validateMjml(withLogo).ok);

  // "Your company" (translated) is a placeholder too.
  const anonymous = createStarterMjml({ t });
  assert.match(brandTemplate(anonymous, { name: 'Acme' }, { t }), /Acme/);
  assert.doesNotMatch(brandTemplate(anonymous, { name: 'Acme' }, { t }), new RegExp(t('Your company')));

  // A logo already there is swapped for the brand's.
  const hostLogo = createStarterMjml({ sender: { name: 'Host Corp', logoUrl: 'https://host.com/l.png' } });
  const swapped = brandTemplate(hostLogo, { logoUrl: LOGO }, { sender: { name: 'Host Corp', logoUrl: 'https://host.com/l.png' } });
  assert.match(swapped, new RegExp(LOGO));
  assert.doesNotMatch(swapped, /host\.com/);

  // An email whose top says something else is left alone.
  const custom = starter.replace('>Host Corp<', '>Summer newsletter<');
  assert.match(brandTemplate(custom, { name: 'Acme' }, { sender: host, t }), /Summer newsletter/);
});

test('every gallery template, branded: banners in the main color, their texts readable, still valid and compiled clean', async () => {
  const brands = [BRAND, { primary: '#ffe01b', heading: '#1a1a2e', name: 'Mail', logoUrl: LOGO, logoWidth: 180 }, { primary: '#1ed760' }];
  for (const brand of brands) {
    for (const template of buildGallery({ sender: { name: 'Host' } })) {
      const mjml = brandTemplate(template.mjml, brand, { sender: { name: 'Host' } });
      assert.ok(validateMjml(mjml).ok, `${template.id}: valid`);
      assert.equal(brandTemplate(mjml, brand, { sender: { name: 'Host' } }), mjml, `${template.id}: idempotent`);
      const { warnings } = await compileMjml(mjml);
      assert.deepEqual(warnings, [], `${template.id}: compiles clean`);
      const nodes = nodesOf(mjml);
      for (const button of nodes.filter((n) => n.tag === 'mj-button')) {
        const background = button.attributes['background-color'];
        if (background && isColored(background)) {
          assert.ok(contrastRatio(background, button.attributes.color) >= 2.5, `${template.id}: button text readable on ${background}`);
        }
      }
      if (brand.font) {
        for (const node of nodes.filter((n) => n.tag === 'mj-text')) assert.equal(node.attributes['font-family'], brand.font, template.id);
      }
    }
  }
  // At least one gallery template has a colored banner, and it takes the main color.
  const banners = buildGallery({}).flatMap((template) =>
    nodesOf(applyBrand(template.mjml, BRAND)).filter((n) => n.tag === 'mj-section' && n.attributes['background-color'] === PINK)
  );
  assert.ok(banners.length > 0);
});

test('applyBrandToFragment: every block of the registry, branded, still starts with its tag', () => {
  for (const block of emailBlocks.list()) {
    const { mjml, sectionMjml } = resolveBlock(block);
    if (!mjml) continue;
    assert.equal(applyBrandToFragment(mjml, null), mjml);
    const branded = applyBrandToFragment(mjml, BRAND);
    assert.ok(branded.startsWith(`<${block.tagName}`), block.id);
    if (sectionMjml) assert.ok(applyBrandToFragment(sectionMjml, BRAND).startsWith('<mj-section'), block.id);
  }
  const button = applyBrandToFragment(resolveBlock(emailBlocks.get('button')).mjml, BRAND);
  assert.match(button, new RegExp(`background-color="${PINK}"`));
});

test('editor: setBrand paints the blocks inserted after it; setMjml replaces the email in one step', async () => {
  const calls = [];
  const adapter = {
    async initialize() {},
    destroy() {},
    addBlock: (block) => (calls.push(['addBlock', block.mjml]), 'id'),
    startBlockDrag: (block) => calls.push(['drag', block.mjml]),
    getSelection: () => null,
    loadMjml: (mjml) => calls.push(['loadMjml', mjml]),
    exportMjml: () => '<mjml><mj-body></mj-body></mjml>',
  };
  const BUTTON = { id: 'button', label: 'Button', icon: 'x', kind: 'content', tagName: 'mj-button', mjml: '<mj-button background-color="#2977bc">Go</mj-button>', properties: [] };
  const editor = createEmailEditor({ adapter: /** @type {any} */ (adapter), blocks: createRegistry('emailBlocks', [BUTTON]) });
  await editor.initialize({ container: /** @type {any} */ ({}) });

  editor.addBlock('button');
  editor.setBrand({ primary: PINK });
  editor.addBlock('button');
  editor.startBlockDrag('button', /** @type {any} */ ({}));
  editor.setBrand(null);
  editor.addBlock('button');
  assert.deepEqual(
    calls.map(([, mjml]) => /background-color="([^"]+)"/.exec(mjml)[1]),
    ['#2977bc', PINK, PINK, '#2977bc']
  );

  // Without setMjml in the adapter, loadMjml stands in.
  editor.setMjml('<mjml><mj-body></mj-body></mjml>');
  assert.deepEqual(calls.at(-1), ['loadMjml', '<mjml><mj-body></mj-body></mjml>']);
  const own = [];
  adapter.setMjml = (mjml) => own.push(mjml);
  editor.setMjml('<mjml></mjml>');
  assert.deepEqual(own, ['<mjml></mjml>']);
  editor.destroy();
  assert.throws(() => editor.setMjml(''), /before the editor was initialized/);
});

/* ── Reading a website ──────────────────────────────────────────────────── */

const HOME = `<!doctype html><html><head>
<title>Acme — Rockets for everyone</title>
<meta property="og:site_name" content="Acme &amp; Co">
<meta name="theme-color" content="#e91e63">
<link rel="stylesheet" href="/site.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<link rel="stylesheet" href="/cookie-consent.css">
<link rel="stylesheet" href="/print.css" media="print">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>.btn-primary{background:#e91e63}.cookie-banner{background:#00ff00}</style>
</head><body>
<header><a href="/" class="site-logo"><img src="/img/logo.png" srcset="/img/logo.png 1x, /img/logo@2x.png 2x" alt="Acme"></a>
<nav><a href="/shop" style="color:#e91e63">Shop</a></nav></header>
<main><img src="/img/rocket.jpg" alt="Rocket"></main>
<footer><img class="payment-logo" src="/img/visa-logo.png"><img class="partner-logo" src="/img/partner.png"></footer>
</body></html>`;

test('readPage: name, logos best first, stylesheets without fonts, cookies or print, inline styles, theme color', () => {
  const page = readPage(HOME, 'https://www.acme.com/');
  assert.equal(page.name, 'Acme & Co');
  assert.deepEqual(page.logos, [
    { url: 'https://www.acme.com/img/logo@2x.png', from: 'img' },
    { url: 'https://www.acme.com/apple-touch-icon.png', from: 'icon' },
  ]);
  assert.deepEqual(page.stylesheets, ['https://www.acme.com/site.css']);
  assert.match(page.css, /\.btn-primary\{background:#e91e63\}/);
  assert.match(page.css, /a\{color:#e91e63\}/);
  assert.equal(page.themeColor, '#e91e63');

  // JSON-LD Organization comes first; the name falls back to the title, then the domain.
  const schema = `<html><head><title>Home | Globex</title><script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Site"},{"@type":"Organization","name":"Globex Corporation","logo":{"@type":"ImageObject","url":"/brand/globex.png"}}]}
  </script></head><body><img src="/x.png" class="logo"></body></html>`;
  const globex = readPage(schema, 'https://globex.com/');
  assert.equal(globex.name, 'Globex Corporation');
  assert.deepEqual(globex.logos[0], { url: 'https://globex.com/brand/globex.png', from: 'schema' });
  assert.equal(readPage('<title>Home | Initech</title>', 'https://initech.io/').name, 'Initech');
  assert.equal(readPage('<title>Welcome</title>', 'https://www.hooli-xyz.co.uk/').name, 'Hooli Xyz');
  assert.deepEqual(readPage('<img src="javascript:alert(1)" class="logo">', 'https://a.com/').logos, []);
  assert.deepEqual(tagAttributes('<img SRC=/a.png alt="A &amp; B" data-x=\'1\' hidden>'), { src: '/a.png', alt: 'A & B', 'data-x': '1', hidden: '' });
});

test('brandFromCss: the brand color over grays, alerts and social colors; custom properties and bare channels; headings and font', () => {
  const css = `
    :root { --color-primary: 233 30 99; --text-color: #1a1a2e; --gray-500: #6b7280; --danger: #dc2626 }
    [data-theme=dark] { --color-primary: 255 255 255 }
    body { font-family: "Verdana", sans-serif; color: var(--text-color); background: #fff }
    h1, h2 { font-family: Georgia, serif; color: #1a1a2e }
    .btn { background-color: rgb(var(--color-primary)) }
    .btn:hover { background-color: #e0185b }
    .alert-error { background: #dc2626; color: #fff }
    .social-facebook { background: #1877f2 } .social-twitter { background: #1877f2 } .facebook { color: #1877f2 }
    .muted { color: #6b7280 } .border { border-color: #e5e7eb }
  `;
  assert.deepEqual(brandFromCss({ css }), { primary: PINK, heading: '#1a1a2e', font: 'Verdana, Geneva, sans-serif' });
  assert.equal(brandFromCss({ css: ':root{--brand: 210 64% 45%}' }).primary, toHex(parseColor('hsl(210, 64%, 45%)')));
  assert.equal(brandFromCss({ css: 'a{color:#888}', themeColor: '#0060df' }).primary, '#0060df');
  // No color at all: no primary; the headings color is ink.
  assert.deepEqual(brandFromCss({ css: 'body{color:#333;background:#fafafa}' }), { heading: '#333333' });
  assert.equal(brandFromCss({ css: '' }).heading, PALETTE.ink);
  // A dark main color doubles as the headings color.
  assert.deepEqual(brandFromCss({ css: '.btn{background:#123a7a}' }), { primary: '#123a7a', heading: '#123a7a' });
});

test('nearestFont, imageSize, logoWidthFor', () => {
  assert.equal(nearestFont('"Helvetica Neue", Arial, sans-serif'), FONT_OPTIONS[0].value);
  assert.equal(nearestFont('Inter, system-ui'), FONT_OPTIONS[0].value);
  assert.equal(nearestFont("'Playfair Display', serif"), 'Georgia, Times, serif');
  assert.equal(nearestFont('Tahoma'), 'Tahoma, Geneva, sans-serif');
  assert.equal(nearestFont('"JetBrains Mono", monospace'), "'Courier New', Courier, monospace");
  assert.equal(nearestFont('inherit'), undefined);

  assert.deepEqual(imageSize(png(400, 100)), { width: 400, height: 100 });
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x2c, 0x01, 0x64, 0x00, ...Array(20).fill(0)]);
  assert.deepEqual(imageSize(gif), { width: 300, height: 100 });
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x50, 0x01, 0x40, ...Array(20).fill(0)]);
  assert.deepEqual(imageSize(jpeg), { width: 320, height: 80 });
  assert.equal(imageSize(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);

  assert.equal(logoWidthFor({ width: 400, height: 100 }), 180, 'a retina wordmark');
  assert.equal(logoWidthFor({ width: 120, height: 40 }), 120, 'never wider than the image');
  assert.equal(logoWidthFor({ width: 200, height: 120 }), 140);
  assert.equal(logoWidthFor({ width: 512, height: 512 }), 72, 'a square mark');
  assert.equal(logoWidthFor({ width: 0, height: 0 }), 140);
});

/* ── The server's safety rules ──────────────────────────────────────────── */

test('isPublicAddress: private, loopback, link-local, metadata and every IPv4 hidden in IPv6 refused', () => {
  for (const address of [
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b::10.0.0.1',
    '2002:a9fe:a9fe::1',
    'fe80::1',
    'fe80::1%eth0',
    'fc00::1',
    'fd12:3456::1',
    '[::1]',
    'localhost',
    '',
    'not-an-ip',
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700::1111', '2a00:1450:4007:80f::200e', '::ffff:8.8.8.8']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('siteUrl: what the user types becomes a home page address; nonsense refused', () => {
  assert.equal(siteUrl('acme.com'), 'https://acme.com/');
  assert.equal(siteUrl('  https://www.acme.com/fr  '), 'https://www.acme.com/fr');
  assert.equal(siteUrl('http://acme.com'), 'http://acme.com/');
  for (const input of ['', 'acme', 'localhost', 'not a site.com', 'ftp://acme.com', 'javascript:alert(1)', 'x'.repeat(501) + '.com', null]) {
    assert.throws(() => siteUrl(input), (error) => error instanceof BrandImportError && error.code === 'BAD_URL', String(input));
  }
});

/** Code of the BrandImportError a promise rejects with. */
async function failure(promise) {
  try {
    await promise;
  } catch (error) {
    return error instanceof BrandImportError ? error.code : error.name;
  }
  return 'no error';
}

test('importer: private addresses, IP tricks, other ports, credentials and other schemes refused before connecting', async () => {
  const importer = createBrandImporter();
  for (const [input, code] of [
    ['http://127.0.0.1/', 'PRIVATE_ADDRESS'],
    ['127.0.0.1', 'PRIVATE_ADDRESS'],
    ['http://2130706433/', 'PRIVATE_ADDRESS'],
    ['http://0x7f.1/', 'PRIVATE_ADDRESS'],
    ['http://169.254.169.254/latest/meta-data/', 'PRIVATE_ADDRESS'],
    ['http://[::1]/', 'PRIVATE_ADDRESS'],
    ['http://[::ffff:169.254.169.254]/', 'PRIVATE_ADDRESS'],
    ['http://10.0.0.1/', 'PRIVATE_ADDRESS'],
    ['http://acme.com:8080/', 'BAD_URL'],
    ['https://user:secret@acme.com/', 'BAD_URL'],
    ['ftp://acme.com/', 'BAD_URL'],
    ['file:///etc/passwd', 'BAD_URL'],
    ['localhost', 'BAD_URL'],
  ]) {
    assert.equal(await failure(importer.import(input)), code, input);
  }
});

test('importer: a name that resolves to a private address is refused at the lookup', async (t) => {
  const resolved = await dns.promises.lookup('localhost.', { all: true }).catch(() => []);
  if (!resolved.length || resolved.some((entry) => isPublicAddress(entry.address))) {
    t.skip('"localhost." does not resolve to loopback here');
    return;
  }
  const { port, close } = await serve(() => ({ body: '<html></html>' }));
  try {
    const importer = createBrandImporter({ allowPort: () => true });
    assert.equal(await failure(importer.import(`http://localhost.:${port}/`)), 'PRIVATE_ADDRESS');
  } finally {
    await close();
  }
});

/**
 * A local website. `routes(path)` → {status, type, body, headers, gzip} or
 * 'hang' (never answers).
 */
async function serve(routes) {
  const server = http.createServer((request, response) => {
    const route = routes(request.url, request);
    if (route === 'hang') return;
    const { status = 200, type = 'text/html; charset=utf-8', body = '', headers = {}, gzip = false } = route || { status: 404 };
    const bytes = gzip ? zlib.gzipSync(body) : Buffer.from(body);
    response.writeHead(status, { 'content-type': type, ...(gzip ? { 'content-encoding': 'gzip' } : {}), ...headers });
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    port,
    base: `http://127.0.0.1:${port}`,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

/** An importer allowed to read the local test server, and nothing else private. */
const localImporter = (options = {}) =>
  createBrandImporter({ allowAddress: (address) => address === '127.0.0.1' || isPublicAddress(address), allowPort: () => true, ...options });

test('importer: a whole site read — page, gzipped stylesheet, header logo; partners, payment and cookies skipped', async () => {
  const seen = [];
  const site = await serve((path, request) => {
    seen.push([path, request.headers['user-agent']]);
    if (path === '/') return { body: HOME };
    if (path === '/site.css') return { type: 'text/css', gzip: true, body: 'body{font-family:Georgia,serif;color:#1a1a2e}.btn{background:#e91e63}' };
    if (path === '/img/logo@2x.png') return { type: 'image/png', body: Buffer.from(png(400, 100)) };
    return { status: 404 };
  });
  try {
    const result = await localImporter().import(`${site.base}/`);
    assert.deepEqual(result.brand, { name: 'Acme & Co', primary: PINK, heading: '#1a1a2e', font: 'Georgia, Times, serif', website: `${site.base}/` });
    assert.deepEqual(
      { ...result.logo, bytes: undefined },
      { bytes: undefined, width: 400, height: 100, type: 'image/png', ext: 'png', shownWidth: 180 }
    );
    assert.deepEqual(result.notes, []);
    const paths = seen.map(([path]) => path);
    assert.ok(!paths.some((path) => /cookie|print|partner|visa|rocket/.test(path)), paths.join(' '));
    assert.match(seen[0][1], /^BestEmailBuilder-BrandReader\//, 'says who it is');
  } finally {
    await site.close();
  }
});

test('importer: SVG logo, icon only, no colors — said in notes, never an error', async () => {
  const site = await serve((path) => {
    if (path === '/svg') return { body: '<title>Svgco</title><header><img class="logo" src="/logo.svg"></header>' };
    if (path === '/icon') return { body: '<head><link rel="apple-touch-icon" href="/touch.png"><style>.btn{background:#0060df}</style></head>' };
    if (path === '/touch.png') return { type: 'image/png', body: Buffer.from(png(180, 180)) };
    return { status: 404 };
  });
  try {
    const svg = await localImporter().import(`${site.base}/svg`);
    assert.equal(svg.logo, null);
    assert.deepEqual(svg.notes, ['LOGO_UNSUPPORTED', 'COLORS_NOT_FOUND']);
    assert.equal(svg.brand.heading, PALETTE.ink);
    const icon = await localImporter().import(`${site.base}/icon`);
    assert.equal(icon.logo.width, 180);
    assert.equal(icon.logo.shownWidth, 72);
    assert.deepEqual(icon.notes, ['LOGO_ICON']);
    assert.equal(icon.brand.primary, '#0060df');
    for (const code of ['LOGO_UNSUPPORTED', 'COLORS_NOT_FOUND', 'LOGO_ICON', 'LOGO_NOT_FOUND']) assert.ok(BRAND_NOTES[code], code);
  } finally {
    await site.close();
  }
});

test('importer: refused pages, redirects to private addresses, redirect loops, not HTML, timeout, cancel', async () => {
  const site = await serve((path) => {
    if (path === '/blocked') return { status: 403, body: 'Forbidden' };
    if (path === '/to-metadata') return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } };
    if (path === '/to-port') return { status: 301, headers: { location: 'http://acme.com:6379/' } };
    if (path.startsWith('/loop')) return { status: 302, headers: { location: `/loop${path.length}` } };
    if (path === '/hop') return { status: 302, headers: { location: '/landing' } };
    if (path === '/landing') return { body: '<title>Landing</title>' };
    if (path === '/json') return { type: 'application/json', body: '{}' };
    if (path === '/slow') return 'hang';
    return { status: 404 };
  });
  try {
    const importer = localImporter({ timeoutMs: 400 });
    assert.equal(await failure(importer.import(`${site.base}/blocked`)), 'HTTP_ERROR');
    assert.equal(await failure(importer.import(`${site.base}/to-metadata`)), 'PRIVATE_ADDRESS');
    const strict = createBrandImporter({ allowAddress: (address) => address === '127.0.0.1', allowPort: (port) => port === site.port });
    assert.equal(await failure(strict.import(`${site.base}/to-port`)), 'BAD_URL', 'a redirect cannot reach another port');
    assert.equal(await failure(importer.import(`${site.base}/loop`)), 'TOO_MANY_REDIRECTS');
    assert.equal((await importer.import(`${site.base}/hop`)).brand.website, `${site.base}/landing`);
    assert.equal(await failure(importer.import(`${site.base}/json`)), 'NOT_HTML');
    assert.equal(await failure(importer.import(`${site.base}/slow`)), 'TIMEOUT');
    const controller = new AbortController();
    const pending = importer.import(`${site.base}/slow`, { signal: controller.signal });
    controller.abort();
    assert.equal(await failure(pending), 'AbortError');
    assert.equal(await failure(importer.import('http://127.0.0.1:1/')), 'UNREACHABLE');
    for (const code of Object.keys(BRAND_IMPORT_ERRORS)) assert.ok(BRAND_IMPORT_ERRORS[code][1], code);
  } finally {
    await site.close();
  }
});

/* ── Routes, storages, AI ───────────────────────────────────────────────── */

function brandHandler(overrides = {}) {
  const handler = createEmailBuilderHandler({
    templates: createMemoryTemplateRepository(),
    assets: createMemoryAssetRepository(),
    authorize: (request, { action }) => {
      const role = request.headers.get('authorization');
      if (role === 'Bearer writer') return { id: 7, name: 'ada' };
      if (role === 'Bearer reader') return action === 'read' ? { id: 8, name: 'bob' } : null;
      return null;
    },
    ...overrides,
  });
  const call = (method, path, body, role = 'writer') =>
    handler(
      new Request(`https://app.example.com/api/email-builder${path}`, {
        method,
        headers: { authorization: `Bearer ${role}`, ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
    );
  return { handler, call };
}

test('route /brand: empty without a store, saved and cleaned with one, writers only', async () => {
  const bare = brandHandler();
  assert.deepEqual((await (await bare.call('GET', '/brand')).json()).data, {});
  const refused = await bare.call('PUT', '/brand', BRAND);
  assert.equal(refused.status, 501);
  assert.equal((await refused.json()).code, 'NO_BRAND_STORE');

  const repository = createMemoryBrandRepository();
  const { call } = brandHandler({ brandStore: repository });
  assert.equal((await call('PUT', '/brand', BRAND, 'reader')).status, 401);
  const saved = await call('PUT', '/brand', { ...BRAND, primary: 'rgb(233,30,99)', logoUrl: 'javascript:x', extra: 1 });
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).data, BRAND);
  assert.equal((await repository.get()).updatedBy, 'ada');
  assert.deepEqual((await (await call('GET', '/brand', null, 'reader')).json()).data, BRAND);
  assert.equal((await call('GET', '/brand', null, 'nobody')).status, 401);
  assert.equal((await createBrandService({ repository }).get()).primary, PINK);
});

test('route POST /brand/import: logo stored like an upload, nothing saved, errors in the server language, rate limited', async () => {
  assert.equal((await brandHandler().call('POST', '/brand/import', { url: 'acme.com' })).status, 501);

  const asked = [];
  const brandImporter = {
    async import(url, { signal } = {}) {
      asked.push([url, signal instanceof AbortSignal]);
      if (url === 'private') throw new BrandImportError('PRIVATE_ADDRESS', '10.0.0.1');
      if (url === 'blocked') throw new BrandImportError('HTTP_ERROR', '403');
      if (url === 'broken') throw new Error('bug');
      return {
        brand: { name: 'Acme', primary: PINK, website: 'https://acme.com/' },
        logo: { bytes: png(400, 100), width: 400, height: 100, type: 'image/png', ext: 'png', shownWidth: 180 },
        notes: ['LOGO_ICON'],
      };
    },
  };
  const repository = createMemoryBrandRepository();
  const { call } = brandHandler({ brandImporter, brandStore: repository, locale: 'fr', rateLimits: { brandImportsPerHour: 3 } });
  assert.equal((await call('POST', '/brand/import', { url: 'acme.com' }, 'reader')).status, 401);
  const response = await call('POST', '/brand/import', { url: 'acme.com' });
  assert.equal(response.status, 200);
  const { brand, notes } = (await response.json()).data;
  assert.match(brand.logoUrl, /^\/api\/email-builder\/assets\/[0-9a-f]{32}\.png$/);
  assert.equal(brand.logoWidth, 180);
  assert.deepEqual(notes, ['LOGO_ICON']);
  assert.deepEqual(asked[0], ['acme.com', true]);
  assert.equal(await repository.get(), null, 'the user looks at it before saving');
  const logo = await call('GET', brand.logoUrl.replace('/api/email-builder', ''), null, 'nobody');
  assert.equal(logo.status, 200, 'the logo is public, like any image');

  const privateAddress = await call('POST', '/brand/import', { url: 'private' });
  assert.equal(privateAddress.status, 400);
  const body = await privateAddress.json();
  assert.equal(body.code, 'BRAND_PRIVATE_ADDRESS');
  assert.doesNotMatch(body.error, /10\.0\.0\.1/, 'the address is not echoed');
  assert.notEqual(body.error, BRAND_IMPORT_ERRORS.PRIVATE_ADDRESS[1], 'translated');
  const blocked = await call('POST', '/brand/import', { url: 'blocked' });
  assert.equal(blocked.status, 422);
  assert.equal((await blocked.json()).code, 'BRAND_HTTP_ERROR');
  const broken = await brandHandler({ brandImporter, onError: () => {} }).call('POST', '/brand/import', { url: 'broken' });
  assert.equal(broken.status, 500);
  assert.equal((await call('POST', '/brand/import', { url: 'acme.com' })).status, 429);
});

test('storages: HTTP brand only when asked for, import optional; memory keeps the brand cleaned', async () => {
  const plain = createHttpStorage();
  assert.equal(plain.loadBrand, undefined);
  assert.equal(plain.importBrand, undefined);
  const seen = [];
  const fetch = async (url, init = {}) => {
    seen.push([url, init.method || 'GET', init.body, init.signal]);
    return new Response(JSON.stringify({ data: url.endsWith('/import') ? { brand: BRAND, notes: [] } : BRAND }), { status: 200 });
  };
  const storage = createHttpStorage({ brand: true, fetch });
  const signal = new AbortController().signal;
  assert.deepEqual(await storage.loadBrand(), BRAND);
  await storage.saveBrand(BRAND);
  assert.deepEqual((await storage.importBrand('acme.com', { signal })).brand, BRAND);
  assert.deepEqual(
    seen.map(([url, method, body]) => [url, method, body]),
    [
      ['/api/email-builder/brand', 'GET', undefined],
      ['/api/email-builder/brand', 'PUT', JSON.stringify(BRAND)],
      ['/api/email-builder/brand/import', 'POST', JSON.stringify({ url: 'acme.com' })],
    ]
  );
  assert.equal(seen[2][3], signal);
  assert.equal(createHttpStorage({ brand: { import: false }, fetch }).importBrand, undefined);

  const memory = createMemoryStorage({ brand: { primary: 'rgb(233,30,99)', font: 'Comic Sans' } });
  assert.deepEqual(await memory.loadBrand(), { primary: PINK });
  assert.deepEqual(await memory.saveBrand({ ...BRAND, evil: 1 }), BRAND);
  assert.deepEqual(await memory.loadBrand(), BRAND);
  assert.equal(memory.importBrand, undefined);
  const importBrand = async () => ({ brand: BRAND, notes: [] });
  assert.equal(createMemoryStorage({ importBrand }).importBrand, importBrand);
});

test('brandOf: read once per storage, {} when it fails or keeps none', async () => {
  let reads = 0;
  const storage = { loadBrand: async () => (reads++, { primary: 'rgb(233,30,99)' }) };
  assert.deepEqual(await brandOf(storage).loaded, { primary: PINK });
  assert.equal(brandOf(storage).value.primary, PINK);
  await brandOf(storage).loaded;
  assert.equal(reads, 1);
  assert.deepEqual(await brandOf({ loadBrand: async () => { throw new Error('down'); } }).loaded, {});
  assert.deepEqual(await brandOf({}).loaded, {});
});

test('AI generator: the brand is in the prompt, and the email comes out in its colors whatever the model chose', async () => {
  const prompt = buildUserPrompt({ purpose: null, details: 'Spring sale', brand: { primary: PINK, heading: '#1a1a2e', font: BRAND.font } });
  assert.match(prompt, /Brand \(use exactly these\):/);
  assert.match(prompt, new RegExp(`main color \\(buttons, banners, links\\): ${PINK}`));
  assert.match(prompt, /font-family="Georgia, Times, serif"/);
  assert.doesNotMatch(buildUserPrompt({ details: 'x' }), /Brand/);

  const mjml =
    '<mjml><mj-body><mj-section background-color="#ffffff"><mj-column>' +
    '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="28px" font-weight="bold" color="#000000">Spring sale</mj-text>' +
    '<mj-button href="https://example.com" background-color="#2977bc" color="#ffffff" font-family="Arial, Helvetica, sans-serif">Shop</mj-button>' +
    '</mj-column></mj-section><mj-section><mj-column><mj-text font-family="Arial, Helvetica, sans-serif" font-size="12px" color="#6d7484">' +
    'Shop · [Company address]<br /><a href="{{ unsubscribe }}" style="color:#6d7484;">Unsubscribe</a></mj-text></mj-column></mj-section></mj-body></mjml>';
  const requests = [];
  const generator = createEmailGenerator({
    model: async (request) => {
      requests.push(request.messages[0].content);
      return JSON.stringify({ name: 'Sale', subject: 'Spring sale', preheader: 'Ten days of offers on the whole shop.', mjml });
    },
  });
  const email = await generator.generate({ details: 'Spring sale', brand: { ...BRAND, primary: 'not a color', logoUrl: LOGO } });
  assert.doesNotMatch(requests[0], /not a color|logo\.png/);
  const blue = await generator.generate({ details: 'Spring sale', brand: BRAND });
  const button = nodesOf(blue.mjml).find((n) => n.tag === 'mj-button');
  assert.equal(button.attributes['background-color'], PINK);
  assert.equal(nodesOf(blue.mjml).find((n) => n.tag === 'mj-text').attributes.color, '#1a1a2e');
  assert.match(email.mjml, /#2977bc/, 'without a main color the model\'s own stays');
});
