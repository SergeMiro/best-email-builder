// @ts-check
/**
 * BRAND — the look of a company's emails: its name, its logo, a main color,
 * a color for headings and a font. Set once (by hand, or read from the
 * company's website), it is used by every new email, template and block,
 * and can be applied to the email being edited.
 *
 * `applyBrand` repaints an email by ROLE, not by exact color, so it works on
 * any email — a template, an imported one, one the user built:
 *
 *   buttons             filled with the main color, text in the color that
 *                       reads on it (white or ink);
 *   colored sections    (banners) take the main color; their texts and
 *                       buttons switch to what reads on it;
 *   headings            (bold, 18 px and more, on white) take the headings
 *                       color; body text and gray footers keep theirs;
 *   colored links       take the main color, or the headings color when the
 *                       main one is too light to read on white;
 *   fonts               every text, button and menu link;
 *   header              (optional) the logo — or the name — at the top, and
 *                       the name in the footer.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

import { FONT_OPTIONS, PALETTE, escapeXml } from '../../blocks/shared.js';
import { createNode } from '../../engine/model.js';
import { parseMjml, parseMjmlFragment, serializeMjml } from '../../engine/mjml.js';

/**
 * @typedef {{
 *   name?: string,
 *   logoUrl?: string,
 *   logoWidth?: number,
 *   primary?: string,
 *   heading?: string,
 *   font?: string,
 *   website?: string,
 * }} Brand
 *   `primary`: buttons, banners, links; `heading`: headings; colors as
 *   `#rrggbb`. `font`: one of the builder's web-safe stacks (FONT_OPTIONS).
 *   `website`: where it was read from, to read it again.
 *
 * @typedef {import('../../engine/model.js').EmailNode} EmailNode
 */

const HEX = /^#[0-9a-f]{6}$/;
const FONTS = new Set(FONT_OPTIONS.map((option) => option.value));
export const MAX_LOGO_WIDTH = 240;

/* ── Colors ─────────────────────────────────────────────────────────────── */

/**
 * A CSS color as RGB(A), or null: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(),
 * rgba(), hsl(), hsla(), and the keywords white and black.
 * @param {unknown} value
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
export function parseColor(value) {
  const source = String(value ?? '').trim().toLowerCase();
  if (source === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (source === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let match = source.match(/^#([0-9a-f]{3,8})$/);
  if (match) {
    const hex = match[1];
    if (hex.length === 3 || hex.length === 4) {
      const [r, g, b, a = 'ff'] = hex.split('').map((c) => c + c);
      return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16), a: parseInt(a, 16) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  match = source.match(/^(rgba?|hsla?)\(([^)]*)\)$/);
  if (!match) return null;
  const parts = match[2].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
  if (match[1].startsWith('rgb')) {
    const channel = (/** @type {string} */ part) => (part.endsWith('%') ? (parseFloat(part) * 255) / 100 : parseFloat(part));
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if ([r, g, b, alpha].some((n) => Number.isNaN(n))) return null;
    const clamp = (/** @type {number} */ n) => Math.max(0, Math.min(255, Math.round(n)));
    return { r: clamp(r), g: clamp(g), b: clamp(b), a: alpha };
  }
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if ([h, s, l, alpha].some((n) => Number.isNaN(n))) return null;
  return { ...fromHsl(((h % 360) + 360) % 360, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))), a: alpha };
}

/** @param {number} h @param {number} s @param {number} l */
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

/** @param {{r: number, g: number, b: number}} color */
export const toHex = ({ r, g, b }) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;

/** Hue (0-360), saturation and lightness (0-1). @param {{r: number, g: number, b: number}} color */
export function toHsl({ r, g, b }) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) * 60 : max === G ? ((B - R) / d + 2) * 60 : ((R - G) / d + 4) * 60;
  return { h, s, l };
}

/** WCAG relative luminance. @param {{r: number, g: number, b: number}} color */
function luminance({ r, g, b }) {
  const linear = (/** @type {number} */ n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two colors (1 to 21). @param {string} a @param {string} b */
export function contrastRatio(a, b) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return 1;
  const [hi, lo] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The text color that reads on `background`: white or ink. @param {string} background */
export function readableOn(background) {
  return contrastRatio(background, PALETTE.white) >= contrastRatio(background, PALETTE.ink) ? PALETTE.white : PALETTE.ink;
}

/**
 * A color meant to be noticed (a banner, a filled button), as opposed to
 * white, light tints, grays and near-black.
 * @param {unknown} value
 */
export function isColored(value) {
  const color = parseColor(value);
  if (!color || color.a < 0.5) return false;
  const { s, l } = toHsl(color);
  return s >= 0.2 && l >= 0.08 && l <= 0.88;
}

/** Dark enough to carry white text (navy, charcoal…). @param {unknown} value */
function isDark(value) {
  const color = parseColor(value);
  return Boolean(color && color.a >= 0.5 && luminance(color) < 0.12);
}

/** A light gray (footers, captions): left as it is. @param {unknown} value */
function isMuted(value) {
  const color = parseColor(value);
  if (!color) return false;
  const { s, l } = toHsl(color);
  return s < 0.2 && l > 0.4;
}

/* ── The brand itself ───────────────────────────────────────────────────── */

/** @param {unknown} value */
const cleanColor = (value) => {
  const color = parseColor(value);
  return color && color.a >= 0.5 ? toHex(color) : '';
};

/**
 * A brand as stored and used: unknown fields dropped, colors as #rrggbb,
 * the font one of the builder's stacks, the logo an https or site-relative
 * image. Whatever is invalid is left out (the builder's default is used).
 * @param {unknown} input
 * @returns {Brand}
 */
export function cleanBrand(input) {
  const source = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
  /** @type {Brand} */
  const brand = {};
  const name = typeof source.name === 'string' ? source.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (name) brand.name = name;
  const logo = typeof source.logoUrl === 'string' ? source.logoUrl.trim() : '';
  if (logo && logo.length <= 2000 && (/^https:\/\/[^\s"'<>]+$/i.test(logo) || /^\/(?!\/)[^\s"'<>]*$/.test(logo))) {
    brand.logoUrl = logo;
    const width = Math.round(Number(source.logoWidth));
    if (width >= 24 && width <= MAX_LOGO_WIDTH) brand.logoWidth = width;
  }
  const primary = cleanColor(source.primary);
  if (primary && HEX.test(primary)) brand.primary = primary;
  const heading = cleanColor(source.heading);
  if (heading && HEX.test(heading)) brand.heading = heading;
  if (typeof source.font === 'string' && FONTS.has(source.font)) brand.font = source.font;
  const website = typeof source.website === 'string' ? source.website.trim() : '';
  if (/^https?:\/\/[^\s"'<>]+$/i.test(website) && website.length <= 500) brand.website = website;
  return brand;
}

/** Does the brand change anything? @param {Brand|null|undefined} brand */
export const hasBrand = (brand) => Boolean(brand && Object.keys(cleanBrand(brand)).some((key) => key !== 'website'));

/**
 * The sender the templates use: the brand's name and logo over the host's
 * sender (whose postal address stays).
 * @param {import('../templates/starter.js').StarterSender|null|undefined} sender
 * @param {Brand|null|undefined} brand
 */
export function brandedSender(sender, brand) {
  const base = { ...(sender || {}) };
  if (!brand) return base;
  if (brand.name) base.name = brand.name;
  if (brand.logoUrl) {
    base.logoUrl = brand.logoUrl;
    base.logoWidth = brand.logoWidth || base.logoWidth;
  }
  return base;
}

/**
 * The colors applyBrand paints with.
 * @param {Brand} brand
 */
function paletteOf(brand) {
  const primary = brand.primary || null;
  return {
    primary,
    onPrimary: primary ? readableOn(primary) : null,
    heading: brand.heading || null,
    // A link must read on white: a too-light main color gives way.
    link: primary ? (contrastRatio(primary, PALETTE.white) >= 3 ? primary : brand.heading || PALETTE.ink) : null,
    font: brand.font || null,
  };
}

/* ── Painting ───────────────────────────────────────────────────────────── */

const SECTION_LIKE = new Set(['mj-section', 'mj-wrapper', 'mj-hero', 'mj-column', 'mj-group']);
const FONT_TAGS = new Set(['mj-text', 'mj-button', 'mj-navbar-link', 'mj-social-element', 'mj-table']);

/** @param {string|undefined} size */
const px = (size) => {
  const n = parseFloat(String(size ?? ''));
  return Number.isNaN(n) ? 0 : n;
};

/** @param {string|undefined} weight */
const isBold = (weight) => /^(bold|bolder|[6-9]00)$/.test(String(weight ?? '').trim());

/**
 * The links of a text in a new color, when theirs is a color (a gray or a
 * black link is a choice, and stays).
 * @param {string} html @param {string} color
 */
function recolorLinks(html, color) {
  return html.replace(/<a\b[^>]*>/gi, (tag) =>
    tag.replace(/(style\s*=\s*")([^"]*)(")/i, (_, open, style, close) =>
      `${open}${style.replace(/(^|;)(\s*color\s*:\s*)([^;]+)/i, (whole, sep, prop, value) =>
        isColored(value) ? `${sep}${prop}${color}` : whole
      )}${close}`
    )
  );
}

/**
 * One node and what it holds, in the brand's colors.
 * @param {EmailNode} node
 * @param {ReturnType<typeof paletteOf>} palette
 * @param {boolean} onColor  the node sits on a colored background
 * @returns {EmailNode}
 */
function paint(node, palette, onColor) {
  const attributes = { ...node.attributes };
  let content = node.content;
  let childrenOnColor = onColor;
  const set = (/** @type {string} */ key, /** @type {string|null} */ value) => {
    if (value) attributes[key] = value;
  };

  if (SECTION_LIKE.has(node.tag)) {
    const background = attributes['background-color'];
    if (background && palette.primary && (isColored(background) || (isDark(background) && node.tag !== 'mj-column'))) {
      attributes['background-color'] = palette.primary;
      childrenOnColor = true;
    } else if (background && parseColor(background)) {
      childrenOnColor = false;
    }
  }

  if (FONT_TAGS.has(node.tag) && palette.font) set('font-family', palette.font);

  if (node.tag === 'mj-text' && content !== null) {
    if (onColor) {
      set('color', palette.onPrimary);
    } else {
      const heading = isBold(attributes['font-weight']) && px(attributes['font-size']) >= 18;
      if (heading && palette.heading && !isMuted(attributes.color)) attributes.color = palette.heading;
      if (palette.link) content = recolorLinks(content, palette.link);
    }
  }

  if (node.tag === 'mj-button') {
    const background = attributes['background-color'];
    // MJML's own default is a dark gray: a button without color is filled.
    const filled = !background || isColored(background) || isDark(background);
    if (palette.primary && filled) {
      set('background-color', onColor ? palette.onPrimary : palette.primary);
      set('color', onColor ? palette.primary : palette.onPrimary);
    } else if (palette.primary && onColor) {
      // A light button on a banner: kept light, its text in the main color.
      set('color', readableOn(background) === PALETTE.ink && contrastRatio(palette.primary, background) < 3 ? PALETTE.ink : palette.primary);
    } else if (palette.link && isColored(attributes.color)) {
      // An outlined button on white.
      attributes.color = palette.link;
      if (isColored(attributes['border-color'])) attributes['border-color'] = palette.link;
    }
  }

  if (node.tag === 'mj-navbar-link' && isColored(attributes.color)) {
    set('color', onColor ? palette.onPrimary : palette.link);
  }

  const children = node.children.map((child) => paint(child, palette, childrenOnColor));
  return { ...node, attributes, content, children };
}

/** @param {string} html */
const plainText = (html) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** @param {EmailNode} body */
const sectionsOf = (body) =>
  body.children.flatMap((child) => (child.tag === 'mj-wrapper' ? child.children.filter((c) => c.tag === 'mj-section') : [child]));

/**
 * The logo, or the name, at the top; the name in the footer.
 * @param {EmailNode} root
 * @param {Brand} brand
 * @param {{names: string[], logos: string[]}} previous  what the email may still show
 * @returns {EmailNode}
 */
function rebrandHeader(root, brand, previous) {
  const body = root.children.find((child) => child.tag === 'mj-body');
  if (!body) return root;
  const names = previous.names.map((name) => String(name || '').trim()).filter((name) => name.length >= 2);
  const known = new Set(names.map((name) => name.toLowerCase()));
  const sections = sectionsOf(body);
  /** @type {Map<string, EmailNode>} */
  const replaced = new Map();

  const top = sections[0];
  const column = top?.children.find((child) => child.tag === 'mj-column');
  const first = column?.children[0];
  if (first?.tag === 'mj-image') {
    const small = px(first.attributes.width) > 0 && px(first.attributes.width) <= MAX_LOGO_WIDTH;
    const wasLogo = small || previous.logos.includes(first.attributes.src) || known.has(String(first.attributes.alt || '').toLowerCase());
    if (wasLogo && brand.logoUrl) {
      replaced.set(first.id, {
        ...first,
        attributes: {
          ...first.attributes,
          src: brand.logoUrl,
          alt: brand.name || first.attributes.alt || '',
          width: `${brand.logoWidth || Math.min(px(first.attributes.width) || 140, MAX_LOGO_WIDTH)}px`,
        },
      });
    }
  } else if (first?.tag === 'mj-text' && first.content !== null && known.has(plainText(first.content).toLowerCase())) {
    if (brand.logoUrl) {
      const keep = Object.fromEntries(Object.entries(first.attributes).filter(([key]) => key.startsWith('padding') || key === 'align'));
      replaced.set(
        first.id,
        createNode('mj-image', {
          id: first.id,
          attributes: { src: brand.logoUrl, alt: brand.name || '', width: `${brand.logoWidth || 140}px`, align: 'left', ...keep },
        })
      );
    } else if (brand.name) {
      replaced.set(first.id, { ...first, content: escapeXml(brand.name) });
    }
  }

  // The footer: the old name in its line becomes the new one.
  const bottom = sections.length > 1 ? sections[sections.length - 1] : null;
  const newName = brand.name;
  if (bottom && newName) {
    const swap = (/** @type {EmailNode} */ node) => {
      if (node.tag === 'mj-text' && node.content !== null) {
        let html = node.content;
        for (const name of names) {
          if (name !== newName) html = html.split(escapeXml(name)).join(escapeXml(newName));
        }
        if (html !== node.content) replaced.set(node.id, { ...node, content: html });
      }
      node.children.forEach(swap);
    };
    swap(bottom);
  }

  if (!replaced.size) return root;
  const rebuild = (/** @type {EmailNode} */ node) => replaced.get(node.id) || { ...node, children: node.children.map(rebuild) };
  return rebuild(root);
}

/**
 * An email in the brand's look.
 * @param {string} mjml
 * @param {Brand|null|undefined} brand
 * @param {{header?: boolean, previous?: {names?: (string|undefined)[], logos?: (string|undefined)[]}}} [options]
 *   `header`: also put the logo (or name) at the top and the name in the
 *   footer, replacing what `previous` lists (the names and logos the email
 *   may still show: the host's sender, the brand before, "Your company").
 * @returns {string}
 */
export function applyBrand(mjml, brand, { header = false, previous = {} } = {}) {
  const clean = cleanBrand(brand);
  if (!hasBrand(clean)) return mjml;
  let root = parseMjml(mjml);
  root = paint(root, paletteOf(clean), false);
  if (header) {
    root = rebrandHeader(root, clean, {
      names: /** @type {string[]} */ ((previous.names || []).filter(Boolean)),
      logos: /** @type {string[]} */ ((previous.logos || []).filter(Boolean)),
    });
  }
  return serializeMjml(root);
}

/**
 * A fragment (a block about to be inserted) in the brand's look.
 * @param {string} mjml @param {Brand|null|undefined} brand
 */
export function applyBrandToFragment(mjml, brand) {
  const clean = cleanBrand(brand);
  if (!mjml || !hasBrand(clean)) return mjml;
  const palette = paletteOf(clean);
  return parseMjmlFragment(mjml)
    .map((node) => serializeMjml(paint(node, palette, false), { pretty: false }))
    .join('');
}

/**
 * A ready-made email (the starter, a gallery template) in the brand's look,
 * its header and footer naming the brand rather than the host's sender or
 * the "Your company" placeholder.
 * @param {string} mjml
 * @param {Brand|null|undefined} brand
 * @param {{sender?: import('../templates/starter.js').StarterSender|null, t?: (key: string) => string}} [context]
 */
export function brandTemplate(mjml, brand, { sender = null, t = (key) => key } = {}) {
  return applyBrand(mjml, brand, {
    header: true,
    previous: { names: [sender?.name, t('Your company')], logos: [sender?.logoUrl] },
  });
}
