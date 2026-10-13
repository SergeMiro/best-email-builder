// @ts-check
/**
 * BLOCK A alone — the template bank (`best-email-builder/library`).
 *
 * Imports nothing of the editor (no engine, no canvas, no MJML compiler):
 * *Edit*, *New template* and *Start from this base* only call
 * `onEdit(template)` / `onCreate(start)`, and the host opens whatever editor
 * it wants — this package's `EmailBuilder` or its own. See the README, "Block A with your own
 * editor".
 */

export { default as TemplateLibrary } from './ui/library/TemplateLibrary.jsx';
export { createHttpStorage, createMemoryStorage, StorageError } from './storage/client.js';
export { TEMPLATE_GALLERY, buildGallery, withPlaceholderImages } from './features/templates/gallery.js';
export { createTranslator, translatorFor, LOCALES } from './i18n/index.js';
export { EMAIL_BUILDER_VERSION } from './core/constants.js';
