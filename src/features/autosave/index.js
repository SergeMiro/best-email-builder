// @ts-check
/**
 * AUTOSAVE feature.
 *
 *   template already saved → server save WITHOUT a new version, 20 s after
 *     the last change (at most 2 min after the first one);
 *   template never saved → local draft (`localDraft.js`), offered the next
 *     time a new template is opened.
 *
 * The screen reads `options`; removing this entry from the registry turns both
 * off.
 */

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature & {options: {idleMs: number, maxWaitMs: number, draftDelayMs: number}}} */
export const autosaveFeature = {
  id: 'autosave',
  label: 'Autosave',
  order: 20,
  options: { idleMs: 20_000, maxWaitMs: 120_000, draftDelayMs: 1_500 },
};
