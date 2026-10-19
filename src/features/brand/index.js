// @ts-check
/**
 * BRAND feature: the company's logo, colors and font, set once (`BrandButton`)
 * and used by every new email, template and block (`brand.js`), optionally
 * read from the company's website (the server's `createBrandImporter`). Shown
 * when the storage keeps a brand.
 */

import BrandButton from './BrandButton.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const brandFeature = {
  id: 'brand',
  label: 'Brand',
  order: 6,
  toolbar: BrandButton,
  isAvailable: (context) => typeof context.storage?.saveBrand === 'function',
};
