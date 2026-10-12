// @ts-check
/**
 * TEMPLATES feature: the gallery of ready-made emails (`TemplateGalleryButton`).
 * Shown when the builder has templates to offer (`templates` prop, `[]` hides
 * it).
 */

import TemplateGalleryButton from './TemplateGallery.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const templatesFeature = {
  id: 'templates',
  label: 'Templates',
  order: 5,
  toolbar: TemplateGalleryButton,
  isAvailable: (context) => Array.isArray(context.templates) && context.templates.length > 0,
};
