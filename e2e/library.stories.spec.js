import { test, expect } from '@playwright/test';

/**
 * The TEMPLATE LIBRARY (level 1), alone and wired to the builder (level 2)
 * through `EmailStudio`. Stories: `Library / Standalone`, `Library / Studio`.
 *
 * Run: npm run test:stories
 */

const STANDALONE = '/?story=library--standalone&mode=preview';
const STUDIO = '/?story=library--studio&mode=preview';

const library = (page) => page.getByTestId('template-library');
const details = (page) => page.getByTestId('eb-library-details');
const events = (page) => page.evaluate(() => window.__libraryEvents);

test('standalone: lists templates and bases, previews, searches, hands Edit and New to the host', async ({ page }) => {
  await page.goto(STANDALONE);
  await expect(library(page)).toHaveAttribute('data-layout', 'wide');
  await expect(page.getByRole('heading', { name: 'Email template library' })).toBeVisible();

  const mine = page.getByTestId('eb-library-templates');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  await expect(page.getByTestId('eb-library-bases').getByTestId('eb-library-base')).toHaveCount(6);

  // The most recent template is selected and previewed.
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1' })).toBeVisible();
  await expect(details(page).getByText('Three steps to get started.')).toBeVisible();
  await expect(page.frameLocator('iframe[title="Email preview"]').locator('h1')).toHaveText('Welcome aboard!');

  // Search (Ctrl+K focuses it).
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('searchbox', { name: 'Search templates' })).toBeFocused();
  await page.keyboard.type('october');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(1);
  await expect(page.getByText('Nothing matches “october”.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search templates' }).fill('');

  // A base is read-only: "Start from this base" hands its MJML to the host.
  await page.getByTestId('eb-library-base').filter({ hasText: 'Promotion' }).click();
  await expect(details(page).getByText('Base — not editable: start from it to create your template.')).toBeVisible();
  await expect(details(page).getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await details(page).getByRole('button', { name: 'Start from this base' }).click();

  await mine.getByTestId('eb-library-template').filter({ hasText: 'October newsletter' }).click();
  await details(page).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'New template' }).click();

  const seen = await events(page);
  expect(seen.map((e) => e.type)).toEqual(['create', 'edit', 'create']);
  expect(seen[0].baseId).toBe('promotion');
  expect(seen[0].mjml).toContain('SPRING30');
  expect(seen[1].id).toBe(1);
  expect(seen[2].baseId).toBeNull();
});

test('standalone: duplicate and delete', async ({ page }) => {
  await page.goto(STANDALONE);
  const mine = page.getByTestId('eb-library-templates');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  await details(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(3);
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1 (copy)' })).toBeVisible();

  await details(page).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  await expect(mine).not.toContainText('(copy)');
});

test('phone width: list then details as two screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(STANDALONE);
  await expect(library(page)).toHaveAttribute('data-layout', 'narrow');
  await expect(details(page)).toHaveCount(0);
  const fits = await page.getByTestId('eb-library-list').evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth);
  expect(fits).toBe(true);
  await page.getByTestId('eb-library-template').filter({ hasText: 'October newsletter' }).click();
  await expect(details(page).getByRole('heading', { name: 'October newsletter' })).toBeVisible();
  await details(page).getByRole('button', { name: 'All templates' }).click();
  await expect(page.getByTestId('eb-library-list')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('studio: base → builder → save → back to the library → edit again', async ({ page }) => {
  await page.goto(STUDIO);
  await expect(page.getByText('No template yet.')).toBeVisible();
  await page.getByTestId('eb-library-base').filter({ hasText: 'Promotion' }).click();
  await page.getByRole('button', { name: 'Start from this base' }).click();

  const builder = page.getByTestId('email-builder');
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.gjs-frame').getByText('30% off everything')).toBeVisible();
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue('30% off this weekend only');
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Spring sale');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(library(page)).toBeVisible();
  await expect(details(page).getByRole('heading', { name: 'Spring sale' })).toBeVisible();
  await details(page).getByRole('button', { name: 'Edit' }).click();
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('eb-properties').getByLabel(/^Name/)).toHaveValue('Spring sale');
  await expect(page.frameLocator('.gjs-frame').getByText('30% off everything')).toBeVisible();
});

test('French', async ({ page }) => {
  await page.goto(`${STANDALONE}&lang=fr`);
  await expect(page.getByRole('heading', { name: 'Banque de modèles emails' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nouveau modèle' })).toBeVisible();
  await page.getByTestId('eb-library-base').first().click();
  await expect(page.getByRole('button', { name: 'Partir de cette base' })).toBeVisible();
});
