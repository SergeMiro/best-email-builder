// @ts-check
/**
 * STRUCTURE - body, section, column.
 *
 * These are not blocks you add (no `mjml`): they are the containers you
 * SELECT, whose background and padding are set in the right-hand panel. The
 * N-column layouts (`blocks/columns`) create sections; once added, this
 * definition describes them.
 */

import { GROUPS, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

/** @type {EmailBlock} */
export const bodyBlock = {
  id: 'body',
  label: 'Email',
  icon: 'Mail',
  kind: 'structure',
  tagName: 'mj-body',
  order: 900,
  properties: [
    prop.background('background-color', 'Page background'),
    // Under the sections, at the content's width: what the rounded corners
    // of a section show. Empty, they show the page background. Not an MJML
    // attribute: the engine writes it as an `mj-wrapper` (engine/mjml.js).
    prop.background('content-background-color', 'Background under the content'),
    {
      key: 'width',
      label: 'Content width',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: '600px', label: '600 px (standard)' },
        { value: '640px', label: '640 px' },
      ],
    },
  ],
};

/** @type {EmailBlock} */
export const sectionBlock = {
  id: 'section',
  label: 'Section',
  icon: 'Rows3',
  kind: 'structure',
  tagName: 'mj-section',
  order: 901,
  properties: [
    prop.background('background-color', 'Background'),
    // A background image keeps the color under it: shown when images are blocked.
    { key: 'background-url', label: 'Background image', type: 'image', group: GROUPS.colors },
    {
      key: 'background-size',
      label: 'Image size',
      type: 'select',
      group: GROUPS.colors,
      options: [
        { value: 'cover', label: 'Fill the section' },
        { value: 'contain', label: 'Whole image' },
        { value: 'auto', label: 'Original size' },
      ],
    },
    {
      key: 'background-position',
      label: 'Image position',
      type: 'select',
      group: GROUPS.colors,
      options: [
        { value: 'center center', label: 'Center' },
        { value: 'center top', label: 'Top' },
        { value: 'center bottom', label: 'Bottom' },
      ],
    },
    {
      // A colored band from edge to edge of the screen (headers, footers);
      // the content keeps the email's width.
      key: 'full-width',
      label: 'Background width',
      type: 'select',
      group: GROUPS.colors,
      options: [
        { value: '', label: 'Content width' },
        { value: 'full-width', label: 'Whole screen' },
      ],
    },
    prop.border(),
    prop.padding('padding', 'Padding', 'padding'),
    prop.radius(24),
  ],
};

/** @type {EmailBlock} */
export const columnBlock = {
  id: 'column',
  label: 'Column',
  icon: 'Columns2',
  kind: 'structure',
  tagName: 'mj-column',
  order: 902,
  properties: [
    {
      // Share of the section's width. The other columns of the section share
      // the rest (the engine balances them: MJML would leave a gap).
      key: 'width',
      label: 'Width',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: '', label: 'Equal' },
        { value: '25%', label: '1/4' },
        { value: '33%', label: '1/3' },
        { value: '50%', label: '1/2' },
        { value: '67%', label: '2/3' },
        { value: '75%', label: '3/4' },
      ],
    },
    prop.background('background-color', 'Background'),
    prop.border(),
    prop.padding('padding', 'Padding', 'padding'),
    {
      key: 'vertical-align',
      label: 'Vertical alignment',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: 'top', label: 'Top' },
        { value: 'middle', label: 'Middle' },
        { value: 'bottom', label: 'Bottom' },
      ],
    },
  ],
};
