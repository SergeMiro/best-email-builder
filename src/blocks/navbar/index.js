// @ts-check
/**
 * MENU - `mj-navbar` and its `mj-navbar-link` links.
 *
 * A row of text links (shop, blog, contact…) under the logo. No "hamburger"
 * mode: MJML builds it with a hidden checkbox, an `<input>` that several
 * clients strip and the template validator refuses; a short row of links
 * wraps on a phone by itself.
 *
 * Each link is edited like a button: its label in the panel, its URL, its
 * color. Duplicate a link to add one.
 */

import { identity } from '../../i18n/index.js';
import { FONT_STACK, GROUPS, PALETTE, escapeXml, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

/** @param {string} label @param {string} href */
function link(label, href) {
  return (
    `<mj-navbar-link href="${href}" font-family="${FONT_STACK}" font-size="14px" color="${PALETTE.navy}" ` +
    `text-transform="none" padding-top="8px" padding-right="12px" padding-bottom="8px" padding-left="12px">${escapeXml(label)}</mj-navbar-link>`
  );
}

/** @param {import('../../i18n/index.js').Translate} [t] */
const mjml = (t = identity) =>
  '<mj-navbar align="center">' +
  link(t('Shop'), 'https://example.com/shop') +
  link(t('Blog'), 'https://example.com/blog') +
  link(t('Contact'), 'https://example.com/contact') +
  '</mj-navbar>';

/** @type {EmailBlock} */
export const navbarBlock = {
  id: 'navbar',
  label: 'Menu',
  description: 'Row of links to your site',
  icon: 'Menu',
  kind: 'content',
  tagName: 'mj-navbar',
  order: 70,
  mjml,
  sectionMjml: (t) => inWhiteSection(mjml(t)),
  properties: [prop.align()],
};

/** One link of the menu: selectable, not addable (duplicate it instead). */
/** @type {EmailBlock} */
export const navbarLinkBlock = {
  id: 'navbar-link',
  label: 'Menu link',
  icon: 'Link',
  kind: 'structure',
  tagName: 'mj-navbar-link',
  order: 904,
  editableContent: true,
  properties: [
    prop.href('Link URL'),
    prop.color('Text'),
    prop.fontFamily(),
    prop.fontSize(10, 24),
    {
      // MJML writes menu links in capitals unless told otherwise.
      key: 'text-transform',
      label: 'Capitals',
      type: 'select',
      group: GROUPS.typography,
      options: [
        { value: 'none', label: 'As typed' },
        { value: 'uppercase', label: 'All capitals' },
        { value: 'capitalize', label: 'First letters' },
      ],
    },
    prop.padding(),
  ],
};
