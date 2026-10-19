import { test, expect } from '@playwright/test';

/**
 * PROOFREAD, driven like a user on the `Builder / Interface` story: write
 * texts with mistakes, click Proofread, read what would change, apply it.
 *
 * No model: the story runs the real proofreader (checks, repair turn) around
 * a fake model that corrects the typos it knows (sumer, teh, recieve,
 * prodcuts) wherever they are, or answers `window.__proofreadAnswers` in
 * turn. `window.__proofread` records what was asked.
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
const subject = (page) => panel(page).getByLabel('Subject', { exact: true });
const dialog = (page) => page.getByTestId('eb-proofread');
const fixes = (page) => dialog(page).getByTestId('eb-proofread-fix');
const canvas = (page) => page.frameLocator('.eb-canvas-frame');

/** Back to the email's settings, where the subject is. */
async function deselect(page) {
  const button = panel(page).getByRole('button', { name: 'Deselect' });
  if (await button.count()) await button.click();
  await expect(subject(page)).toBeVisible();
}

/** A typo in the button's label and in the subject, typed where a user types them. */
async function typeMistakes(page) {
  await canvas(page).getByText('Learn more', { exact: true }).click();
  await panel(page).getByLabel('Label', { exact: true }).fill('Shop teh offers');
  await panel(page).getByLabel('Label', { exact: true }).press('Tab');
  await expect.poll(() => mjml(page)).toContain('Shop teh offers');
  await deselect(page);
  await subject(page).fill('Our sumer sale');
}

test.describe('Proofread', () => {
  test('every text read; each correction shown word by word; Apply all corrects the email in one step', async ({ page }) => {
    await openBuilder(page);
    await typeMistakes(page);
    // And one in a text block, typed in the canvas.
    await canvas(page).getByText(/Your text\./).dblclick();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' All prodcuts are on sale.');
    await page.keyboard.press('Escape');
    await expect.poll(() => mjml(page)).toContain('All prodcuts are on sale.');
    await deselect(page);

    await page.evaluate(() => (window.__proofreadDelay = 800));
    await page.getByRole('button', { name: 'Proofread', exact: true }).click();
    const box = dialog(page);
    await expect(box.getByRole('heading', { name: 'Proofread the email' })).toBeVisible();
    await expect(box.getByRole('status')).toContainText('Reading the email…');

    // In the order of the email: the subject, the text, the button.
    await expect(fixes(page)).toHaveCount(3);
    const [first, second, third] = [fixes(page).nth(0), fixes(page).nth(1), fixes(page).nth(2)];
    await expect(first).toContainText('Subject');
    await expect(first.locator('del')).toHaveText('sumer');
    await expect(first.locator('ins')).toHaveText('summer');
    await expect(second).toContainText('Text');
    await expect(second.locator('del')).toHaveText('prodcuts');
    await expect(second.locator('ins')).toHaveText('products');
    await expect(third).toContainText('Button');
    await expect(third.locator('ins')).toHaveText('the');

    // What the model was asked: every text the reader sees, as stored.
    const [asked] = await page.evaluate(() => window.__proofread);
    expect(asked.language).toBe('en');
    expect(asked.texts[0]).toEqual({ id: 'subject', kind: 'subject', format: 'plain', text: 'Our sumer sale' });
    expect(asked.texts.map((text) => text.kind)).toEqual(expect.arrayContaining(['subject', 'text', 'button']));
    expect(asked.texts.find((text) => text.kind === 'button').text).toBe('Shop teh offers');
    expect(asked.texts.find((text) => text.text.includes('prodcuts')).format).toBe('html');

    // Nothing changed before Apply.
    expect(await mjml(page)).toContain('Shop teh offers');
    await box.getByTestId('eb-proofread-apply-all').click();
    await expect(box).toBeHidden();
    await expect(page.getByText('Corrections applied: 3.')).toBeVisible();
    await expect(subject(page)).toHaveValue('Our summer sale');
    const source = await mjml(page);
    expect(source).toContain('All products are on sale.');
    expect(source).toContain('{{contact.firstname}}');
    expect(source).toContain('Shop the offers');

    // The email's texts changed in ONE step of the history.
    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toContain('All prodcuts are on sale.');
    expect(await mjml(page)).toContain('Shop teh offers');
  });

  test('one at a time; a text changed elsewhere meanwhile is left as it is; Check again reads the email anew', async ({ page }) => {
    await openBuilder(page);
    await typeMistakes(page);
    await page.evaluate(() => (window.__proofreadDelay = 50));
    await page.getByRole('button', { name: 'Proofread', exact: true }).click();
    await expect(fixes(page)).toHaveCount(2);

    await fixes(page).nth(0).getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(fixes(page).nth(0)).toHaveAttribute('data-state', 'applied');
    await expect(subject(page)).toHaveValue('Our summer sale');
    await expect(dialog(page).getByTestId('eb-proofread-apply-all')).toHaveText('Apply all (1)');

    // The label changed by something else (another tab, the host) while the
    // dialog is open: its correction was for the old words.
    await page.evaluate(() => {
      const editor = window.__emailEditor;
      const button = (node) => (node.tag === 'mj-button' ? node : (node.children || []).map(button).find(Boolean));
      editor.setContent('Shop all offers', button(editor.getDocument().project.root).id);
    });
    await dialog(page).getByTestId('eb-proofread-apply-all').click();
    await expect(fixes(page).nth(1)).toHaveAttribute('data-state', 'stale');
    await expect(fixes(page).nth(1)).toContainText('Text changed since — left as it is');
    await expect(dialog(page)).toBeVisible();
    expect(await mjml(page)).toContain('Shop all offers');

    await dialog(page).getByRole('button', { name: 'Check again' }).click();
    await expect(dialog(page).getByText('No mistake found.')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(dialog(page)).toBeHidden();
  });

  test('failures say why in the dialog; Cancel stops the reading; nothing changes either way', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    await page.evaluate(() => {
      window.__proofreadDelay = 50;
      window.__proofreadFail = 'Claude is busy right now.';
    });
    await page.getByRole('button', { name: 'Proofread', exact: true }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('Claude is busy right now.');

    // Unreadable twice: said plainly.
    await page.evaluate(() => {
      window.__proofreadFail = null;
      window.__proofreadAnswers = ['The email looks fine!', 'Still fine!'];
    });
    await dialog(page).getByRole('button', { name: 'Check again' }).click();
    await expect(dialog(page).getByRole('alert')).toHaveText('The AI answer could not be read. Try again.');

    // The starter email has no typo.
    await dialog(page).getByRole('button', { name: 'Check again' }).click();
    await expect(dialog(page).getByText('No mistake found.')).toBeVisible();

    await page.evaluate(() => (window.__proofreadDelay = 1500));
    await dialog(page).getByRole('button', { name: 'Check again' }).click();
    await expect(dialog(page).getByRole('status')).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog(page)).toBeHidden();
    await page.waitForTimeout(1800);
    await expect(dialog(page)).toBeHidden();
    expect(await mjml(page)).toBe(before);
  });

  test('French interface: its texts, the email read in French', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.evaluate(() => (window.__proofreadDelay = 50));
    await page.getByRole('button', { name: 'Relire', exact: true }).click();
    await expect(dialog(page).getByRole('heading', { name: "Relire l'e-mail" })).toBeVisible();
    await expect(dialog(page).getByText('Aucune faute trouvée.')).toBeVisible();
    expect((await page.evaluate(() => window.__proofread))[0].language).toBe('fr');
  });
});
