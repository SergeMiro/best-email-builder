// @ts-check
/**
 * BEST EMAIL BUILDER — entry point.
 *
 *   src/
 *     core/        EmailEditor contract, versioned document, registries
 *     engine/      the builder's own engine: email model, MJML ⇄ model, canvas
 *     blocks/      one folder per block + the `emailBlocks` registry
 *     features/    one folder per feature + `emailBuilderFeatures`
 *     ui/          the React UI, which only talks to EmailEditor
 *     storage/     reading/writing templates (client and server)
 *     renderer/    MJML → final HTML (server compilation, variables, links)
 *     validation/  what a template is allowed to contain
 *
 * See `docs/ARCHITECTURE.md`.
 */

export { createEmailEditor } from './core/EmailEditor.js';
export { emailBlocks } from './blocks/index.js';
export { emailBuilderFeatures, isFeatureEnabled } from './features/index.js';
export { createDefaultEmailEditor } from './defaultEditor.js';

/* ── React interface ─────────────────────────────────────────────────────── */
export { default as EmailBuilder } from './ui/EmailBuilder.jsx';
export { default as TemplateLibrary } from './ui/library/TemplateLibrary.jsx';
export { default as EmailStudio } from './ui/EmailStudio.jsx';
export { default as EmailBuilderBoundary } from './ui/EmailBuilderBoundary.jsx';
export { default as EmailCanvas } from './ui/EmailCanvas.jsx';
export { UiProvider, useUi, useT } from './ui/context.jsx';

/* ── Storage (browser) ───────────────────────────────────────────────────── */
export { createHttpStorage, createMemoryStorage, StorageError } from './storage/client.js';

/* ── Engine, document, registries ────────────────────────────────────────── */
export { createNativeAdapter, ENGINE_NAME, EMPTY_MJML } from './engine/NativeAdapter.js';
export { parseMjml, parseMjmlFragment, serializeMjml } from './engine/mjml.js';
export { createRegistry } from './core/registry.js';
export { readDocument, createDocument, serializeDocument, EmailDocumentError } from './core/document.js';
export { EMAIL_BUILDER_VERSION, EMAIL_DOCUMENT_SCHEMA_VERSION, EMAIL_DEVICES } from './core/constants.js';

/* ── Variables, templates, rendering helpers shared with the server ──────── */
export {
  DEFAULT_VARIABLES,
  CUSTOM_GROUP,
  defineVariables,
  mergeVariables,
  keyFromLabel,
  validateCustomVariable,
  tokenOf,
} from './features/variables/catalog.js';
export { applyVariables, applyVariablesToText, usedVariables, unknownVariables } from './features/variables/service.js';
export { createStarterMjml, STARTER_MJML } from './features/templates/starter.js';
export { TEMPLATE_GALLERY, buildGallery, withPlaceholderImages } from './features/templates/gallery.js';
export { isAssetPath, absoluteAssetUrls, DEFAULT_ASSETS_PATH } from './renderer/links.js';

/* ── Generation (AI) — the model runs where its key is: usually the server ── */
export { createEmailGenerator } from './features/generate/generator.js';
export { claudeEmailModel, DEFAULT_CLAUDE_MODEL } from './features/generate/claude.js';
export { EmailGenerationError } from './features/generate/draft.js';
export { EMAIL_PURPOSES, PURPOSE_CATEGORIES } from './features/generate/purposes.js';
export { REWRITE_ACTIONS, REWRITE_LANGUAGES } from './features/generate/rewrite.js';
export { applyBrand, cleanBrand, brandedSender } from './features/brand/brand.js';

/* ── Translations ────────────────────────────────────────────────────────── */
export { createTranslator, translatorFor, LOCALES } from './i18n/index.js';
