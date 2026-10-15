import { test, expect } from '@playwright/test';

/**
 * THE AI IS A MODULE: the builder without `ai` (an application that does not
 * install it) has no AI button anywhere; with `createAi({ rewrite })`, only
 * that part. And Ctrl K, the search shortcut of Generate and of the
 * variables menu.
 *
 * Story `Builder / Interface`: `?ai=off`, `?ai=rewrite`, or the whole module
 * (fake model) by default.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';

async function openBuilder(page, query = '') {
  await page.goto(`${STORY}${query}`);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

const panel = (page) => page.getByTestId('eb-properties');
const canvas = (page) => page.frameLocator('.eb-canvas-frame');
const generateButton = (page, name = 'Generate') => page.getByTestId('email-builder').getByRole('button', { name, exact: true });

/** Selects the headline: a text block, where "Rewrite with AI" would be. */
async function selectHeadline(page) {
  await canvas(page).getByText('Your headline', { exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Deselect' })).toBeVisible();
}

test.describe('The AI module', () => {
  test('without it (?ai=off): no Generate, no Rewrite with AI, no Suggest subjects — the rest is all there', async ({ page }) => {
    await openBuilder(page, '&ai=off');
    await expect(page.getByRole('button', { name: 'Variables' })).toBeVisible();
    await expect(generateButton(page)).toHaveCount(0);
    await expect(panel(page).getByRole('textbox', { name: 'Subject' })).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await selectHeadline(page);
    await expect(page.getByTestId('eb-rewrite')).toHaveCount(0);
    await expect(panel(page)).not.toContainText('Rewrite with AI');
    await expect(page.getByTestId('eb-ai-connect')).toHaveCount(0);
  });

  test('without it, in French: no AI text either', async ({ page }) => {
    await openBuilder(page, '&ai=off&lang=fr');
    await expect(panel(page).getByRole('textbox', { name: 'Objet' })).toBeVisible();
    await expect(generateButton(page, 'Générer')).toHaveCount(0);
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await expect(page.getByTestId('email-builder')).not.toContainText(/Générer|Suggérer des objets|Réécrire avec l'IA/);
  });

  test('createAi({ rewrite }): only Rewrite with AI', async ({ page }) => {
    await openBuilder(page, '&ai=rewrite');
    await expect(generateButton(page)).toHaveCount(0);
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await selectHeadline(page);
    await expect(page.getByTestId('eb-rewrite').getByText('Rewrite with AI')).toBeVisible();
  });

  test('the whole module: Generate, Suggest subjects, Rewrite with AI — in French too', async ({ page }) => {
    await openBuilder(page);
    await expect(generateButton(page)).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas').getByRole('button', { name: 'Suggest subjects' })).toBeVisible();
    await selectHeadline(page);
    await expect(page.getByTestId('eb-rewrite').getByText('Rewrite with AI')).toBeVisible();
    // Its texts come with it.
    await openBuilder(page, '&lang=fr');
    await expect(generateButton(page, 'Générer')).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas').getByRole('button', { name: 'Suggérer des objets' })).toBeVisible();
  });
});

test.describe('Ctrl K', () => {
  /** Whether the whole text of the focused field is selected. */
  const allSelected = (field) => field.evaluate((input) => input.selectionStart === 0 && input.selectionEnd === input.value.length);

  test('in Generate: the hint at the end of the search, the shortcut puts the cursor there, its words selected', async ({ page }) => {
    await openBuilder(page);
    await generateButton(page).click();
    const box = page.getByTestId('eb-generate');
    const search = box.getByRole('searchbox', { name: 'Search' });
    await expect(box.getByTestId('eb-search-keys')).toHaveText('Ctrl K');
    await expect(search).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');

    await search.fill('sale');
    await box.getByPlaceholder('Details (optional): product, dates, offer, tone, language…').click();
    await expect(search).not.toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(search).toBeFocused();
    expect(await allSelected(search)).toBe(true);
    // Typing replaces the search.
    await page.keyboard.type('birthday');
    await expect(search).toHaveValue('birthday');
  });

  test('in the variables menu: the hint, and the shortcut back to the search', async ({ page }) => {
    await openBuilder(page);
    await selectHeadline(page);
    await page.getByRole('button', { name: 'Variables' }).click();
    const picker = page.getByTestId('variable-picker');
    const search = picker.getByRole('textbox', { name: 'Search variables…' });
    await expect(picker.getByTestId('eb-search-keys')).toHaveText('Ctrl K');
    await expect(search).toBeFocused();
    await search.fill('name');
    await search.evaluate((input) => input.blur());
    await expect(search).not.toBeFocused();
    await page.keyboard.press('Control+k');
    await expect(search).toBeFocused();
    expect(await allSelected(search)).toBe(true);
  });

  test('the hint is the same in French', async ({ page }) => {
    await openBuilder(page, '&lang=fr');
    await generateButton(page, 'Générer').click();
    await expect(page.getByTestId('eb-generate').getByTestId('eb-search-keys')).toHaveText('Ctrl K');
  });
});
