// @ts-check
/**
 * MJML attributes — reading and writing properties panel values.
 *
 * This is knowledge of the LANGUAGE (MJML), not of the engine: it lives in
 * the core, and every adapter benefits from it.
 *
 * ── PADDING IS WRITTEN IN LONGHAND ─────────────────────────────────────────
 * An MJML element carries both `padding` and `padding-top/-right/-bottom/
 * -left`, and the longhand wins. The canvas, starting from the defaults
 * (`padding-top="10px"`…), ignored a `padding="40px 60px"` that the sent
 * email did apply: the screen lied. So `padding` is always written as four
 * attributes, and read back the same way.
 *
 * `inner-padding` (button) has no longhand in MJML: it stays as is.
 *
 * ── A BORDER IS ONE VALUE IN THE PANEL ──────────────────────────────────────
 * The panel edits a border as one value: one to four widths, a line style, a
 * color ("2px 0px dashed #cccccc"). Written, it becomes `border` when the four
 * sides are the same, `border-top`… otherwise; read, both come back as one.
 *
 * ── NO QUOTES IN A VALUE ───────────────────────────────────────────────────
 * The engine export writes attributes unescaped: a `"` in a value would break
 * the MJML. Double quotes, angle brackets and line breaks are stripped on
 * write.
 */

/** Spacing attributes that have a longhand form in MJML. */
export const LONGHAND_SPACING = new Set(['padding']);

export const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);

/** Border attributes edited as one value: `border` and its four sides. */
export const LONGHAND_BORDER = new Set(['border']);

/** The line styles offered: CSS's, which the email clients draw (a dot-dash line is not one of them). */
export const BORDER_STYLES = /** @type {const} */ (['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge']);

/** The widest border written, in pixels. */
export const MAX_BORDER = 20;

/** Every CSS line style, to read what an email already has. */
const LINE_STYLES = new Set([...BORDER_STYLES, 'inset', 'outset', 'none', 'hidden']);
/** CSS's width keywords, in pixels as browsers draw them. */
const WIDTH_KEYWORDS = { thin: 1, medium: 3, thick: 5 };

/**
 * @typedef {{widths: [number, number, number, number], style: string, color: string}} Border
 *   `widths`: in pixels, top, right, bottom, left; `color`: '' for the text's.
 */

/**
 * A CSS border ("2px dashed #cccccc", in any order) or the panel's form, with
 * up to four widths ("2px 0px dashed #cccccc"). No border (`none`, `0`, no
 * style, nothing): null. Without a width, CSS's `medium` (3 px).
 * @param {string|null|undefined} value
 * @returns {Border|null}
 */
export function parseBorder(value) {
  const tokens = String(value || '').trim().match(/[^\s(]+\([^)]*\)|\S+/g) || [];
  /** @type {number[]} */
  const widths = [];
  let style = '';
  const color = [];
  for (const token of tokens) {
    const word = token.toLowerCase();
    if (/^(\d+\.?\d*|\.\d+)(px)?$/.test(word)) widths.push(Number.parseFloat(word));
    else if (word in WIDTH_KEYWORDS) widths.push(WIDTH_KEYWORDS[/** @type {keyof typeof WIDTH_KEYWORDS} */ (word)]);
    else if (LINE_STYLES.has(word)) style = word;
    else color.push(token);
  }
  if (!style || style === 'none' || style === 'hidden') return null;
  const [t = 3, r = t, b = t, l = r] = widths.slice(0, 4).map((width) => Math.max(0, Math.min(MAX_BORDER, Math.round(width))));
  if (!t && !r && !b && !l) return null;
  return { widths: [t, r, b, l], style, color: color.join(' ') };
}

/**
 * The panel's form of a border: its widths in their shortest form, its style,
 * its color. No border: ''.
 * @param {Border|null} border
 */
export function formatBorder(border) {
  if (!border || border.widths.every((width) => !width)) return '';
  return [formatSpacing(border.widths.map((width) => `${width}px`)), border.style, border.color].filter(Boolean).join(' ');
}

/** One side's (or the four sides') CSS border. @param {Border} border @param {number} width */
const borderLine = (border, width) => [`${width}px`, border.style, border.color].filter(Boolean).join(' ');

/**
 * "10px 25px" → ['10px', '25px', '10px', '25px'] (CSS 1-to-4 value rule).
 * @param {string|null|undefined} value
 * @returns {[string, string, string, string]}
 */
export function parseSpacing(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const [a = '0px', b = a, c = a, d = b] = parts;
  return [a, b, c, d];
}

/**
 * Shortest form of a four-sided spacing.
 * @param {string[]} sides
 */
export function formatSpacing(sides) {
  const [t, r, b, l] = sides.map((s) => String(s || '0px'));
  if (t === b && r === l) return t === r ? t : `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

/** Attribute value safe for an unescaped export. @param {unknown} value */
export function cleanAttributeValue(value) {
  return String(value ?? '')
    .replace(/["<>\r\n]/g, '')
    .trim();
}

/**
 * Entered values → MJML attributes to set (`null` = attribute to remove).
 *
 * @param {Record<string, string|null|undefined>} values
 * @returns {Record<string, string|null>}
 */
export function toAttributes(values) {
  /** @type {Record<string, string|null>} */
  const out = {};
  for (const [key, raw] of Object.entries(values || {})) {
    const value = raw === null || raw === undefined ? '' : cleanAttributeValue(raw);
    if (LONGHAND_SPACING.has(key)) {
      const sides = value ? parseSpacing(value) : null;
      SIDES.forEach((side, i) => {
        out[`${key}-${side}`] = sides ? sides[i] : null;
      });
      out[key] = null;
    } else if (LONGHAND_BORDER.has(key)) {
      const border = parseBorder(value);
      const same = border && border.widths.every((width) => width === border.widths[0]);
      out[key] = border && same ? borderLine(border, border.widths[0]) : null;
      SIDES.forEach((side, i) => {
        out[`${key}-${side}`] = border && !same && border.widths[i] ? borderLine(border, border.widths[i]) : null;
      });
    } else {
      out[key] = value || null;
    }
  }
  return out;
}

/**
 * Element attributes → a block's property values.
 *
 * @param {Record<string, unknown>} attributes
 * @param {{key: string}[]} properties
 * @returns {Record<string, string>}
 */
export function toValues(attributes, properties) {
  /** @type {Record<string, string>} */
  const values = {};
  for (const { key } of properties) {
    if (LONGHAND_SPACING.has(key)) {
      const base = parseSpacing(String(attributes[key] ?? ''));
      const sides = SIDES.map((side, i) => {
        const v = attributes[`${key}-${side}`];
        return v === undefined || v === null || v === '' ? base[i] : String(v);
      });
      const hasAny = attributes[key] || SIDES.some((side) => attributes[`${key}-${side}`]);
      values[key] = hasAny ? formatSpacing(sides) : '';
    } else if (LONGHAND_BORDER.has(key)) {
      const base = parseBorder(String(attributes[key] ?? ''));
      // A side written on its own wins over `border` (`none` included).
      const sides = SIDES.map((side) => {
        const v = attributes[`${key}-${side}`];
        return v === undefined || v === null || v === '' ? undefined : parseBorder(String(v));
      });
      const line = base || sides.find(Boolean);
      const widths = /** @type {Border['widths']} */ (SIDES.map((_, i) => (sides[i] === undefined ? base?.widths[i] ?? 0 : sides[i]?.widths[0] ?? 0)));
      values[key] = line ? formatBorder({ ...line, widths }) : '';
    } else {
      const v = attributes[key];
      values[key] = v === undefined || v === null ? '' : String(v);
    }
  }
  return values;
}

/*
 * ── PHONE VALUES SIT BESIDE THE OTHERS ─────────────────────────────────────
 * An element keeps what it looks like on a phone as `mobile-<attribute>`
 * (`mobile-font-size="32px"`, `mobile-padding-top="8px"`): the compiled email
 * gives them to screens under the breakpoint, the editor shows them in its
 * Mobile view. A side stands for its attribute: a phone padding replaces the
 * whole padding, never half of it.
 */
export const MOBILE_PREFIX = 'mobile-';

/** `padding-top` → `padding`. @param {string} key */
export const attributeOf = (key) => key.replace(/-(?:top|right|bottom|left)$/, '');

/**
 * What a phone shows is the content of the email, not a copy of it: these are
 * the same on every screen, as is the layer under the whole content.
 */
const SHARED_ATTRIBUTES = new Set(['src', 'alt', 'href', 'title', 'name', 'background-url', 'css-class', 'mode', 'full-width', 'fluid-on-mobile', 'vertical-align', 'content-background-color']);

/**
 * May an element have its own value of the attribute on a phone? The width of
 * the email or of a column cannot: on a phone the columns stack, full width.
 * @param {string} tag @param {string} key
 */
export function mobileAllowed(tag, key) {
  const name = attributeOf(key);
  return !SHARED_ATTRIBUTES.has(name) && !(name === 'width' && (tag === 'mj-body' || tag === 'mj-column'));
}

/** The attributes a phone overrides, by attribute (`padding` for all four sides). @param {Record<string, unknown>} attributes */
export function mobileOverrides(attributes) {
  return new Set(Object.keys(attributes).filter((key) => key.startsWith(MOBILE_PREFIX)).map((key) => attributeOf(key.slice(MOBILE_PREFIX.length))));
}

/** The attributes without their phone values. @template {Record<string, any>} T @param {T} attributes @returns {T} */
export function withoutMobile(attributes) {
  return /** @type {T} */ (Object.fromEntries(Object.entries(attributes).filter(([key]) => !key.startsWith(MOBILE_PREFIX))));
}

/** The attributes as a phone has them. @template {Record<string, any>} T @param {T} attributes @returns {T} */
export function withMobile(attributes) {
  const overrides = mobileOverrides(attributes);
  if (!overrides.size) return attributes;
  const out = Object.fromEntries(Object.entries(attributes).filter(([key]) => !key.startsWith(MOBILE_PREFIX) && !overrides.has(attributeOf(key))));
  for (const [key, value] of Object.entries(attributes)) if (key.startsWith(MOBILE_PREFIX)) out[key.slice(MOBILE_PREFIX.length)] = value;
  return /** @type {T} */ (out);
}

/**
 * Attributes to set (see toAttributes) → the phone's, for the ones it may have
 * its own of. A removed one (`null`) gives the phone the computer's value back.
 * @param {Record<string, string|null>} attributes @param {string} tag
 */
export function toMobileAttributes(attributes, tag) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [mobileAllowed(tag, key) ? `${MOBILE_PREFIX}${key}` : key, value]));
}
