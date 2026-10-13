// @ts-check
/**
 * TEXT - `mj-text`.
 *
 * Content is typed in the canvas (double-click: bold, italic, link); the panel
 * only controls the styling. Defaults are readable on mobile: 15 px on a 24 px
 * line height, ink #2b3038 (never pure black, which "vibrates" on phone
 * screens).
 */

import { identity } from '../../i18n/index.js';
import { FONT_STACK, GROUPS, PALETTE, escapeXml, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

/**
 * A text with the block's settings. Also used by the column layouts, which
 * pre-fill each column.
 *
 * @param {string} content  Already-safe HTML (fixed builder text)
 */
export function textMjml(content) {
  return (
    `<mj-text font-family="${FONT_STACK}" font-size="15px" line-height="24px" color="${PALETTE.ink}" ` +
    `align="left">${content}</mj-text>`
  );
}

/** @param {import('../../i18n/index.js').Translate} [t] */
const mjml = (t = identity) => textMjml(escapeXml(t('Your text.')));

/** @type {EmailBlock} */
export const textBlock = {
  id: 'text',
  label: 'Text',
  description: 'Paragraph or heading',
  icon: 'Type',
  kind: 'content',
  tagName: 'mj-text',
  order: 10,
  mjml,
  sectionMjml: (t) => inWhiteSection(mjml(t)),
  editableContent: true,
  properties: [
    prop.fontFamily(),
    prop.fontSize(10, 48),
    prop.lineHeight(),
    {
      key: 'font-weight',
      label: 'Weight',
      type: 'select',
      group: GROUPS.typography,
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'bold', label: 'Bold' },
      ],
    },
    prop.color('Text'),
    prop.background('container-background-color', 'Background'),
    { ...prop.align(), options: [...prop.align().options || [], { value: 'justify', label: 'Justify' }] },
    prop.padding(),
  ],
};
