// @ts-check
/**
 * VARIABLES feature: the Variables button at the end of the canvas's ribbon,
 * the panel it opens beside the canvas (`VariablesPanel`) that inserts them,
 * and creation and editing of custom variables (`VariableDialog`). The
 * catalog (`catalog.js`) and the replacement (`service.js`) are shared with
 * the server.
 */

import { Braces } from 'lucide-react';
import VariablesPanel from './VariablesPanel.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const variablesFeature = {
  id: 'variables',
  label: 'Variables',
  order: 10,
  drawer: { icon: Braces, label: 'Variables', title: 'Email provider variables', panel: VariablesPanel },
  // Nothing to insert and nothing to create: no button.
  isAvailable: (context) => context.variables.length > 0 || context.canManageVariables,
};
