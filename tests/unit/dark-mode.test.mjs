/**
 * DARK MODE, simulated on the compiled email: light surfaces darkened, dark
 * text lightened, brand colors, light text and images left alone — on a
 * real MJML compilation, not only on hand-written strings.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileMjml } from '../../src/server/index.js';
import { DARK_PAGE, darkColor, darkCss, luminance, parseCssColor, simulateDarkMode } from '../../src/features/preview/darkMode.js';

const lum = (token) => luminance(parseCssColor(token));

test('parseCssColor: hex (3, 4, 6, 8 digits), rgb/rgba with commas or spaces, a few names', () => {
  assert.deepEqual(parseCssColor('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseCssColor('#E91E63'), { r: 233, g: 30, b: 99, a: 1 });
  assert.deepEqual(parseCssColor('#0000'), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(parseCssColor('#00000080').a.toFixed(2), '0.50');
  assert.deepEqual(parseCssColor('rgba(0, 0, 0, 0.5)'), { r: 0, g: 0, b: 0, a: 0.5 });
  assert.deepEqual(parseCssColor('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor('White'), { r: 255, g: 255, b: 255, a: 1 });
  assert.equal(parseCssColor('transparent'), null);
  assert.equal(parseCssColor('inherit'), null);
});

test('darkColor: light surfaces go dark, dark text goes light; brand colors and white text stay', () => {
  assert.equal(darkColor('#ffffff', 'surface'), DARK_PAGE);
  assert.ok(lum(darkColor('#eceff4', 'surface')) < 0.03, 'a pale page background turns dark');
  // A pale pink stays pink: the hue is kept.
  const rose = parseCssColor(darkColor('#fde4ec', 'surface'));
  assert.ok(rose.r > rose.g && luminance(rose) < 0.05);
  assert.equal(darkColor('#e91e63', 'surface'), '#e91e63', 'a brand button keeps its color');
  assert.equal(darkColor('#212e5a', 'surface'), '#212e5a');
  assert.ok(lum(darkColor('#000000', 'text')) > 0.75, 'black text turns light');
  assert.ok(lum(darkColor('#2b3038', 'text')) > 0.7);
  const heading = parseCssColor(darkColor('#212e5a', 'text'));
  assert.ok(heading.b > heading.r, 'a navy heading becomes a light blue, not a grey');
  assert.equal(darkColor('#ffffff', 'text'), '#ffffff', 'white text on a button stays');
  assert.match(darkColor('rgba(255,255,255,0.5)', 'surface'), /^rgba\(\d+, \d+, \d+, 0\.5\)$/);
  assert.equal(darkColor('transparent', 'surface'), 'transparent');
});

test('darkCss: only color properties, url() and other properties untouched', () => {
  assert.equal(
    darkCss('color:#000;background:#fff url(https://x.example/#fff.png) no-repeat;border-top:1px solid #eeeeee;border-radius:4px'),
    `color:#e8e8e8;background:${DARK_PAGE} url(https://x.example/#fff.png) no-repeat;border-top:1px solid #1f1f1f;border-radius:4px`
  );
  assert.equal(darkCss('font-family:Georgia, "Times New Roman"; background-image:url(white.png)'), 'font-family:Georgia, "Times New Roman"; background-image:url(white.png)');
  assert.equal(darkCss('@media (prefers-color-scheme: dark) { .a { color: black } }'), '@media (prefers-color-scheme: dark) { .a { color: #e8e8e8 } }');
});

test('simulateDarkMode: style attributes, sheets and bgcolor; the apps’ own page under it; words untouched', () => {
  const html =
    '<html><head><title>x</title><style>.t{color:#333}</style></head>' +
    '<body style="background-color:#ffffff"><table bgcolor="#FFFFFF"><tr><td style="color:#000000">The color: black stays in words.</td></tr></table></body></html>';
  const dark = simulateDarkMode(html);
  assert.match(dark, /<head><style data-eb-dark>:root\{color-scheme:dark\}/);
  assert.match(dark, new RegExp(`<body style="background-color:${DARK_PAGE}">`));
  assert.match(dark, new RegExp(`bgcolor="${DARK_PAGE}"`));
  assert.match(dark, /\.t\{color:#[0-9a-f]{6}\}/);
  assert.doesNotMatch(dark, /\.t\{color:#333\}/);
  assert.ok(dark.includes('The color: black stays in words.'));
  assert.equal(simulateDarkMode(''), '');
  assert.ok(simulateDarkMode('<p style="color:#000">Hi</p>').startsWith('<style data-eb-dark>'));
});

test('simulateDarkMode on a compiled email: the page darkens, the text lightens, the button keeps its brand color', async () => {
  const mjml =
    '<mjml><mj-body background-color="#eceff4"><mj-section background-color="#ffffff"><mj-column>' +
    '<mj-text color="#2b3038">Hello</mj-text>' +
    '<mj-button background-color="#e91e63" color="#ffffff" href="https://example.com">Go</mj-button>' +
    '</mj-column></mj-section></mj-body></mjml>';
  const { html } = await compileMjml(mjml);
  const dark = simulateDarkMode(html);
  assert.match(html, /background(?:-color)?:#ffffff/i);
  assert.doesNotMatch(dark, /background(?:-color)?:#ffffff/i, 'no white section left');
  assert.doesNotMatch(dark, /background(?:-color)?:#eceff4/i);
  assert.doesNotMatch(dark, /color:#2b3038/i);
  assert.match(dark, /background:#e91e63/i);
  assert.match(dark, /bgcolor="#e91e63"/i);
  // White text on the button is still white.
  assert.match(dark, /color:#ffffff/i);
});

/** The colors `simulateDarkMode` gave the first element matching `selector`-ish text: its style attribute. */
const styleOf = (html, marker) => new RegExp(`<[^>]*${marker}[^>]*>`).exec(html)?.[0] ?? '';
const colorIn = (tag, property) => new RegExp(`(?:^|[;"\\s])${property}\\s*:\\s*([^;"]+)`).exec(tag)?.[1]?.trim();
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test('text is decided against the background it sits on: dark text on a mid-tone button or banner stays readable', () => {
  for (const [background, text] of [
    ['#ff9800', '#1a1a1a'],
    ['#4caf50', '#000000'],
    ['#00bcd4', '#000000'],
    ['#aaaaaa', '#000000'],
    ['#ffd400', '#222222'],
  ]) {
    // On the element itself (an MJML button's link carries both)…
    const own = simulateDarkMode(`<a data-x style="background:${background};color:${text}">Go</a>`);
    const tag = styleOf(own, 'data-x');
    const [bg, fg] = [colorIn(tag, 'background'), colorIn(tag, 'color')];
    assert.ok(ratio(bg, fg) >= 4.5, `${text} on ${background}: ${fg} on ${bg} (${ratio(bg, fg).toFixed(2)})`);
    // …and on an ancestor (a section's color, the text's own in a nested block).
    const nested = simulateDarkMode(
      `<table bgcolor="${background}"><tr><td><div><p data-y style="color:${text}">Hi</p></div></td></tr></table>`
    );
    const behind = /bgcolor="([^"]+)"/.exec(nested)[1];
    const front = colorIn(styleOf(nested, 'data-y'), 'color');
    assert.ok(ratio(behind, front) >= 4.5, `${text} under ${background}: ${front} on ${behind}`);
  }
  // Dark text on what turned dark still turns light; light text on a dark brand color stays.
  const page = simulateDarkMode('<table bgcolor="#ffffff"><tr><td style="color:#2B3038">Hi</td></tr></table>');
  assert.ok(lum(colorIn(styleOf(page, 'td'), 'color')) > 0.7, 'uppercase hex read too');
  assert.match(simulateDarkMode('<a style="background:#212e5a;color:#ffffff">Go</a>'), /color:#ffffff/);
  // A sibling does not inherit the background of the cell before it (implied end tags too).
  const cells = simulateDarkMode('<table><tr><td bgcolor="#ff9800"><p>A<td><p data-z style="color:#000000">B</table>');
  assert.ok(lum(colorIn(styleOf(cells, 'data-z'), 'color')) > 0.7, 'the second cell sits on the dark page');
});

test('lines: a light border darkens, a dark divider on the dark page turns light', async () => {
  assert.equal(darkColor('#eeeeee', 'line'), darkColor('#eeeeee', 'surface'));
  assert.ok(lum(darkColor('#000000', 'line')) > 0.7);
  assert.equal(darkColor('#000000', 'line', '#ff9800'), '#000000', 'a dark line on a light enough surface stays');
  const { html } = await compileMjml('<mjml><mj-body><mj-section background-color="#ffffff"><mj-column><mj-divider /></mj-column></mj-section></mj-body></mjml>');
  assert.match(html, /border-top:\s*solid 4px #000000/);
  const dark = simulateDarkMode(html);
  const divider = /border-top:\s*solid 4px (#[0-9a-f]{6})/.exec(dark)?.[1];
  assert.ok(divider && ratio(divider, DARK_PAGE) > 4.5, `divider ${divider}`);
});

test('legacy attributes: <font color>, <body text>, bgcolor without # or with spaces', () => {
  const dark = simulateDarkMode(
    '<body text="#000" link="#000080"><font color="#000000">Hi</font><table bgcolor="FFFFFF"><tr><td bgcolor=" #ffffff ">x</td><td bgcolor=#fff>y</td></tr></table></body>'
  );
  assert.doesNotMatch(dark, /color="#000000"|text="#000"|link="#000080"/);
  assert.ok(lum(/<font color="([^"]+)"/.exec(dark)[1]) > 0.7);
  assert.ok(lum(/text="([^"]+)"/.exec(dark)[1]) > 0.7);
  assert.equal(dark.match(new RegExp(`bgcolor="${DARK_PAGE}"`, 'g'))?.length, 2);
  assert.match(dark, new RegExp(`bgcolor=${DARK_PAGE}>`), 'an unquoted value stays unquoted');
  // An alpha color in an unquoted attribute gets no space that would cut it.
  assert.match(simulateDarkMode('<td bgcolor=#ffffff80>x</td>'), /bgcolor=rgba\(\d+,\d+,\d+,0\.5\)>/);
  // Not a color: as it is.
  assert.equal(simulateDarkMode('<td bgcolor="brand">x</td>').replace(/<style data-eb-dark>.*?<\/style>/, ''), '<td bgcolor="brand">x</td>');
});

test('css: hsl(), !important, url(data:…) and named colors in words', () => {
  assert.ok(lum(darkCss('color:hsl(220, 20%, 15%)').split(':')[1]) > 0.7);
  assert.equal(darkCss('background-color:hsla(0, 0%, 100%, 1)'), `background-color:${DARK_PAGE}`);
  assert.equal(darkCss('color:#000 !important'), 'color:#e8e8e8 !important');
  const data = 'background:url(data:image/png;base64,iVBORw0KGgo=) no-repeat';
  assert.equal(darkCss(data), data);
  assert.equal(darkCss('font-family:"Black Han Sans", sans-serif'), 'font-family:"Black Han Sans", sans-serif');
});

test('where the apps’ sheet goes: in the real <head>, else after <html> or the doctype; comments left alone', () => {
  const doctype = simulateDarkMode('<!doctype html><body style="color:#000">x</body>');
  assert.ok(doctype.startsWith('<!doctype html><style data-eb-dark>'), 'never before the doctype (quirks mode)');
  const html = simulateDarkMode('<html lang="en"><body>x</body></html>');
  assert.ok(html.startsWith('<html lang="en"><style data-eb-dark>'));
  const commented = simulateDarkMode('<!-- <head> --><html><head><title>t</title></head><body>x</body></html>');
  assert.ok(commented.startsWith('<!-- <head> --><html><head><style data-eb-dark>'), commented.slice(0, 80));
  const mso = '<!--[if mso]><table bgcolor="#ffffff" style="color:#000"><tr><td><![endif]-->';
  assert.ok(simulateDarkMode(`<html><head></head><body>${mso}</body></html>`).includes(mso));
});

test('safety: only colors change — same tags, same attributes, no quote added, one sheet — on every gallery template', async () => {
  const { buildGallery } = await import('../../src/features/templates/gallery.js');
  const tags = (html) => [...html.matchAll(/<(\/?[a-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi)].map((m) => [m[1].toLowerCase(), [...m[2].matchAll(/\s([^\s=/>"']+)\s*=/g)].map((a) => a[1]).join(' ')].join(' '));
  const quotes = (html) => (html.match(/["']/g) || []).length;
  const gallery = buildGallery({ sender: { name: 'Example Inc.', address: '1 Main Street' } });
  assert.ok(gallery.length >= 5);
  for (const template of gallery) {
    const { html } = await compileMjml(template.mjml);
    const dark = simulateDarkMode(html);
    const sheet = /<style data-eb-dark>[^<]*<\/style>/.exec(dark)[0];
    assert.equal(dark.split('data-eb-dark').length, 2, template.id);
    const without = dark.replace(sheet, '');
    assert.deepEqual(tags(without), tags(html), template.id);
    assert.equal(quotes(without), quotes(html), template.id);
    assert.ok(without.length > html.length * 0.95 && without.length < html.length * 1.05, template.id);
    // The words the reader reads are the same.
    const words = (s) => s.replace(/<style[\s\S]*?<\/style>|<[^>]*>/gi, ' ').replace(/\s+/g, ' ');
    assert.equal(words(without), words(html), template.id);
  }
});
