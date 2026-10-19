// @ts-check
/**
 * BLOCK A alone — the template library (`best-email-builder/library`).
 *
 * Imports nothing of the editor (no engine, no canvas, no MJML compiler):
 * *Edit* and *New template* only call `onEdit(template)` / `onCreate()`, and
 * the host opens whatever editor it wants — this package's `EmailBuilder` or
 * its own. See the README, "Block A with your own editor".
 */

export { default as TemplateLibrary } from './ui/library/TemplateLibrary.jsx';
export { createHttpStorage, createMemoryStorage, StorageError } from './storage/client.js';
export { withPlaceholderImages } from './features/templates/thumbnails.js';
export { MAX_TEMPLATE_TAGS, TAG_COLORS, validateTag } from './features/tags/tags.js';
export { createTranslator, translatorFor, LOCALES } from './i18n/index.js';
export { EMAIL_BUILDER_VERSION } from './core/constants.js';
