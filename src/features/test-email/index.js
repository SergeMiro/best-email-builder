// @ts-check
/**
 * TEST SEND feature (`TestEmailButton`) — rendering and sending by the server
 * (`sendTestEmail`). Shown when the storage can send tests.
 */

import TestEmailButton from './TestEmailButton.jsx';

/** @type {import('../../core/EmailEditor.js').EmailBuilderFeature} */
export const testEmailFeature = {
  id: 'test-email',
  label: 'Send a test',
  order: 50,
  toolbar: TestEmailButton,
  isAvailable: (context) => typeof context.storage?.sendTest === 'function',
};
