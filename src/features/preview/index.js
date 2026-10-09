// @ts-check
/**
 * PREVIEW feature: server rendering of the final email, desktop and mobile,
 * with the quality checks (`PreviewButton`). Shown when the storage can render.
 */

import PreviewButton from './PreviewButton.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const previewFeature = {
  id: 'preview',
  label: 'Preview',
  order: 40,
  toolbar: PreviewButton,
  isAvailable: (context) => typeof context.storage?.render === 'function',
};
