// @ts-check
/**
 * DARK MODE, simulated — an email as the mail apps that repaint it in dark
 * mode show it (Gmail and Outlook apps, Outlook.com): light backgrounds
 * turned dark, dark text turned light where it would no longer read,
 * everything else left as it is.
 *
 *   surfaces   background colors (`background`, `bgcolor`…): a LIGHT one
 *              becomes dark, same hue; a darker one (a brand button, an
 *              orange banner) stays.
 *   text       `color`, `<font color>`, `<body text>`: decided against the
 *              background it sits on, once that one is repainted. Dark text
 *              on what became dark turns light, same hue; dark text on a
 *              background that stayed light enough (black on an orange
 *              button) stays; light text stays.
 *   lines      border and outline colors: a light one darkens like a
 *              surface, a dark one is decided like text (a black divider on
 *              the dark page turns light).
 *   images     untouched: a dark logo on a transparent background disappears
 *              here as it does in those apps — what the preview is for.
 *
 * Works on the compiled HTML as a string, tag by tag, keeping which
 * background each element sits on: the colors of `style` attributes, of
 * `bgcolor`/`color`/`text` attributes and of `<style>` sheets (where the
 * background is not known: the dark page). Comments are left alone (Outlook's
 * conditional blocks). No script, no DOM: the preview frame stays sandboxed.
 * Only color values change; tags and attribute names stay as they are.
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

/** @param {string} v a number or a percentage of `max` */
const amount = (v, max) => (v.endsWith('%') ? (parseFloat(v) * max) / 100 : parseFloat(v));

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
    const channel = (/** @type {string} */ v) => Math.min(255, amount(v, 255));
    const alpha = match[4] === undefined ? 1 : amount(match[4], 1);
    return { r: channel(match[1]), g: channel(match[2]), b: channel(match[3]), a: Math.min(1, alpha) };
  }
  match = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(value);
  if (match) {
    const alpha = match[4] === undefined ? 1 : Math.min(1, amount(match[4], 1));
    const s = Math.min(100, parseFloat(match[2])) / 100;
    const l = Math.min(100, parseFloat(match[3])) / 100;
    return { ...rgbOfHsl(parseFloat(match[1]) % 360, s, l), a: alpha };
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

/** WCAG contrast ratio, 1 to 21. @param {Rgba} a @param {Rgba} b */
export function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
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

/** @param {number} h @param {number} s @param {number} l */
function rgbOfHsl(h, s, l) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const q = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => Math.round(255 * (l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return { r: f(0), g: f(8), b: f(4) };
}

/** @param {number} h @param {number} s @param {number} l @param {number} a */
function fromHsl(h, s, l, a) {
  const { r, g, b } = rgbOfHsl(h, s, l);
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** `top` painted over `bottom`. @param {Rgba} top @param {Rgba} bottom @returns {Rgba} */
function over(top, bottom) {
  const mix = (/** @type {'r'|'g'|'b'} */ c) => top[c] * top.a + bottom[c] * (1 - top.a);
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}

const PAGE = /** @type {Rgba} */ (parseCssColor(DARK_PAGE));

/** A light surface in dark mode, or the color as given. @param {string} token @param {Rgba} color */
function darkSurface(token, color) {
  const lum = luminance(color);
  const [h, s] = toHsl(color);
  // White becomes the dark apps' page; a pale tint a dark one of its hue.
  return lum > 0.45 ? fromHsl(h, s * 0.5, 0.07 + (1 - lum) * 0.35, color.a) : token;
}

/** A text color in dark mode, on `background` (already repainted). @param {string} token @param {Rgba} color @param {Rgba} background */
function darkText(token, color, background) {
  if (luminance(color) >= 0.3) return token;
  const [h, s] = toHsl(color);
  const lightened = fromHsl(h, s * 0.7, 0.91 - luminance(color) * 0.5, color.a);
  // Kept where it already reads better than the light one would (black on an orange button).
  const solid = over(color, background);
  return contrast(solid, background) >= contrast(over(/** @type {Rgba} */ (parseCssColor(lightened)), background), background) ? token : lightened;
}

/**
 * One color in dark mode. `surface`: a background; `text`: a text color;
 * `line`: a border. Text and lines are decided against `background` (the
 * repainted one behind them; the dark page by default). Unknown values
 * (`transparent`, `inherit`…) come back as given.
 * @param {string} token @param {'surface'|'text'|'line'} role @param {string|Rgba} [background]
 */
export function darkColor(token, role, background = PAGE) {
  const color = parseCssColor(token);
  if (!color) return token;
  if (role === 'surface') return darkSurface(token, color);
  const behind = typeof background === 'string' ? parseCssColor(background) || PAGE : background;
  if (role === 'line' && luminance(color) > 0.45) return darkSurface(token, color);
  return darkText(token, color, behind);
}

const COLOR = `#[0-9a-f]{3,8}\\b|(?:rgba?|hsla?)\\([^)]*\\)|\\b(?:${Object.keys(NAMED).join('|')})\\b`;
const COLOR_TOKEN = new RegExp(`url\\([^)]*\\)|(${COLOR})`, 'gi');
const COLOR_PROPERTY =
  /(^|[;{\s])(color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?)(\s*:\s*)([^;}]*)/gi;

/** @param {string} property @returns {'surface'|'text'|'line'} */
const roleOf = (property) => {
  const name = property.toLowerCase();
  return name === 'color' ? 'text' : name.startsWith('background') ? 'surface' : 'line';
};

/**
 * The declarations of one rule or `style` attribute in dark mode, and the
 * background they paint (repainted, over `behind`), or null.
 * @param {string} css @param {Rgba} behind
 */
function darkDeclarations(css, behind) {
  /** @type {Rgba|null} */
  let painted = null;
  for (const match of css.matchAll(COLOR_PROPERTY)) {
    if (roleOf(match[2]) !== 'surface') continue;
    for (const token of match[4].matchAll(COLOR_TOKEN)) {
      const color = token[1] && parseCssColor(darkColor(token[1], 'surface'));
      if (color) {
        painted = over(color, behind);
        break;
      }
    }
  }
  const background = painted || behind;
  const out = css.replace(COLOR_PROPERTY, (_, before, property, colon, value) => {
    const role = roleOf(property);
    const changed = value.replace(COLOR_TOKEN, (/** @type {string} */ whole, /** @type {string} */ color) =>
      color ? darkColor(color, role, background) : whole
    );
    return `${before}${property}${colon}${changed}`;
  });
  return { css: out, background: painted };
}

/**
 * The colors of a CSS text in dark mode: a `style` attribute's declarations,
 * or a sheet (each rule on its own; behind it, the dark page).
 * @param {string} css @param {string|Rgba} [background]
 */
export function darkCss(css, background = PAGE) {
  const behind = typeof background === 'string' ? parseCssColor(background) || PAGE : background;
  if (!css.includes('{')) return darkDeclarations(css, behind).css;
  return css.replace(/\{([^{}]*)\}/g, (_, body) => `{${darkDeclarations(body, behind).css}}`);
}

const DARK_SHEET = `<style data-eb-dark>:root{color-scheme:dark}html,body{background-color:${DARK_PAGE};color:${DARK_TEXT}}</style>`;

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<!doctype[^>]*>|<(\/?)([a-z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTRIBUTE = /(\s)([^\s=/>"']+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'>]+)/g;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
/** Elements whose end tag HTML lets a next one imply: what it closes, and up to which container. */
const CELL = { closes: ['td', 'th'], within: ['tr', 'table'] };
const IMPLIED_END = {
  td: CELL,
  th: CELL,
  tr: { closes: ['tr'], within: ['table', 'tbody', 'thead', 'tfoot'] },
  li: { closes: ['li'], within: ['ul', 'ol'] },
  p: { closes: ['p'], within: ['div', 'td', 'th', 'li', 'table', 'body'] },
  option: { closes: ['option'], within: ['select'] },
};
/** Legacy attributes holding a text color. */
const TEXT_ATTRIBUTES = new Set(['color', 'text', 'link', 'vlink', 'alink']);

/** A legacy attribute color: `FFFFFF` (no #) is still a color there. @param {string} value */
const attributeColor = (value) => {
  const trimmed = value.trim();
  return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? `#${trimmed}` : trimmed;
};

/**
 * One opening tag in dark mode, on `behind`; and the background it paints.
 * @param {string} attributes @param {Rgba} behind
 */
function darkTag(attributes, behind) {
  /** @type {{name: string, value: string, quote: string}[]} */
  const parsed = [];
  for (const match of attributes.matchAll(ATTRIBUTE)) {
    const raw = match[4];
    const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : '';
    parsed.push({ name: match[2].toLowerCase(), value: quote ? raw.slice(1, -1) : raw, quote });
  }
  const bgcolor = parsed.find((a) => a.name === 'bgcolor');
  const legacy = bgcolor && parseCssColor(darkColor(attributeColor(bgcolor.value), 'surface'));
  // `style` paints over `bgcolor`, which paints over what is behind.
  const base = legacy ? over(legacy, behind) : behind;
  const style = parsed.find((a) => a.name === 'style');
  const declared = style ? darkDeclarations(style.value, base) : null;
  const painted = declared?.background || (legacy ? base : null);
  const background = painted || behind;

  const out = attributes.replace(ATTRIBUTE, (whole, space, name, equals, raw) => {
    const key = name.toLowerCase();
    const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : '';
    const value = quote ? raw.slice(1, -1) : raw;
    let next = value;
    if (key === 'style') next = darkDeclarations(value, base).css;
    else if (key === 'bgcolor') next = recolorAttribute(value, 'surface', behind);
    else if (TEXT_ATTRIBUTES.has(key)) next = recolorAttribute(value, 'text', background);
    if (next === value) return whole;
    // An unquoted value gets no space (`rgba(…)` written without one).
    return `${space}${name}${equals}${quote}${quote ? next : next.replace(/\s+/g, '')}${quote}`;
  });
  return { attributes: out, background: painted };
}

/** @param {string} value @param {'surface'|'text'} role @param {Rgba} background */
function recolorAttribute(value, role, background) {
  const color = attributeColor(value);
  if (!parseCssColor(color)) return value;
  const changed = darkColor(color, role, background);
  return changed === color ? value : changed;
}

/**
 * A compiled email as a dark-mode app would show it.
 * @param {string} html
 */
export function simulateDarkMode(html) {
  if (!html) return '';
  const source = String(html);
  /** @type {{tag: string, background: Rgba}[]} */
  const stack = [];
  const behind = () => stack.at(-1)?.background || PAGE;
  /** Where the apps' sheet goes: after <head>, else after <html>, else after the doctype. */
  let sheetAt = -1;
  let sheetRank = 0;
  let out = '';
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(source); match; match = TOKEN.exec(source)) {
    const [whole, closing, rawName, attributes] = match;
    out += source.slice(last, match.index);
    last = match.index + whole.length;
    if (!rawName) {
      // A comment or the doctype: as it is.
      out += whole;
      if (/^<!doctype/i.test(whole) && sheetRank < 1) [sheetAt, sheetRank] = [out.length, 1];
      continue;
    }
    const tag = rawName.toLowerCase();
    if (closing) {
      const at = stack.findLastIndex((entry) => entry.tag === tag);
      if (at !== -1) stack.length = at;
      out += whole;
      continue;
    }
    const implied = IMPLIED_END[/** @type {keyof typeof IMPLIED_END} */ (tag)];
    if (implied) {
      const open = stack.findLastIndex((entry) => implied.closes.includes(entry.tag));
      if (open > stack.findLastIndex((entry) => implied.within.includes(entry.tag))) stack.length = open;
    }
    const { attributes: changed, background } = darkTag(attributes, behind());
    out += `<${rawName}${changed}>`;
    if (tag === 'head' && sheetRank < 3) [sheetAt, sheetRank] = [out.length, 3];
    if (tag === 'html' && sheetRank < 2) [sheetAt, sheetRank] = [out.length, 2];
    if (tag === 'style' || tag === 'script' || tag === 'title' || tag === 'textarea') {
      // Raw text up to its end tag: a sheet is recolored, the rest kept.
      const end = source.slice(last).search(new RegExp(`</${tag}\\s*>`, 'i'));
      const body = end === -1 ? source.slice(last) : source.slice(last, last + end);
      out += tag === 'style' ? darkCss(body) : body;
      last += body.length;
      TOKEN.lastIndex = last;
      continue;
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attributes)) stack.push({ tag, background: background || behind() });
  }
  out += source.slice(last);
  // The apps' own page and text, under whatever the email sets itself.
  return sheetAt === -1 ? DARK_SHEET + out : out.slice(0, sheetAt) + DARK_SHEET + out.slice(sheetAt);
}
