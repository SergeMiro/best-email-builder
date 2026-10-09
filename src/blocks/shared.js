// @ts-check
/**
 * Building blocks shared by all blocks: palette, fonts, recurring properties.
 *
 * -- DEFAULT PALETTE ---------------------------------------------------------
 * Plain hex values: email clients load no stylesheet and understand neither
 * `var()` nor modern color functions, so every value ends up inline in a
 * `style=""` attribute.
 *
 * -- EVERY BLOCK SETS ITS OWN TEXT ATTRIBUTES --------------------------------
 * Font, size, line height and color are written on the element itself, never
 * left to MJML defaults (the "Ubuntu" font loaded from Google, line height 1):
 * the canvas and the sent email then render the same thing, and Outlook gets
 * explicit values.
 *
 * Fonts: only web-safe stacks, installed everywhere and understood by
 * Outlook - a web font only renders in a minority of email clients.
 */

/** @typedef {import('../core/EmailEditor.js').BlockProperty} BlockProperty */

/** The default palette. */
export const PALETTE = {
  ink: '#2b3038',
  inkSoft: '#41506b',
  navy: '#212e5a',
  brand: '#2977bc',
  border: '#dfe6f0',
  canvas: '#eceff4',
  surface: '#ffffff',
  white: '#ffffff',
};

/** Default link of a new button. */
export const DEFAULT_BUTTON_URL = 'https://example.com';

export const FONT_STACK = 'Arial, Helvetica, sans-serif';

/** @type {{value: string, label: string}[]} */
export const FONT_OPTIONS = [
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, Geneva, sans-serif', label: 'Tahoma' },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: 'Trebuchet' },
  { value: 'Georgia, Times, serif', label: 'Georgia' },
  { value: "'Times New Roman', Times, serif", label: 'Times' },
  { value: "'Courier New', Courier, monospace", label: 'Courier' },
];

/** @type {{value: string, label: string}[]} */
export const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

/** Properties panel groups, in display order. */
export const GROUPS = {
  content: 'Content',
  link: 'Link',
  typography: 'Typography',
  colors: 'Colors',
  layout: 'Layout',
  spacing: 'Spacing',
};

/** Recurring properties. */
export const prop = {
  /** @returns {BlockProperty} */
  fontFamily: () => ({ key: 'font-family', label: 'Font', type: 'select', group: GROUPS.typography, options: FONT_OPTIONS }),
  /** @returns {BlockProperty} */
  fontSize: (min = 10, max = 48) => ({ key: 'font-size', label: 'Size', type: 'size', group: GROUPS.typography, min, max, unit: 'px' }),
  /** @returns {BlockProperty} */
  lineHeight: () => ({ key: 'line-height', label: 'Line height', type: 'size', group: GROUPS.typography, min: 10, max: 80, unit: 'px' }),
  /** @returns {BlockProperty} */
  color: (label = 'Text') => ({ key: 'color', label, type: 'color', group: GROUPS.colors }),
  /** @returns {BlockProperty} */
  background: (key = 'background-color', label = 'Background') => ({ key, label, type: 'color', group: GROUPS.colors }),
  /** @returns {BlockProperty} */
  align: (options = ALIGN_OPTIONS) => ({ key: 'align', label: 'Alignment', type: 'align', group: GROUPS.layout, options }),
  /** @returns {BlockProperty} */
  padding: (key = 'padding', label = 'Padding') => ({ key, label, type: 'spacing', group: GROUPS.spacing }),
  /** @returns {BlockProperty} */
  href: (label = 'Link URL') => ({ key: 'href', label, type: 'url', group: GROUPS.link, placeholder: 'https://' }),
  /** @returns {BlockProperty} */
  radius: (max = 40) => ({ key: 'border-radius', label: 'Corner radius', type: 'size', group: GROUPS.layout, min: 0, max, unit: 'px' }),
};

/**
 * White one-column section: the wrapper of a content block dropped outside
 * any column (MJML does not accept text directly inside the body).
 *
 * Warning: padding in LONGHAND form, never `padding="..."`. The canvas starts
 * from the longhand defaults (20 px for a section), which override the
 * shorthand, while the export omits them - the screen and the email would
 * diverge (see core/mjmlAttributes).
 *
 * @param {string} inner
 */
export function inWhiteSection(inner) {
  return (
    `<mj-section background-color="${PALETTE.surface}" padding-top="0px" padding-bottom="0px">` +
    `<mj-column>${inner}</mj-column></mj-section>`
  );
}
