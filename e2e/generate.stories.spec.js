import { test, expect } from '@playwright/test';

/**
 * GENERATE, driven like a user on the `Builder / Interface` story: pick what
 * the email is for, optionally add details, generate, then edit and save.
 *
 * No model: the story's storage runs the real generator (cleaning, checks)
 * around a fake model that answers a fixed password-reset email written the
 * way models get it wrong (shorthand padding, a stock photo, an unknown
 * variable). `window.__generated` records what the model was asked.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';

async function openBuilder(page, { lang } = {}) {
  await page.goto(lang ? `${STORY}&lang=${lang}` : STORY);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

const mjml = (page) => page.evaluate(() => window.__emailEditor.exportMjml());
const panel = (page) => page.getByTestId('eb-properties');
const dialog = (page) => page.getByTestId('eb-generate');
const canvas = (page) => page.frameLocator('.eb-canvas-frame');

test.describe('Generate', () => {
  test('pick a purpose, generate: the email opens ready to edit, subject included, and saves', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const box = dialog(page);
    await expect(box.getByRole('heading', { name: 'Generate an email' })).toBeVisible();
    // Search has the focus; badges are grouped by what they are for.
    await expect(box.getByRole('searchbox', { name: 'Search' })).toBeFocused();
    for (const group of ['Sales and promotions', 'Holidays and occasions', 'Account and security', 'Orders and payments']) {
      await expect(box.getByRole('region', { name: group })).toBeVisible();
    }
    expect(await box.locator('[data-purpose]').count()).toBeGreaterThanOrEqual(60);
    const submit = box.getByTestId('eb-generate-submit');
    await expect(submit).toBeDisabled();

    // Typing narrows the badges (accents and case ignored).
    await page.keyboard.type('passw');
    await expect(box.locator('[data-purpose]')).toHaveCount(1);
    const badge = box.locator('[data-purpose="password-reset"]');
    await badge.click();
    await expect(badge).toHaveAttribute('aria-pressed', 'true');
    await expect(submit).toBeEnabled();
    await box.getByRole('textbox', { name: 'Details (optional)' }).fill('The link is valid for one hour.');

    await page.evaluate(() => (window.__generateDelay = 1200));
    await submit.click();
    await expect(box.getByRole('status')).toContainText('Writing your email…');
    await expect(box).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId('email-builder').getByText('Your email is ready. Edit anything, then save.')).toBeVisible();

    // What the model was asked: the purpose, the details, the interface
    // language, the builder's sender and variables.
    const [asked] = await page.evaluate(() => window.__generated);
    expect(asked.purpose).toBe('password-reset');
    expect(asked.details).toBe('The link is valid for one hour.');
    expect(asked.language).toBe('en');
    expect(asked.sender.name).toBe('Example Inc.');
    expect(asked.variables.map((v) => v.key)).toContain('contact.firstname');

    // The email in the editor, cleaned for the builder.
    const source = await mjml(page);
    expect(source).toContain('Reset your password');
    expect(source).not.toMatch(/\spadding="/);
    expect(source).toContain('padding-top="32px"');
    expect(source).not.toContain('picsum');
    expect(source).toContain('alt="A padlock"');
    expect(source).toContain('[reset code]');
    expect(source).toContain('{{contact.firstname|there}}');
    await expect(canvas(page).getByText('Reset your password', { exact: true })).toBeVisible();
    await expect(panel(page).getByRole('textbox', { name: 'Subject' })).toHaveValue('Reset your password');
    await expect(panel(page).getByLabel(/^Name/)).toHaveValue('Password reset');

    // Saved like any email.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/^Saved at /)).toBeVisible();
    const dump = await page.evaluate(() => window.__emailStorage.dump());
    expect(dump.rows).toHaveLength(1);
    expect(dump.rows[0].name).toBe('Password reset');
    expect(dump.rows[0].subject).toBe('Reset your password');
    expect(dump.rows[0].mjml).toContain('Reset my password');
  });

  test('a modified email: the dialog says it will be replaced; cancel keeps it; errors stay in the dialog', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="divider"]').click();
    const before = await mjml(page);

    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const box = dialog(page);
    await expect(box).toContainText('The email being edited will be replaced, unsaved changes included.');

    // Details alone are enough.
    await box.getByRole('textbox', { name: 'Details (optional)' }).fill('A note to our volunteers about Saturday');
    await page.evaluate(() => (window.__generateDelay = 5000));
    await box.getByTestId('eb-generate-submit').click();
    await expect(box.getByRole('status')).toBeVisible();
    await box.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(box.getByRole('status')).toBeHidden();
    await expect(box.getByTestId('eb-generate-submit')).toBeEnabled();
    expect(await mjml(page)).toBe(before);
    expect((await page.evaluate(() => window.__generated))[0].purpose).toBeNull();

    // A failure is shown where the user is, and nothing changes.
    await page.evaluate(() => {
      window.__generateDelay = 100;
      window.__generateFail = 'Claude is busy right now.';
    });
    await box.getByTestId('eb-generate-submit').click();
    await expect(box.getByRole('alert')).toHaveText('Claude is busy right now.');
    expect(await mjml(page)).toBe(before);

    // Closing during a generation cancels it.
    await page.evaluate(() => {
      window.__generateDelay = 5000;
      window.__generateFail = null;
    });
    await box.getByTestId('eb-generate-submit').click();
    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    await page.waitForTimeout(300);
    expect(await mjml(page)).toBe(before);
  });

  test('French: badges and texts translated, the email asked in French', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.getByRole('button', { name: 'Générer', exact: true }).click();
    const box = dialog(page);
    await expect(box.getByRole('heading', { name: 'Générer un e-mail' })).toBeVisible();
    await expect(box.getByRole('region', { name: 'Fêtes et occasions' })).toBeVisible();
    await page.keyboard.type('noel');
    await box.locator('[data-purpose="christmas"]').click();
    await expect(box.locator('[data-purpose="christmas"]')).toHaveText('Noël');
    await page.evaluate(() => (window.__generateDelay = 50));
    await box.getByRole('button', { name: 'Générer' }).click();
    await expect(box).toBeHidden();
    const [asked] = await page.evaluate(() => window.__generated);
    expect(asked.language).toBe('fr');
    expect(asked.purpose).toBe('christmas');
  });
});
