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
 * ── NO QUOTES IN A VALUE ───────────────────────────────────────────────────
 * The engine export writes attributes unescaped: a `"` in a value would break
 * the MJML. Double quotes, angle brackets and line breaks are stripped on
 * write.
 */

/** Spacing attributes that have a longhand form in MJML. */
export const LONGHAND_SPACING = new Set(['padding']);

export const SIDES = /** @type {const} */ (['top', 'right', 'bottom', 'left']);

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
    } else {
      const v = attributes[key];
      values[key] = v === undefined || v === null ? '' : String(v);
    }
  }
  return values;
}
