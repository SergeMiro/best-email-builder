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
import { headingBlock } from './heading/index.js';
import { socialBlock, socialElementBlock } from './social/index.js';
import { navbarBlock, navbarLinkBlock } from './navbar/index.js';
import { heroBlock } from './hero/index.js';
import {
  fourColumnsBlock,
  imageTextBlock,
  oneColumnBlock,
  threeColumnsBlock,
  twoColumnsBlock,
} from './columns/index.js';

/** @typedef {import('../core/EmailEditor.js').EmailBlock} EmailBlock */

/** @type {EmailBlock[]} */
const BLOCKS = [
  headingBlock,
  textBlock,
  imageBlock,
  buttonBlock,
  dividerBlock,
  spacerBlock,
  socialBlock,
  navbarBlock,
  oneColumnBlock,
  twoColumnsBlock,
  threeColumnsBlock,
  fourColumnsBlock,
  imageTextBlock,
  heroBlock,
  bodyBlock,
  sectionBlock,
  columnBlock,
  socialElementBlock,
  navbarLinkBlock,
];

export const emailBlocks = createRegistry('emailBlocks', BLOCKS);
