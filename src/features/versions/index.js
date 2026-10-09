// @ts-check
/**
 * VERSIONS feature: toolbar button (`VersionsMenu`).
 */

import VersionsMenu from './VersionsMenu.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const versionsFeature = {
  id: 'versions',
  label: 'Versions',
  order: 30,
  toolbar: VersionsMenu,
};
