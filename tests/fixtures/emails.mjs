/**
 * The emails the rendering tests check (tests/unit/email-clients.test.mjs,
 * e2e/rendering.stories.spec.js): the starter, every gallery template, and a
 * kitchen sink holding every block of the sidebar plus what the panel adds.
 * Each one goes through the builder's model first, as it would be saved.
 */

import { TEMPLATE_GALLERY, buildGallery } from '../../src/features/templates/gallery.js';
import { createStarterMjml } from '../../src/features/templates/starter.js';
import { resolveBlock } from '../../src/core/EmailEditor.js';
import { emailBlocks } from '../../src/blocks/index.js';
import { parseMjml, serializeMjml } from '../../src/engine/mjml.js';

const SENDER = { name: 'ACME', address: '1 Main Street, Springfield' };

/** Every block of the sidebar, one after the other, plus what the panel adds. */
export function kitchenSinkMjml() {
  const parts = emailBlocks
    .list((b) => b.mjml)
    .map((block) => {
      const { mjml, sectionMjml } = resolveBlock(block);
      return block.kind === 'layout' ? mjml : sectionMjml;
    })
    .join('');
  return (
    '<mjml><mj-body background-color="#eceff4" width="600px">' +
    parts +
    // Panel features: unequal columns, a full-width band, a fluid image, a background image.
    '<mj-section background-color="#ffffff">' +
    '<mj-column width="33%"><mj-image src="https://example.com/a.png" alt="A" width="120px" fluid-on-mobile="true" /></mj-column>' +
    '<mj-column width="67%"><mj-text font-family="Arial, Helvetica, sans-serif" font-size="15px" color="#2b3038">Two thirds</mj-text></mj-column>' +
    '</mj-section>' +
    '<mj-section full-width="full-width" background-color="#212e5a" background-url="https://example.com/band.jpg" background-size="cover">' +
    '<mj-column><mj-text font-family="Arial, Helvetica, sans-serif" font-size="15px" color="#ffffff">Band</mj-text></mj-column>' +
    '</mj-section>' +
    '<mj-section><mj-column><mj-text font-family="Arial, Helvetica, sans-serif" font-size="12px" color="#6d7484" align="center">' +
    'ACME · 1 Main Street<br /><a href="{{ unsubscribe }}">Unsubscribe</a></mj-text></mj-column></mj-section>' +
    '</mj-body></mjml>'
  );
}

/** The emails checked: the starter, every gallery template, the kitchen sink. */
export function emails() {
  const list = [{ id: 'starter', mjml: createStarterMjml({ sender: SENDER }) }];
  for (const entry of buildGallery({ templates: TEMPLATE_GALLERY, sender: SENDER })) list.push({ id: entry.id, mjml: entry.mjml });
  list.push({ id: 'kitchen-sink', mjml: kitchenSinkMjml() });
  // Through the model, as the builder saves them.
  return list.map(({ id, mjml }) => ({ id, mjml: serializeMjml(parseMjml(mjml)) }));
}

