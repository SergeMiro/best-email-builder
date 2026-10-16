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
  await expect(page.frameLocator('.eb-canvas-frame').locator('.eb-tag-mj-divider')).toHaveCount(1);
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
  await expect(page.frameLocator('.eb-canvas-frame').getByText('30% off everything')).toBeVisible();
  await page.reload();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('30% off everything')).toBeVisible();
});

test('landing: the marquee lists the editors this one can replace', async ({ page }) => {
  await page.goto(`${HOME}?lang=en`);
  // The code sample shows each block installed alone.
  await page.getByRole('tab', { name: 'Editor only' }).click();
  await expect(page.locator('.code pre')).toContainText("from 'best-email-builder/builder'");
  await page.getByRole('tab', { name: 'Library only' }).click();
  await expect(page.locator('.code pre')).toContainText("from 'best-email-builder/library'");
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Editor only' })).toBeFocused();
  await expect(page.locator('.code pre')).toContainText("from 'best-email-builder/builder'");
  // The AI sample: the five providers, one per line, nothing cut at the right.
  await page.getByRole('tab', { name: 'With AI' }).click();
  await expect(page.locator('.code pre')).toContainText('claudeProvider({');
  for (const provider of ["'openai',", 'claude,', "'mistral',", "'gemini',", "'openrouter',"]) {
    await expect(page.locator('.code pre')).toContainText(`    ${provider}`);
  }
  expect(await page.locator('.code pre').evaluate((pre) => pre.scrollWidth - pre.clientWidth)).toBe(0);
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
  await expect(frame.locator('li[aria-current="step"]')).toContainText('Template library');
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

  // Esc leaves full screen too (focus still on the toggle) — but not from a field.
  await page.getByRole('button', { name: 'Full screen' }).click();
  await page.getByTestId('eb-properties').getByLabel(/^Name/).press('Escape');
  await expect(frame).toHaveClass(/is-expanded/);
  await page.getByRole('button', { name: 'Exit full screen' }).focus();
  await page.keyboard.press('Escape');
  await expect(frame).not.toHaveClass(/is-expanded/);
});

// The first language: the browser's own, else the country of the clock, else English.
for (const [locale, timezoneId, open] of [
  ['de-DE', 'America/New_York', 'Live-Demo öffnen'],
  ['zh-TW', 'Europe/Paris', '打开在线演示'],
  ['ca-ES', 'Europe/Madrid', 'Abrir la demo'],
  ['pt-PT', 'Europe/Lisbon', 'Abrir a demo'],
  ['gn-PY', 'America/Sao_Paulo', 'Abrir a demo'],
  ['kk-KZ', 'Asia/Almaty', 'Открыть демо'],
  ['en-US', 'Europe/Berlin', 'Open the live demo'],
  ['it-IT', 'Europe/Rome', 'Open the live demo'],
]) {
  test.describe(`a ${locale} browser in ${timezoneId}`, () => {
    test.use({ locale, timezoneId });
    test(`opens in "${open}"`, async ({ page }) => {
      await page.goto(HOME);
      await expect(page.getByRole('link', { name: open })).toBeVisible();
    });
  });
}

/** The demo's own list of languages: open it, click the language. */
async function pickLanguage(page, name) {
  await page.getByRole('combobox', { name: 'Language' }).click();
  await page.getByRole('listbox', { name: 'Language' }).getByRole('option', { name }).click();
}

test('the language list: its own, by mouse and by keyboard; a click outside or Esc closes it unchanged', async ({ page }) => {
  await page.goto(`${HOME}?lang=en`);
  const button = page.getByRole('combobox', { name: 'Language' });
  const list = page.getByRole('listbox', { name: 'Language' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(list).toHaveCount(0);

  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(list.getByRole('option')).toHaveText([/English/, /Français/, /Deutsch/, /Español/, /Português/, /Русский/, /中文/]);
  await expect(list.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true');
  await expect(list.getByRole('option', { name: 'Русский' })).toHaveAttribute('lang', 'ru');
  await page.mouse.click(5, 400);
  await expect(list).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // ↓ opens it on the language in use, End goes to the last, Esc closes it.
  await button.focus();
  await page.keyboard.press('ArrowDown');
  await expect(list.locator('[data-active]')).toContainText('English');
  await page.keyboard.press('End');
  await expect(list.locator('[data-active]')).toContainText('中文');
  await expect(button).toHaveAttribute('aria-activedescendant', (await list.getByRole('option').last().getAttribute('id')) || '');
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // A letter goes to the language it starts; Enter picks it.
  await page.keyboard.press('d');
  await expect(list.locator('[data-active]')).toContainText('Deutsch');
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByRole('combobox', { name: 'Sprache' })).toContainText('Deutsch');
});

test('the language picked: the code samples follow it, and it is kept for the next visit', async ({ page }) => {
  await page.goto(HOME);
  await pickLanguage(page, 'Русский');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.locator('#code-panel')).toContainText('locale="ru"');
  await page.getByRole('tab', { name: 'С ИИ' }).click();
  await expect(page.locator('#code-panel')).toContainText('// Каждый пользователь выбирает провайдера и подключает свой ключ:');
  await page.getByRole('tab', { name: 'Только редактор' }).click();
  await expect(page.locator('#code-panel')).toContainText('// открыт из вашей библиотеки');

  await page.goto(HOME);
  await expect(page.getByRole('link', { name: 'Открыть демо' })).toBeVisible();
  // A link that names a language still wins.
  await page.goto(`${HOME}?lang=es`);
  await expect(page.getByRole('link', { name: 'Abrir la demo' })).toBeVisible();
});

test('after a first save, switching the language reopens the saved template (no duplicate)', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/base/promotion`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Saved once');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();

  await pickLanguage(page, 'Français');
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('eb-properties').getByLabel(/^Libellé/)).toHaveValue('Saved once');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText(/^Enregistré à/)).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(page.getByTestId('eb-library-templates')).toContainText('Modèles (1)');
});

test('brand: set by hand in the demo, kept after a reload, new emails start in it', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-brand-button').click();
  const box = page.getByTestId('eb-brand');
  await expect(box.getByRole('heading', { name: 'Your brand' })).toBeVisible();
  // Reading a website needs a server: no such field here.
  await expect(box.getByLabel('Your website')).toHaveCount(0);
  await box.getByLabel('Company name').fill('Acme Rockets');
  await box.getByLabel('Main color').fill('#e91e63');
  await box.getByTestId('eb-brand-save').click();
  await expect(builder(page).getByText('Brand applied. Ctrl+Z brings back the previous look.')).toBeVisible();
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Acme Rockets', { exact: true })).toBeVisible();

  await page.reload();
  // The autosaved draft may be offered first: start over, from the brand alone.
  const resume = page.getByRole('alertdialog').filter({ hasText: 'Resume the draft?' });
  const ready = page.locator('[data-testid="email-builder"][data-status="ready"]');
  await expect(resume.or(ready)).toBeVisible({ timeout: 60_000 });
  if (await resume.isVisible()) await resume.getByRole('button', { name: 'Start over' }).click();
  await expect(ready).toBeVisible();
  // A new email, in the brand kept by the demo.
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Acme Rockets', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eb-brand-button').locator('span[aria-hidden="true"]')).toHaveCSS('background-color', 'rgb(233, 30, 99)');
});

test('preview in dark mode: the page darkens, the text lightens, the button keeps its color', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Email preview' });
  const frame = dialog.frameLocator('iframe[title="Email preview"]');
  const greeting = frame.getByText('Hello Jane,');
  await expect(greeting).toBeVisible({ timeout: 30_000 });
  // The colors as the reader sees them: computed in the frame.
  const color = (locator, property) => locator.evaluate((el, name) => getComputedStyle(el)[name], property);
  const buttonCell = frame.locator('td[bgcolor]').filter({ hasText: 'Learn more' }).last();
  const lightButton = await color(buttonCell, 'backgroundColor');
  expect(await color(greeting, 'color')).toBe('rgb(43, 48, 56)');

  await dialog.getByRole('tab', { name: 'Dark mode' }).click();
  await expect(dialog.locator('[data-scheme="dark"]')).toBeVisible();
  await expect(dialog.getByTestId('eb-dark-hint')).toBeVisible();
  await expect.poll(() => color(frame.getByText('Hello Jane,'), 'color')).not.toBe('rgb(43, 48, 56)');
  const [r, g, b] = (await color(frame.getByText('Hello Jane,'), 'color')).match(/\d+/g).map(Number);
  expect(Math.min(r, g, b)).toBeGreaterThan(180);
  // The pale page behind the email (#eceff4) is now dark, of the same cool hue.
  const behind = (await color(frame.locator('body'), 'backgroundColor')).match(/\d+/g).map(Number);
  expect(Math.max(...behind)).toBeLessThan(40);
  expect(behind[2]).toBeGreaterThan(behind[0]);
  expect(await color(frame.locator('td[bgcolor]').filter({ hasText: 'Learn more' }).last(), 'backgroundColor')).toBe(lightButton);

  await dialog.getByRole('tab', { name: 'Light mode' }).click();
  await expect.poll(() => color(frame.getByText('Hello Jane,'), 'color')).toBe('rgb(43, 48, 56)');
});
