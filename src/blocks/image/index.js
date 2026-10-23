// @ts-check
/**
 * IMAGE - `mj-image`.
 *
 * Added WITHOUT a file: the canvas shows a frame to fill, and the panel (file
 * upload or https URL) completes it. A sample image from a third-party service
 * would, one day, end up in a real send.
 *
 * Width is left to MJML (the full column, shrunk on mobile): a fixed width
 * larger than the column would overflow in Outlook.
 *
 * The alt text is not decorative: Outlook blocks images by default, and the
 * recipient reads the alt text in their place.
 */

import { GROUPS, inWhiteSection, prop } from '../shared.js';

/** @typedef {import('../../core/EmailEditor.js').EmailBlock} EmailBlock */

const MJML = '<mj-image align="center"></mj-image>';

/** @type {EmailBlock} */
export const imageBlock = {
  id: 'image',
  label: 'Image',
  description: 'Photo, visual or logo',
  icon: 'Image',
  kind: 'content',
  tagName: 'mj-image',
  order: 20,
  mjml: MJML,
  sectionMjml: inWhiteSection(MJML),
  properties: [
    { key: 'src', label: 'Image', type: 'image', group: GROUPS.content },
    {
      key: 'alt',
      label: 'Alt text',
      type: 'text',
      group: GROUPS.content,
      placeholder: 'Describes the image if it is blocked',
    },
    prop.href('Link on click'),
    { key: 'width', label: 'Width', type: 'size', group: GROUPS.layout, min: 20, max: 600, unit: 'px' },
    {
      // A photo given a width keeps it on a phone unless told otherwise.
      key: 'fluid-on-mobile',
      label: 'On mobile',
      type: 'select',
      group: GROUPS.layout,
      options: [
        { value: '', label: 'Keep its width' },
        { value: 'true', label: 'Full width' },
      ],
    },
    prop.align(),
    prop.radius(),
    prop.padding(undefined, undefined, 'margin'),
    prop.border(),
  ],
};
