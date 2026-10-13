import { test, expect } from '@playwright/test';

/**
 * END TO END on the example application: the builder talks to the REAL server
 * handler (`createEmailBuilderHandler`, memory repositories) — compilation by
 * mjml, validation, versions, custom variables, uploads, test send (console
 * transport, nothing leaves the machine).
 *
 * Run: npm run test:e2e
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const builder = (page) => page.getByTestId('email-builder');
const panel = (page) => page.getByTestId('eb-properties');

async function openNew(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New template' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  // A draft of an earlier run may be offered: start over.
  const resume = page.getByRole('alertdialog').filter({ hasText: 'Resume the draft?' });
  if (await resume.count()) await resume.getByRole('button', { name: 'Start over' }).click();
}

test('create, save on the server, find in the list, reopen', async ({ page, request }) => {
  const name = `E2E ${Date.now()}`;
  await openNew(page);
  await panel(page).getByLabel(/^Name/).fill(name);
  await panel(page).getByLabel('Subject', { exact: true }).fill('Hello {{contact.firstname}}');
  await page.locator('[data-block-id="divider"]').click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible({ timeout: 30_000 });
  const id = await builder(page).getAttribute('data-template-id');
  expect(Number(id)).toBeGreaterThan(0);

  // The server compiled its own HTML.
  const stored = (await (await request.get(`/api/email-builder/templates/${id}`)).json()).data;
  expect(stored.name).toBe(name);
  expect(stored.html).toMatch(/^<!doctype html>/i);
  expect(stored.html).toContain('<title>Hello {{contact.firstname}}</title>');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByTestId('template-list').getByRole('button', { name }).click();
  await expect(builder(page)).toHaveAttribute('data-template-id', id, { timeout: 60_000 });
  await expect(builder(page)).toHaveAttribute('data-status', 'ready');
  await expect(panel(page).getByLabel(/^Name/)).toHaveValue(name);
  await expect(page.frameLocator('.eb-canvas-frame').locator('.eb-tag-mj-divider')).toHaveCount(1);
});

test('server preview: real MJML compilation, variables filled, custom variable included', async ({ page, request }) => {
  const key = `e2e_${Date.now()}`;
  const created = await request.post('/api/email-builder/variables', {
    data: { label: 'Order reference', key, sample: 'CMD-77', fallback: 'your order' },
  });
  expect(created.status()).toBe(201);

  await openNew(page);
  // The new variable is offered in the menu.
  await page.getByRole('button', { name: 'Variables' }).click();
  await expect(page.getByTestId('variable-picker').getByRole('option', { name: /Order reference/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await panel(page).getByLabel('Subject', { exact: true }).fill(`Order {{${key}}}`);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Email preview' });
  const frame = dialog.frameLocator('iframe[title="Email preview"]');
  await expect(frame.getByText('Hello Jane,')).toBeVisible({ timeout: 30_000 });
  // Subject personalized by the server.
  await expect(dialog.getByText('Order CMD-77')).toBeVisible();

  await request.delete(`/api/email-builder/variables/${key}`);
});

test('test send goes through the server transport', async ({ page }) => {
  await openNew(page);
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Send a test' });
  await dialog.getByLabel('Addresses').fill('reviewer@example.com, not-an-address');
  await dialog.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('email-builder').getByText('1 test(s) sent — check your inbox.')).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText('Ignored (invalid): not-an-address')).toBeVisible();
});

test('image upload: stored by the server, served publicly with safe headers', async ({ page, request }) => {
  await openNew(page);
  await page.locator('[data-block-id="image"]').click();
  await panel(page).getByTestId('eb-prop-src-file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
  await expect
    .poll(() => page.evaluate(() => document.querySelector('#eb-prop-src')?.value || ''))
    .toMatch(/^\/api\/email-builder\/assets\/[a-f0-9]{32}\.png$/);
  const path = await page.evaluate(() => document.querySelector('#eb-prop-src').value);
  const image = await request.get(path);
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/png');
  expect(image.headers()['x-content-type-options']).toBe('nosniff');
  await expect
    .poll(() => page.frameLocator('.eb-canvas-frame').locator(`img[src="${path}"]`).evaluate((img) => img.complete && img.naturalWidth))
    .toBe(1);
});

test('the server refuses what the browser should never send', async ({ request }) => {
  const bad = await request.post('/api/email-builder/templates', {
    data: {
      name: 'X',
      document: { schemaVersion: 1, engine: 'grapesjs-mjml', engineVersion: '0', project: {} },
      mjml: '<mjml><mj-body><mj-raw><script>alert(1)</script></mj-raw></mj-body></mjml>',
    },
  });
  expect(bad.status()).toBe(422);
  const svg = await request.post('/api/email-builder/assets', {
    multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') } },
  });
  expect(svg.status()).toBe(415);
});
