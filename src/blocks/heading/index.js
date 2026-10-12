// @ts-check
/**
 * HEADING - an `mj-text` set as a title.
 *
 * Not a tag of its own: MJML has no heading element, and a `<h1>` inside
 * `mj-text` would bring each email client's default margins and sizes. It is
 * a text written large and bold - the same element as the Text block, so once
 * added it is described by that block (`insertOnly`): same panel, same
 * properties, weight included.
 */

import { FONT_STACK, PALETTE, inWhiteSection } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML =
  `<mj-text font-family="${FONT_STACK}" font-size="26px" line-height="34px" font-weight="bold" ` +
  `color="${PALETTE.navy}" align="left">Your headline</mj-text>`;

/** @type {EmailBlock} */
export const headingBlock = {
  id: 'heading',
  label: 'Heading',
  description: 'Large bold title',
  icon: 'Heading',
  kind: 'content',
  tagName: 'mj-text',
  insertOnly: true,
  order: 5,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  editableContent: true,
  properties: [],
};
