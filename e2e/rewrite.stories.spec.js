import { test, expect } from '@playwright/test';

/**
 * REWRITE WITH AI, driven like a user on the `Builder / Interface` story:
 * select a text or a button, click what to do, the text changes in place;
 * Ctrl+Z brings it back.
 *
 * No model: the story's storage runs the real rewriter (checks, repair turn)
 * around a fake model that answers `window.__rewriteAnswers` in turn, else
 * the text with "Rewritten:" in front. `window.__rewritten` records what was
 * asked.
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
const rewrite = (page) => page.getByTestId('eb-rewrite');
const canvas = (page) => page.frameLocator('.eb-canvas-frame');
const asked = (page) => page.evaluate(() => window.__rewritten || []);

test.describe('Rewrite with AI', () => {
  test('one click rewrites the selected text in place; Ctrl+Z brings it back', async ({ page }) => {
    await openBuilder(page);
    // Not offered for what has no words.
    await page.locator('[data-block-id="divider"]').click();
    await expect(panel(page).getByRole('heading', { name: 'Divider' })).toBeVisible();
    await expect(rewrite(page)).toHaveCount(0);

    await canvas(page).getByText('Your headline', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText('Rewrite with AI')).toBeVisible();
    for (const name of ['Shorter', 'Longer', 'Fix mistakes', 'Friendlier', 'More formal', 'Translate']) {
      await expect(box.getByRole('button', { name, exact: true })).toBeVisible();
    }

    await page.evaluate(() => (window.__rewriteDelay = 800));
    await box.getByRole('button', { name: 'Shorter', exact: true }).click();
    await expect(box.getByRole('status')).toContainText('Rewriting…');
    await expect(canvas(page).getByText('Rewritten: Your headline', { exact: true })).toBeVisible();
    await expect(box.getByRole('status')).toBeHidden();
    await expect(page.getByText('Text rewritten. Ctrl+Z brings back the previous one.')).toBeVisible();
    expect(await asked(page)).toEqual([{ action: 'shorter', text: 'Your headline', format: 'html' }]);

    await page.keyboard.press('Control+z');
    await expect(canvas(page).getByText('Your headline', { exact: true })).toBeVisible();
    expect(await mjml(page)).not.toContain('Rewritten:');
  });

  test('translate, or say what to change; a lost variable is asked again', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline', { exact: true }).click();
    const box = rewrite(page);
    await page.evaluate(() => {
      window.__rewriteDelay = 50;
      window.__rewriteAnswers = ['Votre titre'];
    });
    await box.getByRole('button', { name: 'Translate' }).click();
    await page.getByRole('menuitem', { name: 'Français' }).click();
    await expect(canvas(page).getByText('Votre titre', { exact: true })).toBeVisible();
    expect((await asked(page))[0]).toMatchObject({ action: 'translate', targetLanguage: 'fr' });

    // The greeting holds {{contact.firstname}}: an answer without it is sent
    // back to the model, the second one is used.
    await canvas(page).getByText(/Your text\./).click();
    await page.evaluate(() => {
      window.__rewriteAnswers = ['Hi there, here is the news.', 'Hi {{contact.firstname}}, here is the news.'];
    });
    await rewrite(page).getByRole('textbox', { name: 'What to change' }).fill('Say hi, one sentence');
    await rewrite(page).getByRole('textbox', { name: 'What to change' }).press('Enter');
    await expect(canvas(page).getByText(/here is the news/)).toBeVisible();
    expect(await mjml(page)).toContain('Hi {{contact.firstname}}, here is the news.');
    expect((await asked(page))[1]).toMatchObject({ action: 'custom', instruction: 'Say hi, one sentence', format: 'html' });
    await expect(rewrite(page).getByRole('textbox', { name: 'What to change' })).toHaveValue('');
  });

  test('a button label stays plain text', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Learn more', { exact: true }).click();
    await expect(panel(page).getByRole('heading', { name: 'Button' })).toBeVisible();
    await page.evaluate(() => {
      window.__rewriteDelay = 50;
      window.__rewriteAnswers = ['<b>Read the story</b>'];
    });
    await rewrite(page).getByRole('button', { name: 'Friendlier', exact: true }).click();
    await expect(panel(page).getByLabel('Label', { exact: true })).toHaveValue('Read the story');
    expect((await asked(page))[0]).toMatchObject({ action: 'friendlier', text: 'Learn more', format: 'plain' });
    expect(await mjml(page)).not.toContain('<b>Read the story');
  });

  test('failures leave the text as it was and say why, where the user is', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText(/Your text\./).click();
    const before = await mjml(page);
    const box = rewrite(page);

    await page.evaluate(() => {
      window.__rewriteDelay = 50;
      window.__rewriteFail = 'Claude is busy right now.';
    });
    await box.getByRole('button', { name: 'Longer', exact: true }).click();
    await expect(box.getByRole('alert')).toHaveText('Claude is busy right now.');

    // Twice without the variable: given up, nothing replaced.
    await page.evaluate(() => {
      window.__rewriteFail = null;
      window.__rewriteAnswers = ['Hello, your text.', 'Hello again, your text.'];
    });
    await box.getByRole('button', { name: 'Fix mistakes', exact: true }).click();
    await expect(box.getByRole('alert')).toHaveText('The rewritten text lost a link or a variable, so nothing was changed. Try again.');
    expect(await mjml(page)).toBe(before);

    // Selecting another element cancels a rewrite in progress.
    await page.evaluate(() => (window.__rewriteDelay = 1500));
    await box.getByRole('button', { name: 'Shorter', exact: true }).click();
    await expect(box.getByRole('status')).toBeVisible();
    await canvas(page).getByText('Your headline', { exact: true }).click();
    await page.waitForTimeout(1800);
    expect(await mjml(page)).toBe(before);
  });

  test('French interface', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await canvas(page).getByText('Titre du message', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText("Réécrire avec l'IA")).toBeVisible();
    await page.evaluate(() => (window.__rewriteDelay = 50));
    await box.getByRole('button', { name: 'Plus court', exact: true }).click();
    await expect(canvas(page).getByText('Rewritten: Titre du message', { exact: true })).toBeVisible();
  });
});
