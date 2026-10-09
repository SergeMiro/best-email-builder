// @ts-check
/**
 * MAILBLOCKS — entry point.
 *
 *   src/
 *     core/        EmailEditor contract, versioned document, registries
 *     adapters/    the engine (GrapesJS + MJML) — the only place that knows it
 *     blocks/      one folder per block + the `emailBlocks` registry
 *     features/    one folder per feature + `emailBuilderFeatures`
 *     ui/          the React UI, which only talks to EmailEditor
 *     storage/     reading/writing templates (client and server)
 *     renderer/    MJML → final HTML (server compilation, variables, links)
 *     validation/  what a template is allowed to contain
 *
 * See `docs/ARCHITECTURE.md`.
 */

import { createEmailEditor } from './core/EmailEditor.js';
import { createGrapesJsAdapter } from './adapters/grapesjs/GrapesJsAdapter.js';
import { emailBlocks } from './blocks/index.js';
import { emailBuilderFeatures } from './features/index.js';

export { createEmailEditor } from './core/EmailEditor.js';
export { emailBlocks } from './blocks/index.js';
export { emailBuilderFeatures, isFeatureEnabled } from './features/index.js';

/**
 * An editor wired to the default engine and the built-in registries.
 *
 * @param {{locale?: string}} [options]  `locale`: engine UI locale (`'en'` by default)
 */
export function createDefaultEmailEditor(options = {}) {
  const { locale } = options;
  return createEmailEditor({
    adapter: createGrapesJsAdapter({ locale }),
    blocks: emailBlocks,
    features: emailBuilderFeatures,
  });
}

/* ── React interface ─────────────────────────────────────────────────────── */
export { default as EmailBuilder } from './ui/EmailBuilder.jsx';
export { default as EmailBuilderBoundary } from './ui/EmailBuilderBoundary.jsx';
export { default as EmailCanvas } from './ui/EmailCanvas.jsx';
export { UiProvider, useUi, useT } from './ui/context.jsx';

/* ── Storage (browser) ───────────────────────────────────────────────────── */
export { createHttpStorage, createMemoryStorage, StorageError } from './storage/client.js';

/* ── Engine, document, registries ────────────────────────────────────────── */
export { createGrapesJsAdapter } from './adapters/grapesjs/GrapesJsAdapter.js';
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
export { isAssetPath, absoluteAssetUrls, DEFAULT_ASSETS_PATH } from './renderer/links.js';

/* ── Translations ────────────────────────────────────────────────────────── */
export { createTranslator, translatorFor, LOCALES } from './i18n/index.js';
