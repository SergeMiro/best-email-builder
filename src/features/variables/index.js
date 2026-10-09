// @ts-check
/**
 * VARIABLES feature: insertion menu (`VariablesMenu`), creation and editing of
 * custom variables (`VariableDialog`). The catalog (`catalog.js`) and the
 * replacement (`service.js`) are shared with the server.
 */

import VariablesMenu from './VariablesMenu.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const variablesFeature = {
  id: 'variables',
  label: 'Variables',
  order: 10,
  toolbar: VariablesMenu,
};
