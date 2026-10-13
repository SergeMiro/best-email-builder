import { test, expect } from '@playwright/test';

/**
 * The STATIC DEMO published on GitHub Pages, as built (`npm run demo:build`,
 * served under `/best-email-builder/`): no server, templates and variables kept in
 * localStorage, preview compiled in the browser.
 */

const HOME = '/best-email-builder/';
const builder = (page) => page.getByTestId('email-builder');

test('build a template, preview it, find it again after a reload', async ({ page }) => {
  await page.goto(`${HOME}?lang=en`);
  await expect(page.getByRole('heading', { name: 'Best Email Builder' })).toBeVisible();
  // Page 1 → page 2 (the template bank) → page 3 (the editor).
  await page.getByRole('link', { name: 'Open the live demo' }).click();
  await expect(page).toHaveURL(/#\/templates$/);
  await page.getByRole('button', { name: 'New template' }).click();
  await expect(page).toHaveURL(/#\/editor\/new$/);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });

  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Demo letter');
  await page.locator('[data-block-id="divider"]').click();

  // Custom variable, kept by the demo storage.
  await page.getByRole('button', { name: 'Variables' }).click();
  await page.getByTestId('variable-picker').getByRole('button', { name: 'New variable' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
  await dialog.getByLabel('Name').fill('Coupon code');
  await dialog.getByLabel('Sample value').fill('WELCOME10');
  await dialog.getByRole('button', { name: 'Create' }).click();

  // Preview compiled in the browser (mjml-browser).
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog').filter({ hasText: 'Email preview' });
  await expect(preview.frameLocator('iframe[title="Email preview"]').getByText('Hello Jane,')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await expect(page).toHaveURL(/#\/editor\/\d+$/);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/templates$/);
  // Back on the library (level 1): the template just saved is selected.
  await expect(page.getByTestId('eb-library-templates')).toContainText('Demo letter');
  await expect(page.getByTestId('eb-library-details').getByRole('heading', { name: 'Demo letter' })).toBeVisible();

  await page.reload();
  await page.getByTestId('eb-library-template').filter({ hasText: 'Demo letter' }).click();
  await page.getByTestId('eb-library-details').getByRole('button', { name: 'Edit' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.gjs-frame').locator('[data-gjs-type="mj-divider"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Variables' }).click();
  await expect(page.getByTestId('variable-picker').getByRole('option', { name: /Coupon code/ })).toBeVisible();
});

test('French switch', async ({ page }) => {
  await page.goto(`${HOME}?lang=fr`);
  await page.getByRole('link', { name: 'Ouvrir la démo' }).click();
  await page.getByRole('button', { name: 'Nouveau modèle' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeVisible();
});

test('a base opens the editor on its content, and the address survives a reload', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/templates`);
  await page.getByTestId('eb-library-base').filter({ hasText: 'Promotion' }).click();
  await page.getByRole('button', { name: 'Start from this base' }).click();
  await expect(page).toHaveURL(/#\/editor\/base\/promotion$/);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.gjs-frame').getByText('30% off everything')).toBeVisible();
  await page.reload();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.gjs-frame').getByText('30% off everything')).toBeVisible();
});

test('landing: the marquee lists the editors this one can replace', async ({ page }) => {
  await page.goto(`${HOME}?lang=en`);
  const marquee = page.locator('.marquee-list').first();
  await expect(marquee).toContainText('Brevo');
  await expect(marquee).toContainText('Mailchimp');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test('bank and editor share one window; it spreads over the screen and back', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${HOME}?lang=en#/templates`);
  const frame = page.getByTestId('demo-window');
  const window = frame.locator('.window');
  await expect(frame.locator('li[aria-current="step"]')).toContainText('Template bank');
  const bank = await window.boundingBox();

  await page.getByRole('button', { name: 'New template' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(frame.locator('li[aria-current="step"]')).toContainText('Editor');
  // Same window, same size as the bank's.
  expect(await window.boundingBox()).toEqual(bank);
  // The bases are picked in the bank: no second gallery in the editor.
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect(frame).toHaveClass(/is-expanded/);
  const full = await window.boundingBox();
  expect(full.width).toBeGreaterThan(1400);
  expect(full.height).toBeGreaterThan(800);
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(frame).not.toHaveClass(/is-expanded/);
  expect(await window.boundingBox()).toEqual(bank);
});
