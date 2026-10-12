// @ts-check
/**
 * LAYOUTS - 1, 2 or 3 column sections (`mj-section` + `mj-column`).
 *
 * Each column is pre-filled with text: an empty column only offers a strip a
 * few pixels high to drop a block into. On mobile (under 480 px), MJML stacks
 * the columns on top of each other - nothing to configure.
 *
 * Once added, the section is described by the "section" structure
 * (`blocks/structure`): background, padding, corner radius.
 */

import { DEFAULT_BUTTON_URL, FONT_STACK, PALETTE } from '../shared.js';
import { textMjml } from '../text/index.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

/** @param {number} count */
function sectionWith(count) {
  const columns = Array.from({ length: count }, (_, i) =>
    `<mj-column>${textMjml(count === 1 ? 'Your text.' : `Column ${i + 1}`)}</mj-column>`
  ).join('');
  return `<mj-section background-color="${PALETTE.surface}">${columns}</mj-section>`;
}

/**
 * @param {number} count
 * @param {string} icon
 * @returns {EmailBlock}
 */
function layout(count, icon) {
  return {
    id: `columns-${count}`,
    label: count === 1 ? '1 column' : `${count} columns`,
    description: count === 1 ? 'Full-width section' : `${count}-column section`,
    icon,
    kind: 'layout',
    tagName: 'mj-section',
    order: 100 + count,
    mjml: sectionWith(count),
    properties: [],
  };
}

export const oneColumnBlock = layout(1, 'Square');
export const twoColumnsBlock = layout(2, 'Columns2');
export const threeColumnsBlock = layout(3, 'Columns3');
export const fourColumnsBlock = layout(4, 'Columns4');

/**
 * Image on one side, title, text and button on the other - the usual
 * "product" or "article" row. Stacked on mobile, image first.
 */
const IMAGE_TEXT_MJML =
  `<mj-section background-color="${PALETTE.surface}">` +
  '<mj-column vertical-align="middle"><mj-image align="center"></mj-image></mj-column>' +
  '<mj-column vertical-align="middle">' +
  `<mj-text font-family="${FONT_STACK}" font-size="20px" line-height="28px" font-weight="bold" ` +
  `color="${PALETTE.navy}" align="left">Title</mj-text>` +
  textMjml('A few words about it.') +
  `<mj-button href="${DEFAULT_BUTTON_URL}" background-color="${PALETTE.navy}" color="${PALETTE.white}" ` +
  `font-family="${FONT_STACK}" font-size="14px" font-weight="bold" border-radius="6px" ` +
  'inner-padding="10px 22px" align="left">Learn more</mj-button>' +
  '</mj-column>' +
  '</mj-section>';

/** @type {EmailBlock} */
export const imageTextBlock = {
  id: 'image-text',
  label: 'Image + text',
  description: 'Image beside a title, text and button',
  icon: 'LayoutPanelLeft',
  kind: 'layout',
  tagName: 'mj-section',
  order: 105,
  mjml: IMAGE_TEXT_MJML,
  properties: [],
};
