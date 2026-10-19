import { test, expect } from '@playwright/test';

/**
 * THE AI IS A MODULE: the builder without `ai` (an application that does not
 * install it) has no AI button anywhere; with `createAi({ rewrite })`, only
 * that part. And Ctrl K, the search shortcut of the variables menu.
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
const proofreadButton = (page, name = 'Proofread') => page.getByTestId('email-builder').getByRole('button', { name, exact: true });

/** Selects the headline: a text block, where "Write with AI" and "Rewrite with AI" would be. */
async function selectHeadline(page) {
  await canvas(page).getByText('Your headline', { exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Deselect' })).toBeVisible();
}

test.describe('The AI module', () => {
  test('without it (?ai=off): no Proofread, no Write or Rewrite with AI, no Suggest subjects — the rest is all there', async ({ page }) => {
    await openBuilder(page, '&ai=off');
    await expect(page.getByRole('button', { name: 'Variables' })).toBeVisible();
    await expect(proofreadButton(page)).toHaveCount(0);
    await expect(panel(page).getByRole('textbox', { name: 'Subject' })).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await selectHeadline(page);
    await expect(page.getByTestId('eb-rewrite')).toHaveCount(0);
    await expect(page.getByTestId('eb-write')).toHaveCount(0);
    await expect(panel(page)).not.toContainText(/Rewrite with AI|Write with AI/);
    await expect(page.getByTestId('eb-ai-connect')).toHaveCount(0);
  });

  test('without it, in French: no AI text either', async ({ page }) => {
    await openBuilder(page, '&ai=off&lang=fr');
    await expect(panel(page).getByRole('textbox', { name: 'Objet' })).toBeVisible();
    await expect(proofreadButton(page, 'Relire')).toHaveCount(0);
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await expect(page.getByTestId('email-builder')).not.toContainText(/Relire|Suggérer des objets|Réécrire avec l'IA|Écrire avec l'IA/);
  });

  test('createAi({ rewrite }): only Write and Rewrite with AI', async ({ page }) => {
    await openBuilder(page, '&ai=rewrite');
    await expect(proofreadButton(page)).toHaveCount(0);
    await expect(page.getByTestId('eb-subject-ideas')).toHaveCount(0);
    await selectHeadline(page);
    await expect(page.getByTestId('eb-write').getByText('Write with AI')).toBeVisible();
    await expect(page.getByTestId('eb-rewrite').getByText('Rewrite with AI')).toBeVisible();
  });

  test('the whole module: Proofread, Suggest subjects, Write and Rewrite with AI — in French too', async ({ page }) => {
    await openBuilder(page);
    await expect(proofreadButton(page)).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas').getByRole('button', { name: 'Suggest subjects' })).toBeVisible();
    await selectHeadline(page);
    await expect(page.getByTestId('eb-rewrite').getByText('Rewrite with AI')).toBeVisible();
    // Its texts come with it.
    await openBuilder(page, '&lang=fr');
    await expect(proofreadButton(page, 'Relire')).toBeVisible();
    await expect(page.getByTestId('eb-subject-ideas').getByRole('button', { name: 'Suggérer des objets' })).toBeVisible();
  });
});

test.describe('Ctrl K', () => {
  /** Whether the whole text of the focused field is selected. */
  const allSelected = (field) => field.evaluate((input) => input.selectionStart === 0 && input.selectionEnd === input.value.length);

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
    await canvas(page).getByText('Titre du message', { exact: true }).click();
    await page.getByRole('button', { name: 'Variables' }).click();
    await expect(page.getByTestId('variable-picker').getByTestId('eb-search-keys')).toHaveText('Ctrl K');
  });
});
