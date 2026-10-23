import { test, expect } from '@playwright/test';

/**
 * The STATIC DEMO published on GitHub Pages, as built (`npm run demo:build`,
 * served under `/best-email-builder/`): no server, templates, tags and variables
 * kept in localStorage, preview compiled in the browser. A first visit finds
 * five templates of the gallery, three of them tagged.
 */

const HOME = '/best-email-builder/';
const builder = (page) => page.getByTestId('email-builder');

test('sections have independent margin, border and padding, kept after save and reload', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Three spacing levels');
  await page.locator('[data-block-id="hero"]').click();
  const box = page.getByTestId('eb-box-model');
  expect(await box.locator('[data-box]').evaluateAll((zones) => zones.map((z) => z.dataset.box)))
    .toEqual(['margin', 'border', 'padding', 'content']);
  await box.getByLabel('Margin — Top', { exact: true }).fill('24');
  await box.getByLabel('Margin — Top', { exact: true }).press('Enter');
  await box.getByRole('radio', { name: 'Solid', exact: true }).click();
  await box.getByLabel('Border — Top', { exact: true }).fill('3');
  await box.getByLabel('Border — Top', { exact: true }).press('Enter');
  await box.getByLabel('Padding — Top', { exact: true }).fill('30');
  await box.getByLabel('Padding — Top', { exact: true }).press('Enter');
  const canvas = page.frameLocator('.eb-canvas-frame');
  await expect(canvas.locator('.eb-section-margin > table > tbody > tr > td').first()).toHaveCSS('padding-top', '24px');
  await expect(canvas.locator('.eb-tag-mj-section > table > tbody > tr > td[style*="border-top"]').first()).toHaveCSS('border-top-width', '3px');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('dialog').frameLocator('iframe[title="Email preview"]').locator('.eb-section-margin > table > tbody > tr > td').first())
    .toHaveCSS('padding-top', '24px', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.reload();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(canvas.locator('.eb-section-margin > table > tbody > tr > td').first()).toHaveCSS('padding-top', '24px');
  await canvas.getByText('Your big announcement').click();
  await canvas.getByRole('button', { name: /^Select the parent:/ }).click();
  await canvas.getByRole('button', { name: /^Select the parent:/ }).click();
  await expect(box.getByLabel('Margin — Top', { exact: true })).toHaveValue('24');
  await expect(box.getByLabel('Border — Top', { exact: true })).toHaveValue('3');
  await expect(box.getByLabel('Padding — Top', { exact: true })).toHaveValue('30');
});

test('one accent variable themes the landing, editor, dialogs and canvas without recoloring the email', async ({ page }) => {
  await page.goto(`${HOME}?lang=en`);
  await page.evaluate(() => document.documentElement.style.setProperty('--eb-accent-color', '#00804a'));
  await expect(page.locator('.chip svg').first()).toHaveCSS('color', 'rgb(0, 128, 74)');
  await page.getByRole('link', { name: 'Open the live demo' }).click();
  await page.getByRole('button', { name: 'New template' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCSS('background-color', 'rgb(0, 128, 74)');
  await page.locator('[data-block-id="hero"]').click();
  const zone = page.getByTestId('eb-box-model').locator('[data-box="border"]');
  const before = await zone.evaluate((el) => getComputedStyle(el).backgroundColor);
  const canvas = page.frameLocator('.eb-canvas-frame');
  const emailColor = await canvas.getByText('Your big announcement').evaluate((el) => getComputedStyle(el).color);
  await expect(canvas.locator('.eb-ui-tools')).toHaveCSS('background-color', 'rgb(0, 128, 74)');
  // Runtime changes must cross the iframe boundary too.
  await page.evaluate(() => document.documentElement.style.setProperty('--eb-accent-color', '#b83260'));
  await expect(canvas.locator('.eb-ui-tools')).toHaveCSS('background-color', 'rgb(184, 50, 96)');
  await expect.poll(() => zone.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);
  await expect(canvas.getByText('Your big announcement')).toHaveCSS('color', emailColor);
  await page.getByTestId('eb-brand-button').click();
  await expect(page.getByTestId('eb-brand-save')).toHaveCSS('background-color', 'rgb(184, 50, 96)');
});

/** The variables panel, opened by its button at the end of the ribbon. */
async function openVariables(page) {
  await page.getByTestId('eb-ribbon').locator('[data-drawer="variables"]').click();
  await expect(page.getByTestId('eb-panel-variables')).toBeVisible();
}

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
  await openVariables(page);
  await page.getByTestId('eb-panel-variables').getByRole('button', { name: 'New variable' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
  for (const input of await dialog.locator('input').all()) {
    await expect(input).toHaveCSS('height', '26px');
  }
  await dialog.getByLabel('Name').fill('Coupon code');
  await dialog.getByLabel('Sample value').fill('WELCOME10');
  await dialog.getByRole('button', { name: 'Create' }).click();

  // Preview compiled in the browser (mjml-browser).
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog').filter({ hasText: 'Email preview' });
  await expect(preview.frameLocator('iframe[title="Email preview"]').getByText('Your text.')).toBeVisible({ timeout: 30_000 });
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
  await page.getByTestId('eb-library-details').getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.frameLocator('.eb-canvas-frame').locator('.eb-tag-mj-divider')).toHaveCount(1);
  await openVariables(page);
  await expect(page.getByTestId('eb-panel-variables').getByRole('button', { name: 'Coupon code', exact: true })).toBeVisible();
});

test("Brevo's variables: the panel inserts Brevo's tags, the preview shows their samples", async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  const canvas = page.frameLocator('.eb-canvas-frame');
  await canvas.getByText('Your text.').click();
  await openVariables(page);
  const badges = page.getByTestId('eb-panel-variables').getByRole('group', { name: 'Email provider variables' });
  await expect(badges.locator('[data-variable]')).toHaveText(['First name', 'Last name', 'Email address', 'Mobile number', 'Unsubscribe link']);
  const firstName = badges.getByRole('button', { name: 'First name', exact: true });
  await firstName.hover();
  await expect(page.getByRole('tooltip')).toHaveText('{{ contact.FIRSTNAME }}');
  await firstName.click();
  await page.mouse.move(10, 10);
  await expect(canvas.getByText('Your text. {{ contact.FIRSTNAME }}')).toBeVisible();

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog').filter({ hasText: 'Email preview' });
  await expect(preview.frameLocator('iframe[title="Email preview"]').getByText('Your text. Jane')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');

  // Edited like any variable: its sample changes, its tag stays Brevo's; kept after a reload.
  await badges.getByRole('button', { name: 'Edit “First name”' }).click();
  const edit = page.getByRole('dialog').filter({ hasText: 'Edit variable' });
  for (const input of await edit.locator('input').all()) {
    await expect(input).toHaveCSS('height', '26px');
  }
  await expect(edit.getByText('{{ contact.FIRSTNAME }}')).toBeVisible();
  await edit.getByLabel('Sample value').fill('Marie');
  await edit.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(preview.frameLocator('iframe[title="Email preview"]').getByText('Your text. Marie')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await page.reload();
  // The unsaved email is offered back: not needed here.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start over' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await openVariables(page);
  await badges.getByRole('button', { name: 'Edit “First name”' }).click();
  await expect(edit.getByLabel('Sample value')).toHaveValue('Marie');
});

test('French switch', async ({ page }) => {
  await page.goto(`${HOME}?lang=fr`);
  await page.getByRole('link', { name: 'Ouvrir la démo' }).click();
  await page.getByRole('button', { name: 'Nouveau modèle' }).click();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeVisible();
});

test('first visit: five templates, tagged, with their five actions; Delete is off; tags are kept', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${HOME}?lang=en#/templates`);
  const mine = page.getByTestId('eb-library-templates');
  await expect(mine).toContainText('Templates (5)');
  const rows = mine.getByTestId('eb-library-template');
  await expect(rows).toHaveText([/^Newsletter/, /^Promotion/, /^Welcome/, /^Event invitation/, /^Simple/]);
  const tagsOf = (name) => rows.filter({ hasText: name }).getByTestId('eb-tag');
  await expect(tagsOf('Newsletter')).toHaveText(['Marketing']);
  await expect(tagsOf('Event invitation')).toHaveText(['Events', 'Marketing']);
  await expect(tagsOf('Simple')).toHaveCount(0);
  await expect(page.getByTestId('eb-library-bases')).toHaveCount(0);

  const details = page.getByTestId('eb-library-details');
  await rows.filter({ hasText: 'Promotion' }).click();
  await expect(page.getByTestId('eb-library-preview').frameLocator('iframe').getByText('30% off everything')).toBeVisible({ timeout: 30_000 });
  for (const name of ['Edit', 'Duplicate', 'Copy HTML', 'Download', 'Delete']) {
    await expect(details.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // The HTML a server would keep: compiled, the variables left for the send.
  await details.getByRole('button', { name: 'Copy HTML' }).click();
  const html = await page.evaluate(() => navigator.clipboard.readText());
  expect(html).toContain('30% off everything');
  expect(html).toContain('<!doctype html>');

  await expect(details.getByRole('button', { name: 'Delete', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await details.getByRole('button', { name: 'Delete', exact: true }).click({ force: true });
  await expect(page.getByText('Deleting is turned off in this demo.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(rows).toHaveCount(5);

  await details.getByTestId('eb-library-tags-button').click();
  const dialog = page.getByTestId('eb-tags-dialog');
  await dialog.getByTestId('eb-tags-form').getByLabel('New tag').fill('Spring');
  await dialog.getByTestId('eb-tags-form').getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Spring' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(tagsOf('Promotion')).toHaveText(['Marketing', 'Spring']);

  // Kept by the demo, with their ids renumbered on the way back.
  await page.reload();
  await expect(rows).toHaveCount(5);
  await expect(tagsOf('Promotion')).toHaveText(['Marketing', 'Spring']);
  await expect(tagsOf('Welcome')).toHaveText(['Onboarding']);
});

test('a new template starts from a base through the editor’s Templates button', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/templates`);
  await page.getByRole('button', { name: 'New template' }).click();
  await expect(page).toHaveURL(/#\/editor\/new$/);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByTestId('eb-template-gallery').locator('[data-template-id="event"]').click();
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Book my seat')).toBeVisible();
  // An address from before 0.11 (the bank picked the bases) opens a new template.
  await page.goto(`${HOME}?lang=en#/editor/base/promotion`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('eb-properties').getByLabel(/^Name/)).toHaveValue('');
});

test('first visit in French: the templates and their tags in French', async ({ page }) => {
  await page.goto(`${HOME}?lang=fr#/templates`);
  const rows = page.getByTestId('eb-library-templates').getByTestId('eb-library-template');
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Bienvenue' }).getByTestId('eb-tag')).toHaveText(['Accueil']);
  await expect(rows.filter({ hasText: 'Invitation' }).getByTestId('eb-tag')).toHaveText(['Événements', 'Marketing']);
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
  // A new template starts from a base of the editor's gallery.
  await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible();

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
  await page.goto(`${HOME}?lang=en#/editor/new`);
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
  // The five of the first visit, and this one once.
  await expect(page.getByTestId('eb-library-templates')).toContainText('Modèles (6)');
});

test('the preview’s points to check are in the page’s language, after a switch too', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByTestId('eb-template-gallery').locator('[data-template-id="newsletter"]').click();
  // Saved, so the switch reopens it.
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Monthly news');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const checks = page.getByRole('list', { name: 'Points to check' });
  await expect(checks).toContainText('Image without file (2)', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  await pickLanguage(page, 'Français');
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
  const points = page.getByRole('list', { name: 'Points à vérifier' });
  await expect(points).toContainText('Image sans fichier (2)', { timeout: 30_000 });
  await expect(points).toContainText('Texte alternatif manquant (2 image(s))');
});

test('an uploaded image shows in the canvas and the preview, and after a reload', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const loaded = (image) => image.evaluate((img) => img.complete && img.naturalWidth);
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('With a picture');
  await page.locator('[data-block-id="image"]').click();
  await page.getByTestId('eb-properties').getByTestId('eb-prop-src-file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: png });
  // The template keeps the path a server would give; the canvas shows the file.
  await expect.poll(() => page.evaluate(() => document.querySelector('#eb-prop-src')?.value || '')).toMatch(/^\/email-assets\/[a-f0-9]{32}\.png$/);
  const canvasImage = page.frameLocator('.eb-canvas-frame').locator('img[src^="blob:"]');
  await expect.poll(() => loaded(canvasImage)).toBe(1);

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const previewImage = page.getByRole('dialog').frameLocator('iframe[title="Email preview"]').locator('img[src^="data:image/png"]');
  await expect.poll(() => loaded(previewImage), { timeout: 30_000 }).toBe(1);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.reload();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect.poll(() => loaded(page.frameLocator('.eb-canvas-frame').locator('img[src^="blob:"]'))).toBe(1);
});

test('an uploaded section background loads in the canvas and sandboxed preview', async ({ page }) => {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.locator('[data-block-id="hero"]').click();
  await page.getByTestId('eb-properties').getByTestId('eb-prop-background-url-file').setInputFiles({
    name: 'background.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(page.locator('#eb-prop-background-url')).toHaveValue(/^\/email-assets\/[a-f0-9]{32}\.png$/);
  const background = page.frameLocator('.eb-canvas-frame').locator('[background^="blob:"]').first();
  await expect(background).toBeVisible();
  await expect(background).toHaveCSS('background-image', /blob:/);
  const url = await background.getAttribute('background');
  await expect.poll(() => page.evaluate((src) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth);
    image.onerror = () => resolve(0);
    image.src = src;
  }), url)).toBe(1);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog').frameLocator('iframe[title="Email preview"]');
  await expect(preview.locator('[background^="data:image/png"]').first()).toBeVisible({ timeout: 30_000 });
});

test('uploaded brand logo loads in both previews, the email and exported HTML after a reload', async ({ page }) => {
  const loaded = (image) => image.evaluate((img) => img.complete && img.naturalWidth);
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Uploaded logo');
  await page.getByTestId('eb-brand-button').click();
  const box = page.getByTestId('eb-brand');
  const chooser = page.waitForEvent('filechooser');
  await box.getByRole('button', { name: 'Choose a logo image' }).click();
  await (await chooser).setFiles({
    name: 'logo.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  });
  await expect(box.getByLabel('Logo', { exact: true })).toHaveValue(/^\/email-assets\/[a-f0-9]{32}\.png$/);
  const path = await box.getByLabel('Logo', { exact: true }).inputValue();
  await expect.poll(() => loaded(box.getByRole('img', { name: 'Logo', exact: true }))).toBe(1);
  await expect.poll(() => loaded(box.getByTestId('eb-brand-preview').locator('img'))).toBe(1);
  await box.getByTestId('eb-brand-save').click();
  await expect.poll(() => loaded(page.frameLocator('.eb-canvas-frame').locator('img[src^="blob:"]'))).toBe(1);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect.poll(() => loaded(page.getByRole('dialog').frameLocator('iframe[title="Email preview"]').locator('img[src^="data:image/png"]')), { timeout: 30_000 }).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.reload();
  await expect(builder(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect.poll(() => loaded(page.frameLocator('.eb-canvas-frame').locator('img[src^="blob:"]'))).toBe(1);
  await page.getByTestId('eb-brand-button').click();
  await expect(box.getByLabel('Logo', { exact: true })).toHaveValue(path);
  await expect.poll(() => loaded(box.getByRole('img', { name: 'Logo', exact: true }))).toBe(1);
  await expect.poll(() => loaded(box.getByTestId('eb-brand-preview').locator('img'))).toBe(1);
  await page.keyboard.press('Escape');
  // The library downloads HTML that works outside the demo's browser storage.
  await page.goto(`${HOME}?lang=en#/templates`);
  await page.getByTestId('eb-library-template').filter({ hasText: 'Uploaded logo' }).click();
  const download = page.waitForEvent('download');
  await page.getByTestId('eb-library-details').getByRole('button', { name: 'Download', exact: true }).click();
  const stream = await (await download).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const html = Buffer.concat(chunks).toString();
  expect(html).toContain('data:image/png;base64,');
  expect(html).not.toContain(path);
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
  const greeting = frame.getByText('Your text.');
  await expect(greeting).toBeVisible({ timeout: 30_000 });
  // The colors as the reader sees them: computed in the frame.
  const color = (locator, property) => locator.evaluate((el, name) => getComputedStyle(el)[name], property);
  const buttonCell = frame.locator('td[bgcolor]').filter({ hasText: 'Learn more' }).last();
  const lightButton = await color(buttonCell, 'backgroundColor');
  expect(await color(greeting, 'color')).toBe('rgb(43, 48, 56)');

  await dialog.getByRole('tab', { name: 'Dark mode' }).click();
  await expect(dialog.locator('[data-scheme="dark"]')).toBeVisible();
  await expect(dialog.getByTestId('eb-dark-hint')).toBeVisible();
  await expect.poll(() => color(frame.getByText('Your text.'), 'color')).not.toBe('rgb(43, 48, 56)');
  const [r, g, b] = (await color(frame.getByText('Your text.'), 'color')).match(/\d+/g).map(Number);
  expect(Math.min(r, g, b)).toBeGreaterThan(180);
  // The pale page behind the email (#eceff4) is now dark, of the same cool hue.
  const behind = (await color(frame.locator('body'), 'backgroundColor')).match(/\d+/g).map(Number);
  expect(Math.max(...behind)).toBeLessThan(40);
  expect(behind[2]).toBeGreaterThan(behind[0]);
  expect(await color(frame.locator('td[bgcolor]').filter({ hasText: 'Learn more' }).last(), 'backgroundColor')).toBe(lightButton);

  await dialog.getByRole('tab', { name: 'Light mode' }).click();
  await expect.poll(() => color(frame.getByText('Your text.'), 'color')).toBe('rgb(43, 48, 56)');
});
