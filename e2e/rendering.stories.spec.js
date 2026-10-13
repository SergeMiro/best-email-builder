import { test, expect } from '@playwright/test';
import { compileMjml } from '../src/server/compileMjml.js';
import { prepareMjml } from '../src/renderer/prepareMjml.js';
import { emails } from '../tests/fixtures/emails.mjs';

/**
 * THE SENT EMAIL, RENDERED: the HTML the server compiles, opened in a browser
 * engine (Chromium, close to Apple Mail's WebKit and to the webmails) at a
 * desktop and a phone width, and once more with every <style> removed — what
 * clients that strip the <head> styles show.
 *
 * Outlook's Word engine cannot run here: its tables are checked on the HTML in
 * tests/unit/email-clients.test.mjs.
 *
 * Run: npm run test:stories
 */

const all = await Promise.all(
  emails().map(async ({ id, mjml }) => ({ id, html: (await compileMjml(prepareMjml(mjml, { title: id }))).html }))
);

const withoutStyles = (html) => html.replace(/<style\b[\s\S]*?<\/style>/gi, '');

/** Boxes of the columns of each section, in document order. */
async function columnRows(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('div[class*="mj-column-per-"]')].map((el) => {
      const box = el.getBoundingClientRect();
      return { top: Math.round(box.top), left: Math.round(box.left), width: Math.round(box.width) };
    })
  );
}

async function open(page, html, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
}

for (const { id, html } of all) {
  test(`"${id}": desktop 640 px — 600 px wide, nothing overflows`, async ({ page }) => {
    await open(page, html, 640);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
    const widest = await page.evaluate(() =>
      Math.max(...[...document.querySelectorAll('body > div > div')].map((el) => el.getBoundingClientRect().width))
    );
    expect(widest).toBeLessThanOrEqual(640);
  });

  test(`"${id}": phone 375 px — columns stacked, nothing overflows`, async ({ page }) => {
    await open(page, html, 375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for (const column of await columnRows(page)) expect(column.width).toBeLessThanOrEqual(375);
    // Images never wider than the screen.
    const images = await page.evaluate(() => [...document.images].map((img) => Math.round(img.getBoundingClientRect().right)));
    for (const right of images) expect(right).toBeLessThanOrEqual(375);
  });

  test(`"${id}": phone, <style> stripped — still readable, columns stacked`, async ({ page }) => {
    await open(page, withoutStyles(html), 375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const rows = await columnRows(page);
    // Every column takes the whole width: one per row.
    for (const column of rows) expect(column.width).toBeGreaterThan(300);
  });
}

test('kitchen sink, desktop: unequal columns side by side at 1/3 and 2/3; the band spans the whole screen', async ({ page }) => {
  const { html } = all.find((e) => e.id === 'kitchen-sink');
  await open(page, html, 900);
  const two = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.mj-column-per-33, .mj-column-per-67')].map((el) => el.getBoundingClientRect());
    return cols.map((r) => ({ top: Math.round(r.top), width: Math.round(r.width) }));
  });
  expect(two).toHaveLength(2);
  expect(two[0].top).toBe(two[1].top);
  expect(Math.round(two[1].width / two[0].width)).toBe(2);
  // The full-width band: its background reaches both edges of a 900 px screen.
  const band = await page.evaluate(() => {
    const table = document.querySelector('table[background="https://example.com/band.jpg"]');
    const r = table.getBoundingClientRect();
    return { left: Math.round(r.left), width: Math.round(r.width) };
  });
  expect(band).toEqual({ left: 0, width: 900 });
});

test('kitchen sink, phone: the 120 px image marked "full width on mobile" takes the column', async ({ page }) => {
  const { html } = all.find((e) => e.id === 'kitchen-sink');
  await open(page, html, 375);
  const image = await page.evaluate(() => {
    const img = document.querySelector('img[src="https://example.com/a.png"]');
    return Math.round(img.getBoundingClientRect().width);
  });
  expect(image).toBeGreaterThan(250);
  await open(page, html, 900);
  expect(await page.evaluate(() => Math.round(document.querySelector('img[src="https://example.com/a.png"]').getBoundingClientRect().width))).toBe(120);
});

test('menu links are written as typed (MJML would capitalise them)', async ({ page }) => {
  const { html } = all.find((e) => e.id === 'kitchen-sink');
  await open(page, html, 640);
  await expect(page.getByRole('link', { name: 'Shop', exact: true })).toBeVisible();
  expect(await page.getByRole('link', { name: 'Shop', exact: true }).innerText()).toBe('Shop');
});
