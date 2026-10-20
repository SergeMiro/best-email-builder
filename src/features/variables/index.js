// @ts-check
/**
 * VARIABLES feature: the bar above the canvas (`VariablesBar`) that inserts
 * them, and creation and editing of custom variables (`VariableDialog`). The
 * catalog (`catalog.js`) and the replacement (`service.js`) are shared with
 * the server.
 */

import VariablesBar from './VariablesBar.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const variablesFeature = {
  id: 'variables',
  label: 'Variables',
  order: 10,
  canvasBar: VariablesBar,
};
