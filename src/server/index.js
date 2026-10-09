// @ts-check
/**
 * best-email-builder/server — rendering, storage rules and HTTP routes (Node >= 20).
 *
 * Never import this entry from browser code: it compiles MJML with `mjml`.
 */

export { createEmailBuilderHandler } from './handler.js';
export { toNodeListener } from './node.js';
export { HttpError } from './errors.js';
export { createTemplateService, createMemoryTemplateRepository, MAX_ACTIVE_VERSIONS, LIMITS } from './templates.js';
export { createAssetService, createMemoryAssetRepository, inspectAsset } from './assets.js';
export { compileMjml } from './compileMjml.js';
export { compileTemplate, personalize, renderEmail, htmlToText } from './render.js';
export { sendTestEmail, MAX_TEST_RECIPIENTS } from './sendTest.js';

export { createVariableService, createMemoryVariableRepository } from './variables.js';
export {
  DEFAULT_VARIABLES,
  defineVariables,
  mergeVariables,
  tokenOf,
  keyFromLabel,
  validateCustomVariable,
} from '../features/variables/catalog.js';
export {
  applyVariables,
  applyVariablesToText,
  mapVariables,
  sampleValues,
  usedVariables,
  unknownVariables,
} from '../features/variables/service.js';
export { applyServiceLinks, absoluteAssetUrls, isAssetPath, DEFAULT_ASSETS_PATH } from '../renderer/links.js';
export { prepareMjml } from '../renderer/prepareMjml.js';
export { validateMjml, assertValidMjml } from '../validation/mjmlValidator.js';
export { validateProject, assertValidProject } from '../validation/projectValidator.js';
export { qualityReport, GMAIL_CLIP_BYTES } from '../validation/quality.js';
export { readDocument, createDocument, serializeDocument, EmailDocumentError } from '../core/document.js';
export { EMAIL_BUILDER_VERSION, EMAIL_DOCUMENT_SCHEMA_VERSION } from '../core/constants.js';
export { createTranslator, translatorFor, LOCALES } from '../i18n/index.js';
