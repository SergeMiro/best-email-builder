// @ts-check
/**
 * GENERATE feature: an email written from scratch by AI, from what it is for
 * (`GenerateButton`). Shown when the storage can generate — the host decides,
 * since generation needs a model and its key (see `createEmailGenerator`).
 */

import GenerateButton from './GenerateButton.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const generateFeature = {
  id: 'generate',
  label: 'Generate',
  order: 4,
  toolbar: GenerateButton,
  isAvailable: (context) => typeof context.storage?.generate === 'function',
};
