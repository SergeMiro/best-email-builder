import { test, expect } from '@playwright/test';

/**
 * BLOCK B ALONE, under the host's own bank (story `Custom bank / Builder`,
 * which imports `src/builder.js` only): the editor opens on new content, saves,
 * goes back, and reopens the saved template by id.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=custom-bank--builder&mode=preview';

test('a home-made bank drives the editor: new content → save → back → open by id', async ({ page }) => {
  await page.goto(STORY);
  const bank = page.getByTestId('my-bank');
  await expect(bank).toContainText('No template yet.');

  await bank.getByRole('button', { name: 'From my starter' }).click();
  const builder = page.getByTestId('email-builder');
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  // The content and the subject came from the host.
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue('Hello from my bank');
  // Block A is someone else's here: the editor offers no gallery of its own.
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toHaveCount(0);
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('From the host');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  expect(await page.evaluate(() => window.__lastSaved?.name)).toBe('From the host');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(bank).toContainText('From the host');
  await bank.getByRole('button', { name: 'Open' }).click();
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('eb-properties').getByLabel(/^Name/)).toHaveValue('From the host');
});
