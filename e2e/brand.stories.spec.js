import { test, expect } from '@playwright/test';

/**
 * BRAND, driven like a user on the `Builder / Interface` story: the Brand
 * button opens one dialog — the website first (logo, colors, font filled in),
 * then everything by hand, a live preview, Save. The email being edited is
 * repainted in one step (Ctrl+Z brings it back), new blocks and new emails
 * take the brand.
 *
 * No network: the story's storage answers "Get my brand" with a fixed brand
 * (`window.__brandResult`, `__brandFail`, `__brandDelay` drive it). The real
 * reading of websites is tested on the server (tests/unit/brand.test.mjs).
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';
const PINK = '#e91e63';

async function openBuilder(page, { lang } = {}) {
  await page.goto(lang ? `${STORY}&lang=${lang}` : STORY);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

const mjml = (page) => page.evaluate(() => window.__emailEditor.exportMjml());
const dialog = (page) => page.getByTestId('eb-brand');
const notice = (page, text) => page.getByTestId('email-builder').getByText(text);
const canvas = (page) => page.frameLocator('.eb-canvas-frame');

test.describe('Brand', () => {
  test('read from the website, saved and applied to this email; Ctrl+Z brings the previous look back', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    await page.getByTestId('eb-brand-button').click();
    const box = dialog(page);
    await expect(box.getByRole('heading', { name: 'Your brand' })).toBeVisible();
    await expect(box.getByText('The logo, colors and font are read from it. You can change them before saving.')).toBeVisible();
    // Nothing to read yet.
    await expect(box.getByRole('button', { name: 'Get my brand' })).toBeDisabled();

    await page.evaluate(() => (window.__brandDelay = 800));
    await box.getByLabel('Your website').fill('acme.example');
    await box.getByLabel('Your website').press('Enter');
    await expect(box.getByRole('status')).toHaveText('Reading the website…');
    await expect(box.getByLabel('Company name')).toHaveValue('Acme Rockets');
    expect(await page.evaluate(() => window.__brandImports)).toEqual(['acme.example']);
    await expect(box.getByLabel('Main color')).toHaveValue(PINK);
    await expect(box.getByLabel('Headings color')).toHaveValue('#1a1a2e');
    await expect(box.getByLabel('Font', { exact: true })).toHaveText('Georgia');
    await expect(box.getByLabel('Your website')).toHaveValue('https://acme.example/');
    await expect(box.getByTestId('eb-brand-notes')).toHaveText('No logo was found on the website. Upload it below.');
    // The preview follows at once.
    const preview = box.getByTestId('eb-brand-preview');
    await expect(preview.getByText('Learn more')).toHaveCSS('background-color', 'rgb(233, 30, 99)');
    await expect(preview.getByText('Acme Rockets').first()).toBeVisible();

    await expect(box.getByTestId('eb-brand-apply')).toBeChecked();
    await box.getByTestId('eb-brand-save').click();
    await expect(box).toBeHidden();
    await expect(notice(page, 'Brand applied. Ctrl+Z brings back the previous look.')).toBeVisible();

    const branded = await mjml(page);
    expect(branded).toMatch(new RegExp(`<mj-button[^>]*background-color="${PINK}"`));
    expect(branded).toContain('font-family="Georgia, Times, serif"');
    expect(branded).toContain('Acme Rockets · 1 Main Street, Springfield');
    expect(branded).not.toContain('Example Inc.');
    await expect(canvas(page).getByText('Acme Rockets', { exact: true })).toBeVisible();
    // The button shows the brand's color.
    await expect(page.getByTestId('eb-brand-button').locator('span[aria-hidden="true"]')).toHaveCSS('background-color', 'rgb(233, 30, 99)');

    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toBe(before);

    // The brand stays: a block inserted now takes its color.
    await page.locator('[data-block-id="button"]').click();
    await expect.poll(async () => (await mjml(page)).match(new RegExp(`background-color="${PINK}"`, 'g'))?.length ?? 0).toBe(1);
  });

  test('set by hand, saved without touching this email; a new email starts in the brand', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    await page.getByTestId('eb-brand-button').click();
    const box = dialog(page);
    await box.getByLabel('Company name').fill('Globex');
    await box.getByLabel('Main color').fill('#0060df');
    await box.getByLabel('Headings color').fill('#14213d');
    await box.getByLabel('Font', { exact: true }).click();
    await page.getByRole('option', { name: 'Verdana', exact: true }).click();
    await expect(box.getByTestId('eb-brand-preview').getByText('Learn more')).toHaveCSS('background-color', 'rgb(0, 96, 223)');
    // The paragraphs' size: the builder's 15 px until one is picked; the preview, drawn at 60%, follows.
    await expect(box.getByLabel('Font size')).toHaveText('15 px');
    await box.getByLabel('Font size').click();
    await page.getByRole('option', { name: '17 px', exact: true }).click();
    await expect(box.getByTestId('eb-brand-preview').getByText(/^Some text, with/)).toHaveCSS('font-size', '10.2px');

    // A logo address must be https.
    await box.getByLabel('Logo', { exact: true }).fill('http://globex.example/logo.png');
    await expect(box.getByText('An https:// address is required')).toBeVisible();
    await expect(box.getByTestId('eb-brand-save')).toBeDisabled();
    await box.getByRole('button', { name: 'Remove' }).click();
    await expect(box.getByTestId('eb-brand-save')).toBeEnabled();

    await box.getByTestId('eb-brand-apply').uncheck();
    await box.getByTestId('eb-brand-save').click();
    await expect(notice(page, 'Brand saved. New emails and blocks use it.')).toBeVisible();
    expect(await mjml(page)).toBe(before);
    expect(await page.evaluate(() => window.__emailStorage.loadBrand())).toEqual({
      name: 'Globex',
      primary: '#0060df',
      heading: '#14213d',
      font: 'Verdana, Geneva, sans-serif',
      fontSize: 17,
    });

    // A new email: the starter in the brand, named after it.
    await page.evaluate(() => window.__reopenBuilder(null));
    await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    const fresh = await mjml(page);
    expect(fresh).toMatch(/<mj-button[^>]*background-color="#0060df"/);
    expect(fresh).toContain('font-family="Verdana, Geneva, sans-serif"');
    expect(fresh).toContain('color="#14213d"');
    expect(fresh).toContain('Globex · 1 Main Street, Springfield');
    expect(fresh).toMatch(/<mj-text[^>]*font-size="17px" line-height="27px"[^>]*>\s*Hello,/);

    // Opened again, the dialog shows the saved brand.
    await page.getByTestId('eb-brand-button').click();
    await expect(dialog(page).getByLabel('Company name')).toHaveValue('Globex');
    await expect(dialog(page).getByLabel('Main color')).toHaveValue('#0060df');
  });

  test('the logo’s square opens the file explorer; fields as high as the properties panel’s; the preview as tall as them', async ({ page }) => {
    await openBuilder(page);
    await page.getByTestId('eb-brand-button').click();
    const box = dialog(page);
    await expect(box.getByRole('button', { name: 'Upload' })).toHaveCount(0);
    const square = box.getByRole('button', { name: 'Choose a logo image' });
    // Once the dialog has zoomed in.
    await expect.poll(async () => Object.values(await square.boundingBox()).slice(2)).toEqual([80, 80]);
    const chooser = page.waitForEvent('filechooser');
    await square.click();
    await (await chooser).setFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(box.getByLabel('Logo', { exact: true })).toHaveValue(/\/[a-f0-9]{32}\.png$/);
    await expect(square.getByRole('img', { name: 'Logo' })).toBeVisible();

    for (const field of [box.getByLabel('Your website'), box.getByLabel('Company name'), box.getByLabel('Main color'), box.getByLabel('Font', { exact: true })]) {
      expect((await field.boundingBox()).height).toBe(26);
    }
    // A brand color stays opaque: no transparency slider.
    await box.getByLabel('Main color').locator('xpath=..').getByRole('button', { name: 'Pick a colour' }).click();
    await expect(page.locator('.react-colorful__saturation')).toBeVisible();
    await expect(page.locator('.react-colorful__alpha')).toHaveCount(0);
    await page.keyboard.press('Escape');

    const preview = await box.getByTestId('eb-brand-preview').boundingBox();
    const hint = await box.getByText('Paragraphs; headings keep theirs').boundingBox();
    expect(Math.abs(preview.y + preview.height - (hint.y + hint.height))).toBeLessThanOrEqual(2);
  });

  test('a website that cannot be read says why; Cancel keeps nothing', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    await page.getByTestId('eb-brand-button').click();
    const box = dialog(page);
    await page.evaluate(() => {
      window.__brandDelay = 50;
      window.__brandFail = 'The website does not let the builder read it. Fill in your brand below.';
    });
    await box.getByLabel('Your website').fill('blocked.example');
    await box.getByRole('button', { name: 'Get my brand' }).click();
    await expect(box.getByRole('alert')).toHaveText('The website does not let the builder read it. Fill in your brand below.');
    await expect(box.getByLabel('Company name')).toHaveValue('');
    // What the user types is kept when a second reading fails.
    await box.getByLabel('Company name').fill('Mine');
    await box.getByRole('button', { name: 'Get my brand' }).click();
    await expect(box.getByRole('alert')).toBeVisible();
    await expect(box.getByLabel('Company name')).toHaveValue('Mine');

    await box.getByRole('button', { name: 'Cancel' }).click();
    await expect(box).toBeHidden();
    expect(await page.evaluate(() => window.__emailStorage.loadBrand())).toEqual({});
    expect(await mjml(page)).toBe(before);
  });

  test('in French', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.getByTestId('eb-brand-button').click();
    const box = dialog(page);
    await expect(box.getByRole('heading', { name: 'Votre marque' })).toBeVisible();
    await box.getByLabel('Votre site web').fill('acme.example');
    await box.getByRole('button', { name: 'Récupérer ma marque' }).click();
    await expect(box.getByTestId('eb-brand-notes')).toHaveText('Aucun logo trouvé sur le site. Importez-le ci-dessous.');
    await expect(box.getByLabel('Couleur principale')).toHaveValue(PINK);
    await expect(box.getByText('Appliquer aussi à cet e-mail')).toBeVisible();
    await box.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(notice(page, "Marque appliquée. Ctrl+Z rétablit l'apparence précédente.")).toBeVisible();
    expect(await mjml(page)).toContain('Acme Rockets');
  });
});
