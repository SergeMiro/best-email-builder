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
