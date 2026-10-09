// @ts-check
/**
 * BLOCK REGISTRY - `emailBlocks`.
 *
 * Each block lives in its own folder and depends only on the core. Removing a
 * line below removes the block from the sidebar, the properties panel and
 * drag and drop, without changing anything else.
 */

import { createRegistry } from '../core/registry.js';
import { bodyBlock, columnBlock, sectionBlock } from './structure/index.js';
import { textBlock } from './text/index.js';
import { imageBlock } from './image/index.js';
import { buttonBlock } from './button/index.js';
import { dividerBlock } from './divider/index.js';
import { spacerBlock } from './spacer/index.js';
import { oneColumnBlock, threeColumnsBlock, twoColumnsBlock } from './columns/index.js';

/** @typedef {import('../core/EmailEditor.js').EmailBlock} EmailBlock */

/** @type {EmailBlock[]} */
const BLOCKS = [
  textBlock,
  imageBlock,
  buttonBlock,
  dividerBlock,
  spacerBlock,
  oneColumnBlock,
  twoColumnsBlock,
  threeColumnsBlock,
  bodyBlock,
  sectionBlock,
  columnBlock,
];

export const emailBlocks = createRegistry('emailBlocks', BLOCKS);
