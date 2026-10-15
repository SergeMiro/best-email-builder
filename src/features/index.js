// @ts-check
/**
 * FEATURES REGISTRY — `emailBuilderFeatures`.
 *
 * A feature (templates, versions, preview, variables, test send…) is a self-contained
 * module. The interface asks this registry what to show; disabling an entry
 * (`enabled: false`) or removing it from here is enough to make it disappear.
 * A toolbar feature may also declare `isAvailable(context)`: the preview, for
 * instance, only appears when the storage can render.
 */

import { createRegistry } from '../core/registry.js';
import { autosaveFeature } from './autosave/index.js';
import { versionsFeature } from './versions/index.js';
import { variablesFeature } from './variables/index.js';
import { previewFeature } from './preview/index.js';
import { testEmailFeature } from './test-email/index.js';
import { templatesFeature } from './templates/index.js';
import { brandFeature } from './brand/index.js';

/** @typedef {import('../core/EmailEditor.js').EmailBuilderFeature} EmailBuilderFeature */

/** @type {EmailBuilderFeature[]} */
const FEATURES = [
  templatesFeature,
  brandFeature,
  variablesFeature,
  autosaveFeature,
  versionsFeature,
  previewFeature,
  testEmailFeature,
];

export const emailBuilderFeatures = createRegistry('emailBuilderFeatures', FEATURES);

/** Is a feature enabled? @param {string} id */
export function isFeatureEnabled(id) {
  const feature = emailBuilderFeatures.get(id);
  return Boolean(feature && feature.enabled !== false);
}
