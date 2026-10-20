// @ts-check
/**
 * BLOCK B alone — the editor (`best-email-builder/builder`).
 *
 * Imports nothing of the template library: an application that has its own list
 * of templates connects it through `EmailBuilder`'s props (`templateId`,
 * `initialMjml`, `initialMeta` in; `onSaved`, `onClose` out). See the README,
 * "Block B with your own library".
 */

export { default as EmailBuilder } from './ui/EmailBuilder.jsx';
export { default as EmailBuilderBoundary } from './ui/EmailBuilderBoundary.jsx';
export { createHttpStorage, createMemoryStorage, StorageError } from './storage/client.js';
export { createStarterMjml, STARTER_MJML } from './features/templates/starter.js';
export { TEMPLATE_GALLERY, buildGallery } from './features/templates/gallery.js';
export { DEFAULT_VARIABLES, EXAMPLE_VARIABLES, CUSTOM_GROUP, defineVariables, mergeVariables } from './features/variables/catalog.js';
export { createTranslator, translatorFor, LOCALES } from './i18n/index.js';
export { EMAIL_BUILDER_VERSION } from './core/constants.js';
