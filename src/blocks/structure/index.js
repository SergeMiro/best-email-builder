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
    prop.padding('padding', 'Padding'),
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
    prop.background('background-color', 'Background'),
    prop.padding('padding', 'Padding'),
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
