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

const row = (page, name) => page.getByTestId('eb-library-templates').getByTestId('eb-library-template').filter({ hasText: name });
const tagsOf = (locator) => locator.getByTestId('eb-tag');

test('standalone: lists templates with their tags, previews, searches, hands Edit and New to the host', async ({ page }) => {
  await page.goto(STANDALONE);
  await expect(library(page)).toHaveAttribute('data-layout', 'wide');
  await expect(page.getByRole('heading', { name: 'Email template library' })).toBeVisible();

  const mine = page.getByTestId('eb-library-templates');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  // No bases: a new template starts from one in the editor.
  await expect(page.getByTestId('eb-library-bases')).toHaveCount(0);
  await expect(tagsOf(row(page, 'October newsletter'))).toHaveText(['Marketing']);
  await expect(tagsOf(row(page, 'Welcome series'))).toHaveText(['Onboarding']);
  await expect(tagsOf(row(page, 'Welcome series'))).toHaveAttribute('data-color', 'green');

  // The most recent template is selected and previewed.
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1' })).toBeVisible();
  await expect(details(page).getByText('Three steps to get started.')).toBeVisible();
  await expect(tagsOf(details(page).getByTestId('eb-library-tags'))).toHaveText(['Onboarding']);
  await expect(page.frameLocator('iframe[title="Email preview"]').locator('h1')).toHaveText('Welcome aboard!');

  // Search (Ctrl+K focuses it), by name or by tag.
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('searchbox', { name: 'Search templates' })).toBeFocused();
  await page.keyboard.type('october');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(1);
  await page.keyboard.type('zzz');
  await expect(page.getByText('Nothing matches “octoberzzz”.')).toBeVisible();
  await page.keyboard.press('Escape'); // clears the search
  await expect(page.getByRole('searchbox', { name: 'Search templates' })).toHaveValue('');
  await page.getByRole('searchbox', { name: 'Search templates' }).fill('onboard');
  await expect(mine.getByTestId('eb-library-template')).toHaveText([/Welcome series/]);
  await page.getByRole('searchbox', { name: 'Search templates' }).press('Escape');

  await row(page, 'October newsletter').click();
  await details(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'New template' }).click();

  const seen = await events(page);
  expect(seen).toEqual([{ type: 'edit', id: 1 }, { type: 'create' }]);
});

test('standalone: the five actions — Edit, Duplicate, Copy HTML, Download, Delete; the next template takes the place of one deleted', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(STANDALONE);
  const mine = page.getByTestId('eb-library-templates');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  for (const name of ['Edit', 'Duplicate', 'Copy HTML', 'Download', 'Delete']) {
    await expect(details(page).getByRole('button', { name, exact: true })).toBeVisible();
  }

  await details(page).getByRole('button', { name: 'Copy HTML' }).click();
  await expect(page.getByText('HTML copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('<h1>Welcome aboard!</h1>');

  const [file] = await Promise.all([page.waitForEvent('download'), details(page).getByRole('button', { name: 'Download' }).click()]);
  expect(file.suggestedFilename()).toMatch(/\.html$/);

  // A copy keeps the tags.
  await details(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(3);
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1 (copy)' })).toBeVisible();
  await expect(tagsOf(row(page, '(copy)'))).toHaveText(['Onboarding']);

  await details(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  await expect(mine).not.toContainText('(copy)');
  // The copy was first: the next one is selected, never a “not found”.
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1' })).toBeVisible();
  await expect(row(page, 'Welcome series')).toHaveAttribute('aria-current', 'true');
  await expect(details(page)).not.toContainText('Template not found');

  // The last one deleted: the one before it is selected.
  await row(page, 'October newsletter').click();
  await details(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(1);
  await expect(row(page, 'Welcome series')).toHaveAttribute('aria-current', 'true');
  await expect(details(page).getByRole('heading', { name: 'Welcome series — day 1' })).toBeVisible();
});

test('deleteDisabled: Delete stays in place but only says why', async ({ page }) => {
  await page.goto(`${STANDALONE}&nodelete=1`);
  const mine = page.getByTestId('eb-library-templates');
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
  const remove = details(page).getByRole('button', { name: 'Delete', exact: true });
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await expect(remove).toHaveAttribute('title', 'Deleting is turned off here.');
  // aria-disabled, not disabled: a click still reaches it and tells why.
  await remove.click({ force: true });
  await expect(page.getByText('Deleting is turned off here.')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(mine.getByTestId('eb-library-template')).toHaveCount(2);
});

test('tags: create, tick up to three, rename, delete — on the row at once', async ({ page }) => {
  await page.goto(STANDALONE);
  await row(page, 'October newsletter').click();
  await details(page).getByTestId('eb-library-tags-button').click();
  const dialog = page.getByTestId('eb-tags-dialog');
  await expect(dialog.getByText('Up to 3 tags on “October newsletter”.')).toBeVisible();
  const options = dialog.getByTestId('eb-tags-option');
  await expect(options).toHaveCount(2);
  await expect(dialog.getByRole('checkbox', { name: 'Marketing' })).toBeChecked();
  await expect(dialog.getByTestId('eb-tags-count')).toHaveText('1 / 3');

  // Twelve colors in one row, up to the Create button.
  const form = dialog.getByTestId('eb-tags-form');
  const colors = form.getByRole('radio');
  await expect(colors).toHaveCount(12);
  // Measured in one frame: the dialog may still be zooming in.
  const [first, last, create] = await form.evaluate((el) => {
    const radios = [...el.querySelectorAll('[role=radio]')];
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Create');
    return [radios[0], radios.at(-1), button].map((box) => box.getBoundingClientRect().toJSON());
  });
  expect(last.y).toBeCloseTo(first.y, 0);
  expect(create.x - (last.x + last.width)).toBeLessThanOrEqual(16);
  await expect(form.getByRole('button', { name: 'Create' }).locator('svg')).toHaveCount(1);

  // A new tag is ticked at once, in the color picked.
  await form.getByLabel('New tag').fill('Events');
  await form.getByRole('radio', { name: 'Violet' }).click();
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Events' })).toBeChecked();
  await expect(dialog.getByTestId('eb-tags-count')).toHaveText('2 / 3');
  await expect(tagsOf(row(page, 'October newsletter'))).toHaveText(['Events', 'Marketing']);
  await expect(tagsOf(row(page, 'October newsletter')).first()).toHaveAttribute('data-color', 'violet');

  // Names are unique, case aside.
  await form.getByLabel('New tag').fill('marketing');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(form.getByText('A tag with this name already exists')).toBeVisible();

  // Three at most: the others wait, unticked.
  await dialog.getByRole('checkbox', { name: 'Onboarding' }).check();
  await expect(dialog.getByTestId('eb-tags-count')).toHaveText('3 tags at most: untick one to choose another.');
  await form.getByLabel('New tag').fill('VIP');
  await form.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'VIP' })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'VIP' })).toBeDisabled();
  await expect(tagsOf(row(page, 'October newsletter'))).toHaveCount(3);

  // Rename, then delete: from every template.
  await dialog.getByRole('button', { name: 'Edit the tag “VIP”' }).click();
  await expect(form.getByLabel('Edit tag')).toHaveValue('VIP');
  await form.getByLabel('Edit tag').fill('Customers');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Customers' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete the tag “Onboarding”' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('It is removed from every template.');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(options).toHaveCount(3);
  await expect(dialog.getByTestId('eb-tags-count')).toHaveText('2 / 3');
  await expect(dialog.getByRole('checkbox', { name: 'Customers' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toHaveCount(0);

  await expect(tagsOf(row(page, 'October newsletter'))).toHaveText(['Events', 'Marketing']);
  await expect(tagsOf(row(page, 'Welcome series'))).toHaveCount(0);
  // Kept by the storage, not only on screen.
  const stored = await page.evaluate(() => window.__emailStorage.dump());
  expect(stored.tags.map((tag) => tag.label)).toEqual(['Customers', 'Events', 'Marketing']);
  expect(stored.rows.map((r) => r.tags.length)).toEqual([2, 0]);
});

test('tag filters under the search: one tag, several (any of them), none again with the reset, with the search; a deleted tag stops filtering', async ({ page }) => {
  await page.goto(STANDALONE);
  const filter = page.getByTestId('eb-library-tag-filter');
  const names = () => page.getByTestId('eb-library-templates').getByTestId('eb-library-template');
  const chip = (name) => filter.getByRole('button', { name, exact: true });
  const reset = page.getByTestId('eb-library-tag-reset');
  // No tag picked: every template, and the reset has nothing to clear.
  await expect(filter.getByRole('button')).toHaveText(['Marketing', 'Onboarding']);
  await expect(filter.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(names()).toHaveCount(2);
  await expect(reset).toHaveAccessibleName('Clear the tag filters');
  await expect(reset).toBeDisabled();

  await chip('Marketing').click();
  await expect(names()).toHaveCount(1);
  await expect(names().first()).toContainText('October newsletter');
  await expect(reset).toBeEnabled();
  await chip('Onboarding').click();
  await expect(names()).toHaveCount(2);
  await chip('Marketing').click();
  await expect(names()).toHaveCount(1);
  await expect(names().first()).toContainText('Welcome series');

  // The search narrows what the tags keep.
  const search = page.getByRole('searchbox', { name: 'Search templates' });
  await search.fill('october');
  await expect(page.getByText('Nothing matches “october”.')).toBeVisible();
  await search.fill('');
  await reset.click();
  await expect(names()).toHaveCount(2);
  await expect(filter.getByRole('button', { pressed: true })).toHaveCount(0);
  await expect(reset).toBeDisabled();

  // A tag put on a template joins the filters; deleted, it stops filtering.
  await row(page, 'October newsletter').click();
  await details(page).getByTestId('eb-library-tags-button').click();
  const dialog = page.getByTestId('eb-tags-dialog');
  await dialog.getByLabel('New tag').fill('VIP');
  await dialog.getByTestId('eb-tags-form').getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByRole('checkbox', { name: 'VIP' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(filter.getByRole('button')).toHaveText(['Marketing', 'Onboarding', 'VIP']);
  await chip('VIP').click();
  await expect(names()).toHaveCount(1);
  await details(page).getByTestId('eb-library-tags-button').click();
  await dialog.getByRole('button', { name: 'Delete the tag “VIP”' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(filter.getByRole('button')).toHaveText(['Marketing', 'Onboarding']);
  await expect(reset).toBeDisabled();
  await expect(names()).toHaveCount(2);
});

test('favorites: the star moves an entry to the top section, and it stays after a reload', async ({ page }) => {
  await page.goto(STANDALONE);
  await page.evaluate(() => localStorage.removeItem('best-email-builder:favorites'));
  await page.reload();
  await expect(page.getByTestId('eb-library-favorites')).toHaveCount(0);
  await row(page, 'October newsletter').click();
  await details(page).getByRole('button', { name: 'Add to favorites' }).click();
  const favorites = page.getByTestId('eb-library-favorites');
  await expect(favorites.getByTestId('eb-library-template')).toHaveText(/October newsletter/);
  await expect(page.getByTestId('eb-library-templates').getByTestId('eb-library-template')).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId('eb-library-favorites').getByTestId('eb-library-template')).toHaveText(/October newsletter/);
  await page.getByTestId('eb-library-favorites').getByTestId('eb-library-template').click();
  await details(page).getByRole('button', { name: 'Remove from favorites' }).click();
  await expect(page.getByTestId('eb-library-favorites')).toHaveCount(0);
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

test('studio: new template → a base from the editor’s Templates → save → back to the library → edit again', async ({ page }) => {
  await page.goto(STUDIO);
  await expect(page.getByText('No template yet: create the first one.')).toBeVisible();
  await page.getByRole('button', { name: 'New template' }).click();

  const builder = page.getByTestId('email-builder');
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Templates' }).click();
  await page.getByTestId('eb-template-gallery').locator('[data-template-id="promotion"]').click();
  await expect(page.frameLocator('.eb-canvas-frame').getByText('30% off everything')).toBeVisible();
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue('30% off this weekend only');
  await page.getByTestId('eb-properties').getByLabel(/^Name/).fill('Spring sale');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(/^Saved at/)).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();

  await expect(library(page)).toBeVisible();
  await expect(details(page).getByRole('heading', { name: 'Spring sale' })).toBeVisible();
  await expect(details(page).getByRole('button', { name: 'Copy HTML' })).toBeVisible();
  await details(page).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(builder).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await expect(page.getByTestId('eb-properties').getByLabel(/^Name/)).toHaveValue('Spring sale');
  await expect(page.frameLocator('.eb-canvas-frame').getByText('30% off everything')).toBeVisible();
});

test('French', async ({ page }) => {
  await page.goto(`${STANDALONE}&lang=fr`);
  await expect(page.getByRole('heading', { name: 'Bibliothèque de modèles e-mail' })).toBeVisible();
  await expect(page.getByTestId('eb-library-templates')).toContainText('Modèles (2)');
  await expect(page.getByRole('button', { name: 'Nouveau modèle' })).toBeVisible();
  await details(page).getByRole('button', { name: 'Modifier les étiquettes' }).click();
  const dialog = page.getByTestId('eb-tags-dialog');
  await expect(dialog.getByRole('heading', { name: 'Étiquettes' })).toBeVisible();
  await expect(dialog.getByText('Jusqu’à 3 étiquettes sur « Welcome series — day 1 ».')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Bleu canard' })).toBeVisible();
});

test('wide: the list a fifth of the width, never under 260 px; the template and its preview the same width', async ({ page }) => {
  const widths = async () => {
    const width = async (testId) => (await page.getByTestId(testId).boundingBox()).width;
    return { all: await width('template-library'), list: await width('eb-library-list'), details: await width('eb-library-details'), preview: await width('eb-library-preview') };
  };
  await page.setViewportSize({ width: 1912, height: 1016 });
  await page.goto(STANDALONE);
  await expect(page.getByTestId('eb-library-preview')).toBeVisible();
  let w = await widths();
  expect(Math.abs(w.list - w.all * 0.2)).toBeLessThan(2);
  expect(Math.abs(w.details - w.preview)).toBeLessThan(2);
  await page.setViewportSize({ width: 1240, height: 900 });
  await expect.poll(async () => Math.round((await widths()).list)).toBe(260);
  w = await widths();
  expect(Math.abs(w.details - w.preview)).toBeLessThan(2);
});

test('preview: the editor’s device switch, and the frame narrows and widens smoothly', async ({ page }) => {
  await page.goto(STANDALONE);
  const preview = page.getByTestId('eb-library-preview');
  const box = preview.locator('[data-device]');
  await expect(preview.frameLocator('iframe').locator('[data-preview]')).toBeVisible();
  const wide = (await box.boundingBox()).width;
  await preview.getByRole('tab', { name: 'Mobile' }).click();
  await expect(box).toHaveAttribute('data-device', 'mobile');
  // Mid-way through the 350 ms transition the width is between the two.
  await page.waitForTimeout(120);
  const midway = (await box.boundingBox()).width;
  expect(midway).toBeLessThan(wide);
  expect(midway).toBeGreaterThan(375);
  await expect.poll(async () => Math.round((await box.boundingBox()).width)).toBe(375);
  await preview.getByRole('tab', { name: 'Desktop' }).click();
  await expect.poll(async () => Math.round((await box.boundingBox()).width)).toBe(Math.round(wide));
});

test('preview: dark mode as mail apps show it, the hint with it; light mode brings the email back as it is', async ({ page }) => {
  await page.goto(STANDALONE);
  const preview = page.getByTestId('eb-library-preview');
  const frame = preview.frameLocator('iframe');
  await expect(frame.locator('h1')).toHaveText('Welcome aboard!');
  const looks = () =>
    frame.locator('body').evaluate((body) => ({
      sheet: body.ownerDocument.querySelectorAll('style[data-eb-dark]').length,
      background: getComputedStyle(body).backgroundColor,
      heading: getComputedStyle(body.querySelector('h1')).color,
    }));
  expect((await looks()).sheet).toBe(0);
  await expect(page.getByTestId('eb-dark-hint')).toHaveCount(0);

  await preview.getByRole('tab', { name: 'Dark mode' }).click();
  await expect(preview.getByRole('tab', { name: 'Dark mode' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('eb-dark-hint')).toBeVisible();
  await expect.poll(async () => (await looks()).sheet).toBe(1);
  const dark = await looks();
  expect(dark.background).toBe('rgb(18, 18, 18)');
  // Dark text turned light: readable on the dark page.
  const [r, g, b] = dark.heading.match(/\d+/g).map(Number);
  expect(Math.min(r, g, b)).toBeGreaterThan(150);

  // Another template keeps the scheme chosen.
  await page.getByTestId('eb-library-templates').getByTestId('eb-library-template').filter({ hasText: 'October newsletter' }).click();
  await expect.poll(async () => (await looks()).sheet).toBe(1);

  await preview.getByRole('tab', { name: 'Light mode' }).click();
  await expect(page.getByTestId('eb-dark-hint')).toHaveCount(0);
  await expect.poll(async () => (await looks()).sheet).toBe(0);
  expect((await looks()).background).not.toBe('rgb(18, 18, 18)');
});
