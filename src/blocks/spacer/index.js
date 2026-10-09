// @ts-check
/**
 * SPACER - `mj-spacer`.
 *
 * Fixed-height empty space. MJML renders it as a `<div>` with an explicit line
 * height (`mso-line-height-rule: exactly`): Outlook, which ignores margins,
 * honors it.
 */

import { GROUPS, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML = '<mj-spacer height="24px"></mj-spacer>';

/** @type {EmailBlock} */
export const spacerBlock = {
  id: 'spacer',
  label: 'Spacer',
  description: 'Vertical space',
  icon: 'MoveVertical',
  kind: 'content',
  tagName: 'mj-spacer',
  order: 50,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  properties: [
    { key: 'height', label: 'Height', type: 'size', group: GROUPS.layout, min: 4, max: 200, unit: 'px' },
    prop.background('container-background-color', 'Background'),
  ],
};
