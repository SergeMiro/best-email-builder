import { prepareColumnAlignment } from '../../src/renderer/columnAlignment.js';
/**
 * EMAIL CLIENTS — what the server compiles is checked against the rules
 * Outlook, Gmail and Apple Mail impose. They cannot run here; the HTML they
 * would receive can be read:
 *
 *   Outlook (Word engine)  every section and column also laid out by tables in
 *                          `<!--[if mso]>` comments; background images in VML;
 *                          buttons as tables; images with a `width` attribute
 *   Gmail                  under 102 KB (clipped beyond), no external style
 *                          sheet or font, no CSS it drops (flex, grid, position)
 *   every client           mobile media queries, and a fallback that stacks the
 *                          columns where `<style>` is stripped; images with alt
 *                          text and no border; links absolute or merge tags
 *   Apple Mail / iOS       no rescaling, no automatic blue links
 *
 * And what the canvas shows is what is sent: the canvas compiler
 * (mjml-browser) and the server's (mjml) give the same body.
 *
 * The browser-side rendering (widths, stacking, overflow) is checked by
 * e2e/rendering.stories.spec.js.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import mjmlBrowser from 'mjml-browser';
import { compileMjml } from '../../src/server/compileMjml.js';
import { compileTemplate } from '../../src/server/render.js';
import { countImagesWithoutPicture, prepareMjml } from '../../src/renderer/prepareMjml.js';
import { validateMjml } from '../../src/validation/mjmlValidator.js';
import { functionExport } from '../../src/engine/unwrapModule.js';
import { emails } from '../fixtures/emails.mjs';

const compiled = await Promise.all(
  emails().map(async ({ id, mjml }) => {
    const prepared = prepareMjml(mjml, { title: 'Subject', preheader: 'Preview' });
    const { html, warnings } = await compileMjml(prepared);
    return { id, mjml, prepared, html, warnings };
  })
);

test('every email validates and compiles without MJML warning', () => {
  // The starter, the six gallery templates, the kitchen sink.
  assert.equal(compiled.length, 8);
  for (const { id, mjml, warnings } of compiled) {
    const { ok, issues } = validateMjml(mjml);
    assert.ok(ok, `${id}: ${issues.map((i) => i.message).join('; ')}`);
    assert.deepEqual(warnings, [], id);
  }
});

test('Gmail: under the 102 KB clipping limit, no external style sheet or font, no CSS it drops', () => {
  for (const { id, html } of compiled) {
    assert.ok(Buffer.byteLength(html) < 102 * 1024, `${id}: ${Buffer.byteLength(html)} bytes`);
    assert.ok(!/<link\b[^>]*stylesheet/i.test(html), `${id}: external style sheet`);
    assert.ok(!/@import|fonts\.googleapis/i.test(html), `${id}: external font`);
    for (const css of [/display:\s*flex/i, /display:\s*grid/i, /position:\s*(absolute|fixed|relative)/i]) {
      assert.ok(!css.test(html), `${id}: ${css}`);
    }
  }
});

test('Outlook: sections and columns laid out by MSO tables, background images in VML, buttons as tables', () => {
  for (const { id, prepared, html } of compiled) {
    const sections = (prepared.match(/<mj-section\b/g) || []).length;
    const msoTables = (html.match(/<!--\[if mso \| IE\]><table/g) || []).length;
    assert.ok(msoTables >= sections, `${id}: ${msoTables} MSO tables for ${sections} sections`);
    if (/background-url="/.test(prepared)) assert.match(html, /<v:rect\b/, `${id}: VML background for Outlook`);
    const buttons = (prepared.match(/<mj-button\b/g) || []).length;
    const buttonTables = (html.match(/<table[^>]*role="presentation"[^>]*style="border-collapse:separate;line-height:100%;/g) || []).length;
    assert.ok(buttonTables >= buttons, `${id}: ${buttonTables} button tables for ${buttons} buttons`);
  }
});

test('images: alt text, no border, a width attribute for Outlook, displayed as blocks', () => {
  for (const { id, html } of compiled) {
    for (const img of html.match(/<img\b[^>]*>/g) || []) {
      assert.match(img, /\salt="/, `${id}: ${img.slice(0, 80)}`);
      assert.match(img, /\swidth="\d+"/, `${id}: width attribute`);
      assert.match(img, /border:0|border="0"/, `${id}: no border`);
      assert.match(img, /display:block/, `${id}: display block`);
    }
  }
});

test('mobile: a viewport, the columns media query, and columns stacking where <style> is stripped', () => {
  for (const { id, html } of compiled) {
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/, id);
    if (/mj-column-per-/.test(html)) {
      assert.match(html, /@media only screen and \(min-width:480px\)/, `${id}: columns side by side only from 480 px`);
      // Without <style> (some webmails strip it), every column falls back to the full width.
      for (const column of html.match(/<div class="mj-column-per-[^"]*"[^>]*>/g) || []) {
        assert.match(column, /width:\s*100%/, `${id}: ${column.slice(0, 90)}`);
      }
    }
  }
});

test('Apple Mail / iOS: no rescaling, no automatic blue links', () => {
  for (const { id, html } of compiled) {
    assert.match(html, /<meta name="x-apple-disable-message-reformatting">/, id);
    assert.match(html, /<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">/, id);
    assert.equal((html.match(/x-apple-disable-message-reformatting/g) || []).length, 1, `${id}: once`);
  }
});

test('links: absolute, or a merge tag; the legal footer is there', () => {
  for (const { id, html } of compiled) {
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)) {
      assert.match(href, /^(https?:\/\/|mailto:|tel:|\{\{|#)/, `${id}: ${href}`);
    }
    if (id !== 'blank') assert.ok(html.includes('{{ unsubscribe }}'), `${id}: unsubscribe link`);
  }
});

test('the panel features compile as meant: unequal columns, a full-width band, a fluid image, menu links as typed', () => {
  const sink = compiled.find((c) => c.id === 'kitchen-sink');
  assert.match(sink.html, /mj-column-per-33\b/);
  assert.match(sink.html, /mj-column-per-67\b/);
  // Full width: the band's table spans 100 % of the screen, its content stays 600 px.
  assert.match(sink.html, /<table[^>]*background="https:\/\/example\.com\/band\.jpg"[^>]*style="[^"]*width:100%/);
  // Fluid on mobile: MJML's full-width-on-mobile class on the image's table.
  assert.match(sink.html, /class="mj-full-width-mobile"/);
  assert.match(sink.html, /text-transform:none/);
});

test('what the canvas shows is what is sent: the canvas compiler and the server give the same body', async () => {
  const canvasCompile = functionExport(mjmlBrowser);
  for (const { id, prepared } of compiled) {
    const server = await compileMjml(prepared);
    const canvas = await canvasCompile(prepareColumnAlignment(prepared), { validationLevel: 'soft', keepComments: false, fonts: {} });
    const body = (html) => /<body[^>]*>([\s\S]*)<\/body>/.exec(html)[1].replace(/\s+/g, ' ').trim();
    assert.equal(body(canvas.html), body(server.html), id);
  }
});

test('an image with no picture yet is left out, never sent as a broken image (Outlook draws a red cross)', async () => {
  const mjml = (images) =>
    `<mjml><mj-body><mj-section><mj-column>${images}<mj-text>Text</mj-text></mj-column></mj-section></mj-body></mjml>`;
  const empty = [
    '<mj-image src="" alt="Empty" />',
    '<mj-image alt="No src" width="200px"/>',
    '<mj-image src="   " alt="Blank" />',
    '<mj-image src="" alt="Closed"></mj-image>',
    "<mj-image src='' alt='Single quotes' />",
    '<mj-image alt="A > in the alt" src="" />',
  ];
  const kept = '<mj-image src="https://example.com/a.png" alt="Kept" />';
  const source = mjml(empty.join('') + kept);
  assert.equal(countImagesWithoutPicture(source), empty.length);
  assert.equal(countImagesWithoutPicture(mjml(kept)), 0);

  const prepared = prepareMjml(source);
  assert.equal(countImagesWithoutPicture(prepared), 0);
  assert.equal((prepared.match(/<mj-image\b/g) || []).length, 1);
  const { html, warnings } = await compileMjml(prepared);
  assert.deepEqual(warnings, []);
  const images = html.match(/<img\b[^>]*>/g) || [];
  assert.equal(images.length, 1);
  assert.match(images[0], /src="https:\/\/example\.com\/a\.png"/);
  assert.match(html, />Text</);
});

test('a preview keeps the image with no picture yet (its frame is drawn), what is sent leaves it out', async () => {
  const mjml =
    '<mjml><mj-body><mj-section><mj-column><mj-image src="" alt="To fill" /><mj-text>Text <a href="{{ unsubscribe }}">Unsubscribe</a></mj-text></mj-column></mj-section></mj-body></mjml>';
  const sent = await compileTemplate({ mjml, subject: 'S' });
  const preview = await compileTemplate({ mjml, subject: 'S' }, { preview: true });
  assert.doesNotMatch(sent.compiled, /<img\b/);
  assert.match(preview.compiled, /<img\b[^>]*alt="To fill"/);
  // Both say it, so the person fills it.
  for (const { quality } of [sent, preview]) assert.ok(quality.some((issue) => issue.code === 'IMAGE_NO_SRC'));
});
