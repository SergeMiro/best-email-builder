// @ts-check
/**
 * BUTTON - `mj-button`.
 *
 * MJML renders it as a table (not a styled `<a>`), which keeps it clickable
 * and at its size in Outlook. The default link is `DEFAULT_BUTTON_URL`.
 *
 * Defaults: navy background, bold white text, generous click area
 * (12 x 28 px) - a button that is too small is easy to miss with a finger.
 */

import { DEFAULT_BUTTON_URL, FONT_STACK, GROUPS, PALETTE, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML =
  `<mj-button href="${DEFAULT_BUTTON_URL}" background-color="${PALETTE.navy}" color="${PALETTE.white}" ` +
  `font-family="${FONT_STACK}" font-size="15px" font-weight="bold" border-radius="6px" ` +
  'inner-padding="12px 28px" align="center">Learn more</mj-button>';

/** @type {EmailBlock} */
export const buttonBlock = {
  id: 'button',
  label: 'Button',
  description: 'Call to action',
  icon: 'RectangleHorizontal',
  kind: 'content',
  tagName: 'mj-button',
  order: 30,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  editableContent: true,
  properties: [
    prop.href('Link URL'),
    prop.background('background-color', 'Button background'),
    prop.color('Text'),
    prop.fontFamily(),
    prop.fontSize(11, 28),
    {
      key: 'font-weight',
      label: 'Weight',
      type: 'select',
      group: GROUPS.typography,
      options: [
        { value: 'bold', label: 'Bold' },
        { value: 'normal', label: 'Normal' },
      ],
    },
    prop.radius(30),
    {
      key: 'width',
      label: 'Width',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: '', label: 'Fit to text' },
        { value: '100%', label: 'Full width' },
      ],
    },
    prop.align(),
    prop.padding('inner-padding', 'Button padding'),
    prop.padding(),
  ],
};
