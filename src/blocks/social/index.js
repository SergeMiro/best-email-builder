// @ts-check
/**
 * SOCIAL LINKS - `mj-social` and its `mj-social-element` icons.
 *
 * MJML draws each icon as an image in a table cell, so the row holds in
 * Outlook. The networks use their `-noshare` variant: the link goes to the
 * page given (the company's profile), not to a "share this" dialog.
 *
 * The icons are MJML's own, served over https by Mailjet; a network can be
 * changed, a link duplicated (one more network) or deleted from the panel.
 * No text next to the icons: the row stays readable on a phone.
 */

import { GROUPS, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

/** Networks MJML ships an icon for (server and canvas). */
export const SOCIAL_NETWORKS = [
  { value: 'facebook-noshare', label: 'Facebook', href: 'https://www.facebook.com/' },
  { value: 'instagram-noshare', label: 'Instagram', href: 'https://www.instagram.com/' },
  { value: 'linkedin-noshare', label: 'LinkedIn', href: 'https://www.linkedin.com/' },
  { value: 'x-noshare', label: 'X', href: 'https://x.com/' },
  { value: 'youtube-noshare', label: 'YouTube', href: 'https://www.youtube.com/' },
  { value: 'github-noshare', label: 'GitHub', href: 'https://github.com/' },
];

const DEFAULT_NETWORKS = ['facebook-noshare', 'instagram-noshare', 'linkedin-noshare', 'x-noshare'];

const MJML =
  '<mj-social mode="horizontal" align="center" icon-size="28px" border-radius="14px" inner-padding="6px">' +
  DEFAULT_NETWORKS.map((name) => {
    const network = SOCIAL_NETWORKS.find((n) => n.value === name);
    return `<mj-social-element name="${name}" href="${network?.href}"></mj-social-element>`;
  }).join('') +
  '</mj-social>';

/** @type {EmailBlock} */
export const socialBlock = {
  id: 'social',
  label: 'Social links',
  description: 'Icons linking to your profiles',
  icon: 'Share2',
  kind: 'content',
  tagName: 'mj-social',
  order: 60,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  properties: [
    { key: 'icon-size', label: 'Icon size', type: 'size', group: GROUPS.layout, min: 16, max: 48, unit: 'px' },
    prop.radius(24),
    prop.align(),
    {
      key: 'mode',
      label: 'Direction',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: 'horizontal', label: 'Horizontal' },
        { value: 'vertical', label: 'Vertical' },
      ],
    },
    prop.padding(undefined, undefined, 'margin'),
    prop.padding('inner-padding', 'Space around each icon'),
  ],
};

/** One icon of the row: selectable, not addable (duplicate it instead). */
/** @type {EmailBlock} */
export const socialElementBlock = {
  id: 'social-element',
  label: 'Social link',
  icon: 'Link',
  kind: 'structure',
  tagName: 'mj-social-element',
  order: 903,
  properties: [
    {
      key: 'name',
      label: 'Network',
      type: 'select',
      group: GROUPS.content,
      options: SOCIAL_NETWORKS.map(({ value, label }) => ({ value, label })),
    },
    prop.href('Profile URL'),
    prop.background('background-color', 'Icon background'),
  ],
};
