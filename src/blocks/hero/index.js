// @ts-check
/**
 * HERO - a full-width banner: a background image (or color) under a title, a
 * sentence and a button.
 *
 * A SECTION with a background image, not `mj-hero`: the canvas engine draws
 * `mj-hero` squeezed into a narrow strip, so the screen would lie about the
 * email. A section background is drawn the same in both, and MJML adds the
 * VML that Outlook on Windows needs to show it.
 *
 * The background color stays set under the image: clients that block images
 * show it instead, and the white text stays readable on it. Once added, the
 * banner is a section like any other (`blocks/structure`): its image, size and
 * position are set there.
 */

import { DEFAULT_BUTTON_URL, FONT_STACK, PALETTE } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML =
  `<mj-section background-color="${PALETTE.navy}" background-size="cover" background-position="center center" ` +
  'background-repeat="no-repeat" padding-top="56px" padding-bottom="56px">' +
  '<mj-column>' +
  `<mj-text font-family="${FONT_STACK}" font-size="30px" line-height="38px" font-weight="bold" ` +
  `color="${PALETTE.white}" align="center" padding-left="32px" padding-right="32px">Your big announcement</mj-text>` +
  `<mj-text font-family="${FONT_STACK}" font-size="16px" line-height="24px" color="${PALETTE.border}" ` +
  'align="center" padding-left="32px" padding-right="32px">One sentence that makes people want to read on.</mj-text>' +
  `<mj-button href="${DEFAULT_BUTTON_URL}" background-color="${PALETTE.white}" color="${PALETTE.navy}" ` +
  `font-family="${FONT_STACK}" font-size="15px" font-weight="bold" border-radius="6px" ` +
  'inner-padding="12px 28px" align="center">Learn more</mj-button>' +
  '</mj-column>' +
  '</mj-section>';

/** @type {EmailBlock} */
export const heroBlock = {
  id: 'hero',
  label: 'Hero banner',
  description: 'Background image with a title and a button',
  icon: 'GalleryHorizontal',
  kind: 'layout',
  tagName: 'mj-section',
  order: 110,
  mjml: MJML,
  properties: [],
};
