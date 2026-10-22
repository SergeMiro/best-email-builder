import { test, expect } from '@playwright/test';

/**
 * The TEXT RIBBON above the canvas and the EMOJI PANEL it opens, driven like
 * a user on the `Builder / Interface` story: the words of a text (bold,
 * italic, underline, strikethrough, link), the element (size, line height,
 * weight, alignment), a tooltip on every tool, the emojis inserted as the
 * variables are.
 *
 * `window.__emailEditor` is only used to READ the produced MJML, never to act.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';

async function openBuilder(page, { lang } = {}) {
  await page.goto(`${STORY}${lang ? `&lang=${lang}` : ''}`);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

const mjml = (page) => page.evaluate(() => window.__emailEditor.exportMjml());
const ribbon = (page) => page.getByTestId('eb-ribbon');
const tool = (page, command) => ribbon(page).locator(`[data-command="${command}"]`);
const control = (page, name) => ribbon(page).locator(`[data-control="${name}"]`);
const panel = (page) => page.getByTestId('eb-properties');
const canvas = (page) => page.frameLocator('.eb-canvas-frame');
const notice = (page, text) => page.getByTestId('email-builder').getByText(text);

/** The `<mj-text>` holding a text, as MJML. */
async function textOf(page, words) {
  const source = await mjml(page);
  return source.match(new RegExp(`<mj-text[^>]*>(?:(?!</mj-text>)[\\s\\S])*${words}(?:(?!</mj-text>)[\\s\\S])*</mj-text>`))?.[0] || '';
}

test.describe('Text ribbon', () => {
  test('open by default, every tool named in a tooltip; nothing selected, nothing to format', async ({ page }) => {
    await openBuilder(page);
    await expect(ribbon(page)).toBeVisible();
    await expect(ribbon(page)).toHaveAttribute('role', 'toolbar');
    for (const command of ['bold', 'italic', 'underline', 'strike', 'link', 'unlink', 'clear']) await expect(tool(page, command)).toBeDisabled();
    await expect(control(page, 'font-size')).toBeDisabled();
    await expect(ribbon(page).getByRole('radio', { name: 'Align center' })).toBeDisabled();

    // A disabled tool still names itself.
    await tool(page, 'bold').hover({ force: true });
    await expect(page.getByRole('tooltip')).toHaveText('Bold (Ctrl+B)');
    await page.mouse.move(10, 10);

    await canvas(page).getByText('Your text.').click();
    const tips = [
      [tool(page, 'italic'), 'Italic (Ctrl+I)'],
      [tool(page, 'underline'), 'Underline (Ctrl+U)'],
      [tool(page, 'strike'), 'Strikethrough'],
      [tool(page, 'link'), 'Link'],
      [tool(page, 'clear'), 'Clear formatting'],
      [control(page, 'font-size'), 'Font size'],
      [control(page, 'line-height'), 'Line height'],
      [control(page, 'font-weight'), 'Weight'],
      [ribbon(page).getByRole('radio', { name: 'Justify' }), 'Justify'],
      [ribbon(page).locator('[data-drawer="emoji"]'), 'Insert an emoji'],
      [ribbon(page).locator('[data-drawer="variables"]'), 'Email provider variables'],
    ];
    for (const [target, label] of tips) {
      await target.hover();
      // The tooltip left behind fades out: the new one, by its name.
      await expect(page.getByRole('tooltip', { name: label, exact: true })).toBeVisible();
    }
  });

  test('a selected text: bold and italic on all of it, shown pressed; undone', async ({ page }) => {
    await openBuilder(page);
    const before = await textOf(page, 'Hello,');
    await canvas(page).getByText('Your text.').click();
    await expect(tool(page, 'bold')).toBeEnabled();
    await expect(tool(page, 'bold')).toHaveAttribute('aria-pressed', 'false');

    await tool(page, 'bold').click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/><(b|strong)>Hello,[\s\S]*Your text\.<\/(b|strong)><\/mj-text>$/);
    await expect(tool(page, 'bold')).toHaveAttribute('aria-pressed', 'true');
    await tool(page, 'italic').click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/<(i|em)>/);
    await expect(tool(page, 'italic')).toHaveAttribute('aria-pressed', 'true');
    // Still only selected, not edited: no bar over it, and what comes next goes at its end.
    await expect(canvas(page).locator('[contenteditable="true"]')).toHaveCount(0);
    await ribbon(page).locator('[data-drawer="variables"]').click();
    await page.getByTestId('eb-panel-variables').getByRole('button', { name: 'First name', exact: true }).click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/Your text\.<\/(i|em)><\/(b|strong)> \{\{contact\.firstname\}\}<\/mj-text>$/);
    await page.mouse.move(10, 10);

    // Clear formatting takes both off.
    await tool(page, 'clear').click();
    await expect.poll(() => textOf(page, 'Hello,')).not.toMatch(/<(b|strong|i|em)>/);
    await expect(tool(page, 'bold')).toHaveAttribute('aria-pressed', 'false');

    // Undone like any edit.
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    for (let step = 0; step < 6 && (await undo.isEnabled()); step++) await undo.click();
    await expect.poll(() => textOf(page, 'Hello,')).toBe(before);
    await expect(page.getByTestId('email-builder').getByText('No changes')).toBeVisible();
  });

  test('a text being edited: only the selected words, and the buttons follow the caret', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your text.').dblclick();
    // The last word: "Your text." is the last line, under "Hello,".
    await page.keyboard.press('Control+End');
    // "text." in two steps: Chrome takes the full stop for a word.
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await tool(page, 'underline').click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/Your <u>text\.<\/u>/);
    await tool(page, 'strike').click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/<(strike|s)>/);

    // The caret inside the words: pressed; at the start of the text: not.
    await page.keyboard.press('Control+End');
    await page.keyboard.press('ArrowLeft');
    await expect(tool(page, 'underline')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Home');
    await expect(tool(page, 'underline')).toHaveAttribute('aria-pressed', 'false');
    await expect(tool(page, 'strike')).toHaveAttribute('aria-pressed', 'false');
  });

  test('link: typed under its button, on the selected words; removed by the next button', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your text.').dblclick();
    // The last word: "Your text." is the last line, under "Hello,".
    await page.keyboard.press('Control+End');
    // "text." in two steps: Chrome takes the full stop for a word.
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await page.keyboard.press('Shift+Control+ArrowLeft');
    await tool(page, 'link').click();
    const url = page.getByRole('textbox', { name: 'Link URL' });
    await expect(url).toBeFocused();
    await expect(page.getByRole('button', { name: 'Apply the link' })).toBeDisabled();
    await url.fill('https://example.com/sale');
    await url.press('Enter');
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/Your <a href="https:\/\/example\.com\/sale"[^>]*>text\.<\/a>/);
    await expect(tool(page, 'link')).toHaveAttribute('aria-pressed', 'true');

    // Opened again on the link: its address, to change.
    await tool(page, 'link').click();
    await expect(url).toHaveValue('https://example.com/sale');
    await tool(page, 'link').click();
    await expect(url).toHaveCount(0);
    await expect(tool(page, 'unlink')).toBeEnabled();
    await tool(page, 'unlink').click();
    await expect.poll(() => textOf(page, 'Hello,')).not.toContain('<a ');
    await expect(tool(page, 'unlink')).toBeDisabled();
  });

  test('size, line height, weight and alignment of the selected text, as its properties', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your text.').click();
    await expect(control(page, 'font-size')).toHaveValue('15');

    // Typed, within the block's bounds.
    await control(page, 'font-size').fill('18');
    await control(page, 'font-size').press('Enter');
    await expect.poll(() => textOf(page, 'Hello,')).toContain('font-size="18px"');
    await expect(panel(page).getByLabel('Size', { exact: true })).toHaveValue('18');
    await control(page, 'font-size').fill('99');
    await control(page, 'font-size').press('Enter');
    await expect.poll(() => textOf(page, 'Hello,')).toContain('font-size="48px"');
    await expect(control(page, 'font-size')).toHaveValue('48');
    // Or picked.
    await ribbon(page).getByRole('button', { name: 'Font sizes' }).click();
    await page.getByRole('menuitem', { name: '20', exact: true }).click();
    await expect.poll(() => textOf(page, 'Hello,')).toContain('font-size="20px"');

    // Line height: ratios of the size, the current one checked.
    await control(page, 'line-height').click();
    const ratios = page.getByRole('menu', { name: 'Line height' }).getByRole('menuitem');
    await expect(ratios).toHaveText([/^1\s*20 px$/, /^1\.15\s*23 px$/, /^1\.3\s*26 px$/, /^1\.5\s*30 px$/, /^2\s*40 px$/, /^2\.5\s*50 px$/]);
    await ratios.filter({ hasText: '1.5' }).click();
    await expect.poll(() => textOf(page, 'Hello,')).toContain('line-height="30px"');

    await control(page, 'font-weight').click();
    await page.getByRole('menuitem', { name: 'Bold' }).click();
    await expect.poll(() => textOf(page, 'Hello,')).toContain('font-weight="bold"');
    await expect(control(page, 'font-weight')).toHaveText('Bold');

    const center = ribbon(page).getByRole('radio', { name: 'Align center' });
    await center.click();
    await expect.poll(() => textOf(page, 'Hello,')).toContain('align="center"');
    await expect(center).toHaveAttribute('aria-checked', 'true');
    await expect(ribbon(page).getByRole('radio', { name: 'Align left' })).toHaveAttribute('aria-checked', 'false');

    // A button: no word to format, its own bounds, no justify.
    await canvas(page).getByText('Learn more').click();
    await expect(panel(page).getByRole('heading', { name: 'Button' })).toBeVisible();
    await expect(tool(page, 'bold')).toBeDisabled();
    await expect(ribbon(page).getByRole('radio', { name: 'Justify' })).toBeDisabled();
    await control(page, 'font-size').fill('40');
    await control(page, 'font-size').press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*font-size="28px"/);
  });
});

test.describe('Emoji panel', () => {
  const emojis = (page) => page.getByTestId('eb-panel-emoji');
  const grinningFace = (page) => emojis(page).getByRole('region', { name: 'Smileys & emotion' }).getByRole('button', { name: 'grinning face', exact: true });

  async function openEmojis(page) {
    await ribbon(page).locator('[data-drawer="emoji"]').click();
    await expect(emojis(page).getByRole('heading', { name: 'Emojis' })).toBeVisible();
    await expect(grinningFace(page)).toBeVisible();
    // Done sliding open: an emoji reached while it slides would move from under the pointer.
    await expect.poll(() => emojis(page).evaluate((aside) => aside.parentElement.offsetWidth)).toBe(256);
  }

  test('beside the canvas: under the pointer an emoji shows in the text, a click inserts it, first in the recent ones next time', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    await openEmojis(page);
    const grinning = grinningFace(page);

    // Nothing selected: nothing typed, a click says what to do.
    await grinning.click();
    await expect(notice(page, 'Select a text or a button first.')).toBeVisible();
    expect(await mjml(page)).toBe(before);

    await canvas(page).getByText('Your text.').click();
    await grinning.hover();
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveText('😀');
    expect(await mjml(page)).toBe(before);
    await page.mouse.move(10, 10);
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveCount(0);

    await grinning.hover();
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveText('😀');
    await grinning.click();
    await expect.poll(() => textOf(page, 'Hello,')).toMatch(/Your text\. 😀<\/mj-text>$/);
    // Still under the pointer: not shown again (a while later either), and the grid has not moved.
    await page.waitForTimeout(500);
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveCount(0);
    const recent = emojis(page).getByRole('region', { name: 'Recently used' });
    await expect(recent).toHaveCount(0);
    // First among the recent ones from the next time.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('best-email-builder:recent-emojis')))).toEqual(['😀']);
    await emojis(page).getByRole('button', { name: 'Close the panel' }).click();
    await expect(emojis(page)).toHaveCount(0);
    await openEmojis(page);
    await expect(recent.locator('[data-emoji]').first()).toHaveAttribute('data-emoji', '😀');
  });

  test('search by name or keyword; the group buttons jump to their emojis', async ({ page }) => {
    await openBuilder(page);
    await openEmojis(page);
    const search = emojis(page).getByRole('searchbox', { name: 'Search emojis' }).or(emojis(page).getByRole('textbox', { name: 'Search emojis' }));
    await search.fill('red heart');
    const results = emojis(page).getByRole('region', { name: 'Search results' });
    await expect(results.locator('[data-emoji="❤️"]')).toBeVisible();
    await search.fill('love');
    await expect(results.locator('[data-emoji="❤️"]')).toBeVisible();
    await search.fill('zzqqxx');
    await expect(emojis(page).getByText('No emoji found.')).toBeVisible();
    await search.fill('');

    const flags = emojis(page).getByRole('group', { name: 'Emoji groups' }).getByRole('button', { name: 'Flags' });
    await flags.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Flags');
    await flags.click();
    await expect(emojis(page).getByRole('region', { name: 'Flags' }).getByRole('heading', { name: 'Flags' })).toBeInViewport();
  });

  test('in French: French names, found without accents', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await ribbon(page).locator('[data-drawer="emoji"]').click();
    const box = page.getByTestId('eb-panel-emoji');
    await expect(box.getByRole('heading', { name: 'Émojis' })).toBeVisible();
    await expect(box.getByRole('button', { name: 'visage rieur', exact: true })).toBeVisible();
    await box.getByLabel('Rechercher un émoji').fill('coeur rouge');
    await expect(box.locator('[data-emoji="❤️"]')).toBeVisible();
  });

  test('one panel at a time: the variables take its place, its button shuts it', async ({ page }) => {
    await openBuilder(page);
    await openEmojis(page);
    const emojiButton = ribbon(page).locator('[data-drawer="emoji"]');
    const variablesButton = ribbon(page).locator('[data-drawer="variables"]');
    await expect(emojiButton).toHaveAttribute('aria-pressed', 'true');
    await variablesButton.click();
    await expect(page.getByTestId('eb-panel-variables')).toBeVisible();
    await expect(emojis(page)).toHaveCount(0);
    await expect(emojiButton).toHaveAttribute('aria-pressed', 'false');
    await variablesButton.click();
    await expect(page.getByTestId('eb-panel-variables')).toHaveCount(0);
  });
});
