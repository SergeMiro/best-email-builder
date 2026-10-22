import { test, expect } from '@playwright/test';

/**
 * WRITE WITH AI, driven like a user on the `Builder / Interface` story:
 * select a text or a button, say what to write or change in its one field,
 * or click what to do; the text changes in place, coming in word by word;
 * Ctrl+Z brings it back.
 *
 * No model: the story's storage runs the real rewriter (checks, repair turn)
 * around a fake model that answers `window.__rewriteAnswers` in turn, else
 * the text with "Rewritten:" in front ("Written about" the user's words for
 * what they ask). `window.__rewritten` records what was asked.
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

/** A merge tag at the end of the selected text, added as a user does: its badge in the variables panel. */
async function addFirstName(page) {
  await page.getByTestId('eb-ribbon').locator('[data-drawer="variables"]').click();
  await page.getByTestId('eb-panel-variables').getByRole('button', { name: 'First name', exact: true }).click();
  await expect.poll(() => mjml(page)).toContain('Your text. {{contact.firstname}}');
  await page.mouse.move(10, 10);
}

test.describe('Write with AI: one click', () => {
  test('one click rewrites the selected text in place; Ctrl+Z brings it back', async ({ page }) => {
    await openBuilder(page);
    // Not offered for what has no words.
    await page.locator('[data-block-id="divider"]').click();
    await expect(panel(page).getByRole('heading', { name: 'Divider' })).toBeVisible();
    await expect(rewrite(page)).toHaveCount(0);

    await canvas(page).getByText('Your headline', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText('Write with AI')).toBeVisible();
    // One field for the user's words, not two.
    await expect(box.getByRole('textbox')).toHaveCount(1);
    for (const name of ['Shorter', 'Longer', 'Fix mistakes', 'Friendlier', 'More formal', 'Translate']) {
      await expect(box.getByRole('button', { name, exact: true })).toBeVisible();
    }

    await page.evaluate(() => (window.__rewriteDelay = 800));
    await box.getByRole('button', { name: 'Shorter', exact: true }).click();
    await expect(box.getByRole('status')).toContainText('Rewriting…');
    // While the AI works the text shimmers; its answer comes in word by word.
    await expect(canvas(page).getByTestId('eb-canvas-working')).toBeVisible();
    await expect(canvas(page).locator('.eb-reveal').first()).toBeAttached();
    await expect(canvas(page).getByTestId('eb-canvas-working')).toBeHidden();
    await expect(canvas(page).getByText('Rewritten: Your headline', { exact: true })).toBeVisible();
    await expect(box.getByRole('status')).toBeHidden();
    // Then the words are the text again: nothing of the animation is kept.
    await expect(canvas(page).locator('.eb-reveal')).toHaveCount(0);
    expect(await mjml(page)).not.toContain('eb-reveal');
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
    await addFirstName(page);
    await page.evaluate(() => {
      window.__rewriteAnswers = ['Hi there, here is the news.', 'Hi {{contact.firstname}}, here is the news.'];
    });
    // A prompt of several lines: Shift+Enter starts a new one, Enter sends.
    const prompt = rewrite(page).getByRole('textbox', { name: 'Ask the AI' });
    await expect(prompt).toHaveJSProperty('tagName', 'TEXTAREA');
    await prompt.fill('Say hi');
    await prompt.press('Shift+Enter');
    await prompt.pressSequentially('one sentence');
    await expect(prompt).toHaveValue('Say hi\none sentence');
    expect(await asked(page)).toHaveLength(1);
    await prompt.press('Enter');
    await expect(canvas(page).getByText(/here is the news/)).toBeVisible();
    expect(await mjml(page)).toContain('Hi {{contact.firstname}}, here is the news.');
    expect((await asked(page))[1]).toMatchObject({ action: 'custom', instruction: 'Say hi\none sentence', format: 'html' });
    await expect(rewrite(page).getByRole('textbox', { name: 'Ask the AI' })).toHaveValue('');
    // Two changes, one notice: the second replaces the first.
    await expect(page.getByText('Text written. Ctrl+Z brings back the previous one.')).toHaveCount(1);
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
    await addFirstName(page);
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

  test('French interface; with reduced motion the answer comes at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openBuilder(page, { lang: 'fr' });
    await canvas(page).getByText('Titre du message', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText("Écrire avec l'IA")).toBeVisible();
    await page.evaluate(() => (window.__rewriteDelay = 50));
    await box.getByRole('button', { name: 'Plus court', exact: true }).click();
    await expect(canvas(page).getByText('Rewritten: Titre du message', { exact: true })).toBeVisible();
    await expect(canvas(page).locator('.eb-reveal')).toHaveCount(0);
  });
});

test.describe('Write with AI: in the user’s words', () => {
  test('a title written on a topic: one line, fitting the email around it; Ctrl+Z brings the old one back', async ({ page }) => {
    await openBuilder(page);
    // A button's label is written in the same field.
    await canvas(page).getByText('Learn more', { exact: true }).click();
    await expect(panel(page).getByRole('heading', { name: 'Button' })).toBeVisible();
    await expect(rewrite(page).getByRole('textbox', { name: 'Ask the AI' })).toBeVisible();

    await canvas(page).getByText('Your headline', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText('Write with AI')).toBeVisible();
    const topic = box.getByRole('textbox', { name: 'Ask the AI' });
    await expect(box.getByRole('button', { name: 'Write', exact: true })).toBeDisabled();
    await topic.fill('the sale ends Sunday');
    await page.evaluate(() => (window.__rewriteDelay = 800));
    await topic.press('Enter');
    await expect(box.getByRole('status')).toContainText('Writing…');
    await expect(canvas(page).getByText('Written about the sale ends Sunday.', { exact: true })).toBeVisible();
    await expect(page.getByText('Text written. Ctrl+Z brings back the previous one.')).toBeVisible();
    await expect(topic).toHaveValue('');
    // A title: no paragraph around it.
    expect(await mjml(page)).toMatch(/font-size="24px"[^>]*>Written about the sale ends Sunday\.<\/mj-text>/);

    const [asked] = await page.evaluate(() => window.__rewritten);
    expect(asked).toMatchObject({ action: 'custom', instruction: 'the sale ends Sunday', role: 'heading', language: 'en', text: 'Your headline', format: 'html' });
    // The rest of the email for context, without the title itself.
    expect(asked.context).toContain('Your text.');
    expect(asked.context).not.toContain('Your headline');

    await page.keyboard.press('Control+z');
    await expect(canvas(page).getByText('Your headline', { exact: true })).toBeVisible();
  });

  test('a text block keeps its merge tags: an answer without them is asked again; in French, the text is asked in French', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText(/Your text\./).click();
    await addFirstName(page);
    await page.evaluate(() => {
      window.__rewriteDelay = 50;
      window.__rewriteAnswers = ['<p>Our sale ends Sunday.</p>', '<p>Hello {{contact.firstname}}, our sale ends Sunday.</p>'];
    });
    await rewrite(page).getByRole('textbox', { name: 'Ask the AI' }).fill('the sale ends Sunday');
    await rewrite(page).getByRole('button', { name: 'Write', exact: true }).click();
    await expect(canvas(page).getByText(/our sale ends Sunday/)).toBeVisible();
    expect(await mjml(page)).toContain('Hello {{contact.firstname}}, our sale ends Sunday.');
    expect((await asked(page))[0]).toMatchObject({ action: 'custom', role: 'text' });

    await openBuilder(page, { lang: 'fr' });
    await canvas(page).getByText('Titre du message', { exact: true }).click();
    const box = rewrite(page);
    await expect(box.getByText("Écrire avec l'IA")).toBeVisible();
    await page.evaluate(() => (window.__rewriteDelay = 50));
    await box.getByRole('textbox', { name: "Demander à l'IA" }).fill('les soldes finissent dimanche');
    await box.getByRole('button', { name: 'Écrire', exact: true }).click();
    await expect(canvas(page).getByText('Written about les soldes finissent dimanche.', { exact: true })).toBeVisible();
    expect((await asked(page)).at(-1)).toMatchObject({ action: 'custom', language: 'fr' });
  });
});
