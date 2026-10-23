import { test, expect } from '@playwright/test';
import { compileMjml } from '../src/server/compileMjml.js';

const source = '<mjml><mj-body><mj-section padding="20px 0">' +
  '<mj-column width="50%" vertical-align="top"><mj-spacer height="300px" /></mj-column>' +
  '<mj-column width="25%" vertical-align="middle"><mj-text css-class="middle">Middle</mj-text></mj-column>' +
  '<mj-column width="25%" vertical-align="bottom"><mj-text css-class="bottom">Bottom</mj-text></mj-column>' +
  '</mj-section></mj-body></mjml>';

async function offsets(frame) {
  return frame.locator('.eb-va-row').evaluate((row) => {
    const box = row.getBoundingClientRect();
    const middle = row.querySelector('.middle').getBoundingClientRect();
    const bottom = row.querySelector('.bottom').getBoundingClientRect();
    return { height: box.height, middle: middle.top + middle.height / 2 - box.top, bottom: box.bottom - bottom.bottom,
      widths: [...row.querySelectorAll(':scope > .eb-va-col')].map((el) => el.getBoundingClientRect().width) };
  });
}

test('mixed top, middle and bottom: server HTML centers against the entire row, with mobile stacking', async ({ page }) => {
  const { html, warnings } = await compileMjml(source);
  expect(warnings).toEqual([]);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setContent(html);
  const measured = await offsets(page);
  expect(measured.height).toBe(300);
  expect(measured.middle).toBeCloseTo(150, 0);
  expect(measured.bottom).toBeCloseTo(0, 0);
  expect(measured.widths).toEqual([300, 150, 150]);
  await page.setViewportSize({ width: 375, height: 700 });
  const boxes = await page.locator('.eb-va-col').evaluateAll((els) => els.map((el) => {
    const r = el.getBoundingClientRect(); return { y: r.y, width: r.width };
  }));
  expect(boxes.every((box) => box.width === 375)).toBe(true);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[2].y).toBeGreaterThan(boxes[1].y);
});

test('canvas matches the export; content blocks edit their column and section edits all columns, with undo', async ({ page }) => {
  await page.goto('/?story=engine--canvas&mode=preview');
  await expect(page.getByTestId('bench')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.evaluate((mjml) => window.__emailEditor.loadMjml(mjml), source);
  const frame = page.frameLocator('.eb-canvas-frame');
  await expect(frame.locator('.middle')).toBeVisible();
  expect((await offsets(frame)).middle).toBeCloseTo(150, 0);
  await page.evaluate(() => {
    const section = window.__emailAdapter.root.children.find((n) => n.tag === 'mj-body').children[0];
    const text = section.children[1].children[0];
    window.__emailEditor.select(text.id);
    window.__emailEditor.updateProperties({ 'vertical-align': 'bottom' });
  });
  await expect.poll(() => frame.locator('.middle').evaluate((el) => {
    const row = el.closest('.eb-tag-mj-section'); return Math.round(row.getBoundingClientRect().bottom - el.getBoundingClientRect().bottom);
  })).toBe(20);
  expect(await page.evaluate(() => window.__emailEditor.getSelection().values['vertical-align'])).toBe('bottom');
  await page.evaluate(() => window.__emailEditor.undo());
  await expect.poll(async () => (await offsets(frame)).middle).toBe(150);
  await page.evaluate(() => {
    const body = window.__emailAdapter.root.children.find((n) => n.tag === 'mj-body');
    window.__emailEditor.updateProperties({ 'vertical-align': 'middle' }, body.children[0].id);
  });
  const out = await page.evaluate(() => window.__emailEditor.exportMjml());
  expect((out.match(/vertical-align="middle"/g) || []).length).toBe(3);
  expect(out).not.toMatch(/<mj-section[^>]*vertical-align/);
  expect(out).not.toMatch(/<mj-text[^>]*vertical-align/);
});

test('all desktop columns share top and bottom edges, with full-height backgrounds', async ({ page }) => {
  const { html, warnings } = await compileMjml('<mjml><mj-body><mj-section padding="0px">' +
    '<mj-column background-color="#ffeeee"><mj-spacer height="300px" /></mj-column>' +
    '<mj-column background-color="#eeeeff"><mj-text>Short</mj-text></mj-column>' +
    '</mj-section></mj-body></mjml>');
  expect(warnings).toEqual([]);
  await page.setViewportSize({ width: 900, height: 700 });
  await page.setContent(html);
  const columns = await page.locator('.eb-va-col').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, height: box.height, background: getComputedStyle(el).backgroundColor };
  }));
  expect(columns).toHaveLength(2);
  expect(columns[0].top).toBe(columns[1].top);
  expect(columns[0].bottom).toBe(columns[1].bottom);
  expect(columns.map((column) => column.height)).toEqual([300, 300]);
  expect(columns.map((column) => column.background)).toEqual(['rgb(255, 238, 238)', 'rgb(238, 238, 255)']);
  await page.setViewportSize({ width: 375, height: 700 });
  const heights = await page.locator('.eb-va-col').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights[1]).toBeLessThan(heights[0]);
});
