// @ts-check
/**
 * The editor wired to the default engine and the built-in registries. In a
 * module of its own so the builder can use it without importing the package
 * entry (and, through it, the template bank).
 */

import { createEmailEditor } from './core/EmailEditor.js';
import { createNativeAdapter } from './engine/NativeAdapter.js';
import { emailBlocks } from './blocks/index.js';
import { emailBuilderFeatures } from './features/index.js';
import { translatorFor } from './i18n/index.js';

/**
 * An editor wired to the default engine and the built-in registries.
 *
 * @param {{locale?: string, t?: import('./i18n/index.js').Translate, imageUrl?: ((path: string) => string)|null}} [options]
 *   `t`: the interface's translator (texts of inserted blocks, names in the
 *   canvas); by default the built-in one of `locale` (`'en'`).
 *   `imageUrl`: where the canvas shows an uploaded image from (the storage's `imageUrl`).
 */
export function createDefaultEmailEditor(options = {}) {
  const { locale = 'en', t = translatorFor(locale), imageUrl = null } = options;
  return createEmailEditor({
    adapter: createNativeAdapter({ imageUrl }),
    blocks: emailBlocks,
    features: emailBuilderFeatures,
    t,
  });
}
