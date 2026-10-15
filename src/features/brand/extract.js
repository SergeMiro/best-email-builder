// @ts-check
/**
 * BRAND FROM A WEBSITE — what a company's home page says about its look:
 * its name, where its logo is, its main color, the color of its headings
 * and its font.
 *
 * Pure text work on what the server downloaded (src/server/brandImport.js
 * does the downloading, with its safety rules): no network, no DOM, so it
 * runs anywhere and is tested on fixtures.
 *
 *   name     og:site_name → JSON-LD Organization → application-name → the
 *            part of <title> that matches the domain → the domain;
 *   logo     JSON-LD Organization logo → an <img> called "logo" (header
 *            first) → apple-touch-icon; SVG and WebP are skipped later
 *            (most email apps do not show them);
 *   colors   counted in the CSS, weighted by where they are used (buttons,
 *            links, custom properties named primary/brand/accent, the
 *            theme-color meta); grays, alert and social colors set aside;
 *   font     the body's, mapped to the nearest web-safe stack.
 */

import { FONT_OPTIONS, PALETTE } from '../../blocks/shared.js';
import { contrastRatio, parseColor, toHex, toHsl } from './brand.js';

/**
 * @typedef {{
 *   name: string,
 *   logos: {url: string, from: 'schema'|'img'|'icon'}[],
 *   stylesheets: string[],
 *   css: string,
 *   themeColor: string,
 * }} PageReading
 */

/* ── HTML ───────────────────────────────────────────────────────────────── */

/** @param {string} text */
function decodeEntities(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * The attributes of one start tag, names in lower case.
 * @param {string} tag  `<img src="…" class=logo>`
 * @returns {Record<string, string>}
 */
export function tagAttributes(tag) {
  /** @type {Record<string, string>} */
  const attributes = {};
  const inner = tag.replace(/^<[^\s>/]+/, '').replace(/\/?>$/, '');
  const pattern = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(inner))) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
}

/** @param {string} html @param {string} name */
const startTags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || [];

/** An http(s) address, resolved against the page; '' otherwise. @param {string|undefined} href @param {string} base */
function resolve(href, base) {
  const value = String(href ?? '').trim();
  if (!value || /^(data|javascript|blob):/i.test(value)) return '';
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** The largest image of a srcset ("a.png 1x, a@2x.png 2x"). @param {string} srcset */
function largestOf(srcset) {
  let best = { url: '', size: 0 };
  for (const part of srcset.split(/,\s+/)) {
    const [url, descriptor = '1x'] = part.trim().split(/\s+/);
    const size = parseFloat(descriptor) * (descriptor.endsWith('w') ? 1 : 1000);
    if (url && size > best.size) best = { url, size };
  }
  return best.url;
}

/** Objects of a JSON-LD script, flattened (@graph, arrays). @param {unknown} value @returns {any[]} */
function jsonLdNodes(value) {
  if (Array.isArray(value)) return value.flatMap(jsonLdNodes);
  if (!value || typeof value !== 'object') return [];
  const node = /** @type {any} */ (value);
  return [node, ...jsonLdNodes(node['@graph']), ...jsonLdNodes(node.publisher), ...jsonLdNodes(node.brand)];
}

const ORGANIZATION = /organization|corporation|business|brand|store|restaurant|company|ngo|school|airline|bank|agency/i;

/** The words of a host name that name the company: "www.acme-corp.co.uk" → "acme corp". @param {string} host */
function hostWords(host) {
  const labels = host.toLowerCase().replace(/^www\d?\./, '').split('.');
  const main = labels.length > 2 && labels[labels.length - 2].length <= 3 ? labels[labels.length - 3] : labels[0];
  return main.replace(/[-_]+/g, ' ');
}

/** @param {string} text */
const squash = (text) => text.toLowerCase().replace(/[^a-z0-9À-￿]+/g, '');

/** @param {unknown} value */
const cleanName = (value) =>
  decodeEntities(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

/**
 * What a home page says about its brand.
 * @param {string} html
 * @param {string} pageUrl  the address it was read from (after redirects)
 * @returns {PageReading}
 */
export function readPage(html, pageUrl) {
  const source = String(html ?? '');
  const head = source.slice(0, 400_000);
  const baseTag = startTags(head, 'base').map(tagAttributes).find((a) => a.href);
  const base = resolve(baseTag?.href, pageUrl) || pageUrl;
  const host = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return '';
    }
  })();

  /** @type {Record<string, string>} */
  const meta = {};
  for (const attributes of startTags(head, 'meta').map(tagAttributes)) {
    const key = (attributes.property || attributes.name || '').toLowerCase();
    if (key && attributes.content && !(key in meta)) meta[key] = attributes.content;
  }

  // JSON-LD: the organization's own name and logo, when the site states them.
  let schemaName = '';
  let schemaLogo = '';
  for (const [, body] of source.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try {
      data = JSON.parse(body.trim());
    } catch {
      continue;
    }
    for (const node of jsonLdNodes(data)) {
      const types = [].concat(node['@type'] || []).join(' ');
      if (!ORGANIZATION.test(types)) continue;
      if (!schemaName && typeof node.name === 'string') schemaName = node.name;
      const logo = typeof node.logo === 'string' ? node.logo : node.logo?.url || node.logo?.contentUrl || '';
      if (!schemaLogo && typeof logo === 'string') schemaLogo = resolve(logo, base);
    }
  }

  /* Name */
  const title = cleanName(head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  const words = hostWords(host);
  const fromTitle =
    title
      .split(/\s+[|–—:·•»-]\s+/)
      .map((part) => part.trim())
      .find((part) => part && squash(part).length <= 40 && (squash(part).includes(squash(words)) || squash(words).includes(squash(part)))) || '';
  const fromHost = words.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  const name = cleanName(meta['og:site_name'] || schemaName || meta['application-name'] || fromTitle || fromHost);

  /* Logo candidates, best first */
  /** @type {PageReading['logos']} */
  const logos = [];
  const add = (/** @type {string} */ url, /** @type {PageReading['logos'][number]['from']} */ from) => {
    if (url && !logos.some((logo) => logo.url === url)) logos.push({ url, from });
  };
  add(schemaLogo, 'schema');
  /** @type {{url: string, score: number}[]} */
  const images = [];
  const headerEnd = (() => {
    const at = source.search(/<\/header>/i);
    return at > 0 ? at : Math.min(source.length, 20_000);
  })();
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = tagAttributes(match[0]);
    const own = [attributes.class, attributes.id, attributes.alt, attributes.src, attributes['data-src']].join(' ').toLowerCase();
    const before = source.slice(Math.max(0, (match.index ?? 0) - 400), match.index).toLowerCase();
    const parent = /<(a|div|span|figure|picture)\b[^>]*(class|id)\s*=\s*["'][^"']*logo[^"']*["'][^>]*>[^<]*(<source\b[^>]*>\s*)*$/i.test(before);
    if (!own.includes('logo') && !parent) continue;
    // Partner, client and payment logos are someone else's.
    if (/partner|client|customer|sponsor|award|payment|badge|trust|press|app-?store|google-?play/.test(own)) continue;
    const url = resolve(attributes.srcset ? largestOf(attributes.srcset) : attributes.src || attributes['data-src'] || '', base);
    if (!url) continue;
    let score = own.includes('logo') ? 3 : 2;
    if ((match.index ?? 0) < headerEnd) score += 3;
    if (name && squash(attributes.alt || '').includes(squash(name))) score += 2;
    if (/footer/.test(own)) score -= 2;
    images.push({ url, score: score - images.length * 0.01 });
  }
  images.sort((a, b) => b.score - a.score).forEach((image) => add(image.url, 'img'));
  /** @type {{url: string, size: number}[]} */
  const icons = [];
  for (const attributes of startTags(head, 'link').map(tagAttributes)) {
    const rel = (attributes.rel || '').toLowerCase();
    if (!/apple-touch-icon|icon/.test(rel)) continue;
    const size = parseInt(attributes.sizes || (rel.includes('apple') ? '180' : '0'), 10) || 0;
    if (size >= 96) icons.push({ url: resolve(attributes.href, base), size });
  }
  icons.sort((a, b) => b.size - a.size).forEach((icon) => add(icon.url, 'icon'));

  /* Styles */
  const stylesheets = startTags(head, 'link')
    .map(tagAttributes)
    .filter((a) => /(^|\s)stylesheet(\s|$)/i.test(a.rel || '') && !/^print$/i.test((a.media || '').trim()))
    .map((a) => resolve(a.href, base))
    .filter(Boolean)
    // Fonts and third-party widgets say nothing about the brand's colors.
    .filter((href) => !/fonts\.googleapis|use\.typekit|fontawesome|cookie|consent|onetrust/i.test(href));
  const css = [
    ...[...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]),
    // Inline styles of buttons and links count too: `<a class="btn" style="…">`.
    ...[...source.matchAll(/<(a|button)\b[^>]*>/gi)]
      .map((m) => tagAttributes(m[0]))
      .filter((a) => a.style)
      .map((a) => `${/btn|button|cta/i.test(a.class || '') ? '.btn' : 'a'}{${a.style}}`),
  ].join('\n');

  return {
    name,
    logos,
    stylesheets: [...new Set(stylesheets)],
    css,
    themeColor: meta['theme-color'] || meta['msapplication-tilecolor'] || '',
  };
}

/* ── CSS ────────────────────────────────────────────────────────────────── */

const PRIMARY_NAME = /primary|brand|accent|main|theme|highlight|cta/i;
const NOT_A_BRAND_NAME = /text|foreground|fg|border|muted|gr[ae]y|neutral|surface|shadow|overlay|success|error|danger|warning|info|disabled|placeholder/i;
const NOISE = /error|danger|success|warning|alert|invalid|valid\b|notice|toast|badge|disabled|facebook|twitter|linkedin|instagram|youtube|whatsapp|pinterest|tiktok|social|cookie|consent|onetrust|ot-|cmp|gdpr|wp-block|has-[\w-]+-(background-)?color|syntax|hljs|code/i;
const COLOR_IN_VALUE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
const COLOR_PROPERTY = /^(color|background|background-color|border|border-color|border-(top|bottom|left|right)(-color)?|fill|stroke|outline(-color)?|text-decoration-color|accent-color|caret-color)$/;

/** @param {string} css */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Rules as [selector, declarations], @media flattened. @param {string} css */
function rulesOf(css) {
  /** @type {[string, [string, string][]][]} */
  const rules = [];
  for (const [, selector, body] of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = body
      .split(';')
      .map((part) => {
        const colon = part.indexOf(':');
        return /** @type {[string, string]} */ ([part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]);
      })
      .filter(([property, value]) => property && value);
    if (declarations.length) rules.push([selector.trim(), declarations]);
  }
  return rules;
}

/**
 * A custom property's value as a color: `#2977bc`, `rgb(…)`, and the bare
 * channels design systems keep there (`41 119 188`, `210 64% 45%`).
 * @param {string} value
 */
function customColor(value) {
  const direct = parseColor(value.replace(/\s*!important$/, ''));
  if (direct) return direct;
  if (/^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?$/.test(value)) return parseColor(`rgb(${value})`);
  if (/^\d{1,3}(\.\d+)?(deg)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/.test(value)) return parseColor(`hsl(${value.replace('deg', '')})`);
  return null;
}

/**
 * `var(--x, fallback)` replaced by what --x holds, a few levels deep.
 * @param {string} value @param {Map<string, string>} custom
 */
function resolveVars(value, custom) {
  let out = value;
  for (let depth = 0; depth < 4 && out.includes('var('); depth += 1) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fallback) => custom.get(name) ?? fallback ?? '');
  }
  return out;
}

/** @param {{r: number, g: number, b: number}} a @param {{r: number, g: number, b: number}} b */
const distance = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

/** Colors of one value, as found (not resolved through var()). @param {string} value */
const colorsIn = (value) => (value.match(COLOR_IN_VALUE) || []).map((text) => parseColor(text)).filter((c) => c && c.a >= 0.6);

/**
 * The web-safe stack nearest to a CSS font-family.
 * @param {string} family
 * @returns {string|undefined}
 */
export function nearestFont(family) {
  const stack = String(family ?? '')
    .toLowerCase()
    .replace(/["']/g, '');
  if (!stack.trim() || /^(inherit|initial|unset|revert)$/.test(stack.trim())) return undefined;
  const first = stack.split(',')[0].trim();
  const known = FONT_OPTIONS.find((option) => first.startsWith(option.label.toLowerCase()));
  if (known) return known.value;
  if (/^helvetica/.test(first)) return FONT_OPTIONS[0].value;
  if (/^times/.test(first)) return FONT_OPTIONS.find((o) => o.label === 'Times')?.value;
  if (/monospace|mono\b|courier|consolas/.test(stack)) return FONT_OPTIONS.find((o) => o.label === 'Courier')?.value;
  // Web fonts: their family decides (serif, else sans-serif).
  if (/(^|,)\s*serif\s*(,|$)|garamond|playfair|merriweather|lora|baskerville|caslon|didot|bodoni|crimson|libre baskerville|source serif|noto serif|pt serif/.test(stack)) {
    return FONT_OPTIONS.find((o) => o.label === 'Georgia')?.value;
  }
  return FONT_OPTIONS[0].value;
}

/**
 * Main color, headings color and font of a site, from its CSS.
 * @param {{css: string, themeColor?: string}} input
 * @returns {{primary?: string, heading?: string, font?: string}}
 */
export function brandFromCss({ css, themeColor = '' }) {
  const rules = rulesOf(String(css ?? ''));

  /** @type {Map<string, string>} */
  const custom = new Map();
  for (const [selector, declarations] of rules) {
    // :root first: a theme's dark variant must not replace it.
    const root = /^(:root|html|body|\*)(\s*,|$)/i.test(selector);
    for (const [property, value] of declarations) {
      if (property.startsWith('--') && (root || !custom.has(property))) custom.set(property, value.replace(/\s*!important$/, ''));
    }
  }

  /** @type {{color: {r: number, g: number, b: number}, weight: number}[]} */
  const found = [];
  /** @type {{color: {r: number, g: number, b: number}, weight: number}[]} */
  const darkText = [];
  /** @type {{font: string, weight: number}[]} */
  const fonts = [];
  const count = (/** @type {{r: number, g: number, b: number}} */ color, /** @type {number} */ weight) => found.push({ color, weight });

  for (const [selector, declarations] of rules) {
    if (selector.startsWith('@')) continue;
    const noise = NOISE.test(selector);
    const emphasis = /btn|button|cta|primary|brand|accent|hero|highlight/i.test(selector) ? 4 : /(^|[\s,>+~])a([:.[\s,]|$)|link/i.test(selector) ? 2 : 1;
    const isHeading = /(^|[\s,>])h[1-3]\b|title|heading|headline/i.test(selector);
    const isBody = /^(html|body|:root)(\s*,|$)|(^|,)\s*(html|body)\s*(,|$)/i.test(selector);
    for (const [property, raw] of declarations) {
      if (property.startsWith('--')) {
        const color = customColor(resolveVars(raw, custom));
        if (color && color.a >= 0.6 && PRIMARY_NAME.test(property) && !NOT_A_BRAND_NAME.test(property)) count(color, 10);
        continue;
      }
      const value = resolveVars(raw, custom);
      if (property === 'font-family' || property === 'font') {
        const family = property === 'font' ? value.replace(/^.*?\d[\w%.]*(\/[\w%.]+)?\s+/, '') : value;
        if (isBody || isHeading) fonts.push({ font: family, weight: isBody ? 2 : 1 });
        continue;
      }
      if (!COLOR_PROPERTY.test(property) || noise) continue;
      for (const color of colorsIn(value)) {
        if (!color) continue;
        count(color, emphasis * (property.startsWith('background') ? 1.5 : 1));
        if (property === 'color' && (isHeading || isBody)) darkText.push({ color, weight: isHeading ? 2 : 1 });
      }
    }
  }
  const theme = parseColor(themeColor);
  if (theme && theme.a >= 0.6) count(theme, 15);

  // Near colors are one color (hover shades, rounding).
  /** @type {{color: {r: number, g: number, b: number}, weight: number}[]} */
  const clusters = [];
  for (const entry of found) {
    const near = clusters.find((cluster) => distance(cluster.color, entry.color) < 24);
    if (near) near.weight += entry.weight;
    else clusters.push({ ...entry });
  }
  clusters.sort((a, b) => b.weight - a.weight);
  const primary = clusters.find(({ color }) => {
    const { s, l } = toHsl(color);
    return s >= 0.25 && l >= 0.15 && l <= 0.85;
  });

  /** @type {{primary?: string, heading?: string, font?: string}} */
  const result = {};
  if (primary) result.primary = toHex(primary.color);

  const dark = darkText
    .filter(({ color }) => toHsl(color).l < 0.3)
    .reduce((/** @type {Map<string, number>} */ map, { color, weight }) => map.set(toHex(color), (map.get(toHex(color)) || 0) + weight), new Map());
  const heading = [...dark.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (heading) result.heading = heading;
  else if (result.primary && contrastRatio(result.primary, PALETTE.white) >= 7) result.heading = result.primary;
  else result.heading = PALETTE.ink;

  const font = fonts.sort((a, b) => b.weight - a.weight).map(({ font }) => nearestFont(font)).find(Boolean);
  if (font) result.font = font;
  return result;
}

/* ── Images ─────────────────────────────────────────────────────────────── */

/**
 * Width and height of a PNG, GIF or JPEG, from its header; null otherwise.
 * @param {Uint8Array} bytes
 * @returns {{width: number, height: number}|null}
 */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const at = (/** @type {number} */ i) => bytes[i];
  // PNG: IHDR right after the signature.
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    const read32 = (/** @type {number} */ i) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0;
    return { width: read32(16), height: read32(20) };
  }
  // GIF: logical screen size.
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46) {
    return { width: at(6) | (at(7) << 8), height: at(8) | (at(9) << 8) };
  }
  // JPEG: the first start-of-frame marker.
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) {
        i += 1;
        continue;
      }
      const marker = at(i + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      const length = (at(i + 2) << 8) | at(i + 3);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) };
      }
      i += 2 + length;
    }
  }
  return null;
}

/**
 * The width a logo is shown at in an email: a wordmark wider, a square mark
 * smaller; never wider than the image itself (a blurry logo is worse than a
 * small one). Retina images (twice the size shown) are common: halved first.
 * @param {{width: number, height: number}} size
 */
export function logoWidthFor({ width, height }) {
  if (!width || !height) return 140;
  const ratio = width / height;
  const shown = width >= 240 ? width / 2 : width;
  const target = ratio >= 2.5 ? 180 : ratio >= 1.3 ? 140 : 72;
  return Math.max(24, Math.round(Math.min(target, shown)));
}
