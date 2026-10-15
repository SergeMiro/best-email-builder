// @ts-check
/**
 * DARK MODE, simulated — an email as the mail apps that repaint it in dark
 * mode show it (Gmail and Outlook apps, Outlook.com): light backgrounds
 * turned dark, dark text turned light, everything else left as it is.
 *
 *   surfaces   background and border colors (`background`, `bgcolor`,
 *              `border-color`…): a LIGHT one becomes dark, same hue; a dark
 *              or saturated one (a brand button) stays.
 *   text       `color`: a DARK one becomes light, same hue; a light one
 *              (white on a button) stays.
 *   images     untouched: a dark logo on a transparent background disappears
 *              here as it does in those apps — what the preview is for.
 *
 * Works on the compiled HTML as a string: the colors of `style` attributes,
 * of `<style>` sheets and of `bgcolor`. No script, no DOM: the preview frame
 * stays sandboxed.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

/** The page behind the email, and its default text, in dark apps. */
export const DARK_PAGE = '#121212';
const DARK_TEXT = '#e8e8e8';

/** A few named colors emails use. */
const NAMED = {
  white: '#ffffff',
  black: '#000000',
  snow: '#fffafa',
  ivory: '#fffff0',
  whitesmoke: '#f5f5f5',
  ghostwhite: '#f8f8ff',
  gainsboro: '#dcdcdc',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  silver: '#c0c0c0',
  gray: '#808080',
  grey: '#808080',
  navy: '#000080',
};

/** @typedef {{r: number, g: number, b: number, a: number}} Rgba  channels 0–255, alpha 0–1 */

/** @param {string} token @returns {Rgba|null} */
export function parseCssColor(token) {
  const value = token.trim().toLowerCase();
  const hex = NAMED[/** @type {keyof typeof NAMED} */ (value)] || value;
  let match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(hex);
  if (match) {
    let digits = match[1];
    if (digits.length <= 4) digits = [...digits].map((d) => d + d).join('');
    const n = (/** @type {number} */ i) => parseInt(digits.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
  }
  match = /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
  if (match) {
    const channel = (/** @type {string} */ v) => Math.min(255, v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v));
    const alpha = match[4] === undefined ? 1 : match[4].endsWith('%') ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
    return { r: channel(match[1]), g: channel(match[2]), b: channel(match[3]), a: Math.min(1, alpha) };
  }
  return null;
}

/** WCAG relative luminance, 0 (black) to 1 (white). @param {Rgba} color */
export function luminance({ r, g, b }) {
  const linear = (/** @type {number} */ c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** @param {Rgba} color @returns {[number, number, number]} hue 0–360, saturation and lightness 0–1 */
function toHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}

/** @param {number} h @param {number} s @param {number} l @param {number} a */
function fromHsl(h, s, l, a) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const q = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => Math.round(255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  const [r, g, b] = [f(0), f(8), f(4)];
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * One color in dark mode. `surface`: a background or a border; otherwise a
 * text color. Unknown values (`transparent`, `inherit`…) come back as given.
 * @param {string} token @param {'surface'|'text'} role
 */
export function darkColor(token, role) {
  const color = parseCssColor(token);
  if (!color) return token;
  const lum = luminance(color);
  const [h, s] = toHsl(color);
  if (role === 'surface') {
    // White becomes the dark apps' page; a pale tint a dark one of its hue.
    return lum > 0.45 ? fromHsl(h, s * 0.5, 0.07 + (1 - lum) * 0.35, color.a) : token;
  }
  return lum < 0.3 ? fromHsl(h, s * 0.7, 0.91 - lum * 0.5, color.a) : token;
}

const COLOR_TOKEN = new RegExp(`url\\([^)]*\\)|(#[0-9a-f]{3,8}\\b|rgba?\\([^)]*\\)|\\b(?:${Object.keys(NAMED).join('|')})\\b)`, 'gi');
const COLOR_PROPERTY =
  /(^|[;{\s])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?)(\s*:\s*)([^;}]*)/gi;

/** The colors of a CSS text (a sheet, or a `style` attribute) in dark mode. @param {string} css */
export function darkCss(css) {
  return css.replace(COLOR_PROPERTY, (_, before, property, colon, value) => {
    const role = property.toLowerCase() === 'color' ? 'text' : 'surface';
    const changed = value.replace(COLOR_TOKEN, (/** @type {string} */ whole, /** @type {string} */ color) =>
      color ? darkColor(color, role) : whole
    );
    return `${before}${property}${colon}${changed}`;
  });
}

const DARK_SHEET = `<style data-eb-dark>:root{color-scheme:dark}html,body{background-color:${DARK_PAGE};color:${DARK_TEXT}}</style>`;

/**
 * A compiled email as a dark-mode app would show it.
 * @param {string} html
 */
export function simulateDarkMode(html) {
  if (!html) return '';
  const recolored = String(html)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, css, close) => open + darkCss(css) + close)
    .replace(/(\sstyle\s*=\s*)(["'])([\s\S]*?)\2/gi, (_, attr, quote, css) => attr + quote + darkCss(css) + quote)
    .replace(/(\sbgcolor\s*=\s*)(["']?)([#\w]+)\2/gi, (_, attr, quote, color) => attr + quote + darkColor(color, 'surface') + quote);
  // The apps' own page and text, under whatever the email sets itself.
  return /<head\b[^>]*>/i.test(recolored) ? recolored.replace(/<head\b[^>]*>/i, (head) => head + DARK_SHEET) : DARK_SHEET + recolored;
}
