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

import { PALETTE } from '../shared.js';
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
