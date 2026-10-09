// @ts-check
/**
 * DIVIDER - `mj-divider`.
 *
 * A thin rule in the default border color. MJML renders it as a `<p>` border
 * backed by a table for Outlook: it keeps its thickness everywhere, whereas an
 * `<hr>` varies from one email client to another.
 */

import { GROUPS, PALETTE, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML = `<mj-divider border-color="${PALETTE.border}" border-width="1px"></mj-divider>`;

/** @type {EmailBlock} */
export const dividerBlock = {
  id: 'divider',
  label: 'Divider',
  description: 'Horizontal rule',
  icon: 'SeparatorHorizontal',
  kind: 'content',
  tagName: 'mj-divider',
  order: 40,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  properties: [
    prop.background('border-color', 'Line color'),
    { key: 'border-width', label: 'Thickness', type: 'size', group: GROUPS.layout, min: 1, max: 10, unit: 'px' },
    {
      key: 'border-style',
      label: 'Line style',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'dashed', label: 'Dashed' },
        { value: 'dotted', label: 'Dotted' },
      ],
    },
    {
      key: 'width',
      label: 'Length',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: '100%', label: 'Full length' },
        { value: '75%', label: '75%' },
        { value: '50%', label: '50%' },
        { value: '25%', label: '25%' },
      ],
    },
    prop.align(),
    prop.padding(),
  ],
};
