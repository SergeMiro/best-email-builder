// @ts-check
/**
 * The editor wired to the default engine and the built-in registries. In a
 * module of its own so the builder can use it without importing the package
 * entry (and, through it, the template bank).
 */

import { createEmailEditor } from './core/EmailEditor.js';
import { createGrapesJsAdapter } from './adapters/grapesjs/GrapesJsAdapter.js';
import { emailBlocks } from './blocks/index.js';
import { emailBuilderFeatures } from './features/index.js';

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
