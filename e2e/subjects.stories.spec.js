import { test, expect } from '@playwright/test';

/**
 * SUGGEST SUBJECTS, driven like a user on the `Builder / Interface` story:
 * under the subject, one click gives three subject lines drawn from the
 * email; a click puts one in the field, the user's own subject stays first
 * in the list to come back to.
 *
 * No model: the story's storage runs the real suggester (checks, repair turn)
 * around a fake model that answers `window.__subjectAnswers` in turn, else
 * three fixed subjects. `window.__subjectAsks` records what was asked.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';
const IDEAS = ['Your new password is one click away', 'Locked out? Not for long', '{{contact.firstname}}, reset your password'];

async function openBuilder(page, { lang } = {}) {
  await page.goto(lang ? `${STORY}&lang=${lang}` : STORY);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

const panel = (page) => page.getByTestId('eb-properties');
const subject = (page) => panel(page).getByLabel('Subject', { exact: true });
const ideas = (page) => page.getByRole('radiogroup', { name: 'Subject ideas' });
const asks = (page) => page.evaluate(() => window.__subjectAsks || []);

test.describe('Suggest subjects', () => {
  test('three subjects drawn from the email; a click puts one in the field; Done keeps it', async ({ page }) => {
    await openBuilder(page);
    await expect(subject(page)).toHaveValue('');
    await page.evaluate(() => (window.__subjectDelay = 600));
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await expect(panel(page).getByRole('status')).toHaveText(/Reading the email…/);
    await expect(ideas(page).getByRole('radio')).toHaveText(IDEAS);
    // No subject of the user's own yet: nothing marked "yours", nothing chosen.
    await expect(ideas(page).getByText('yours')).toHaveCount(0);
    await expect(ideas(page).getByRole('radio', { checked: true })).toHaveCount(0);

    const [ask] = await asks(page);
    expect(ask.subject).toBe('');
    expect(ask.language).toBe('en');
    expect(ask.avoid).toEqual([]);
    // The words of the email, without its markup.
    expect(ask.text.length).toBeGreaterThan(40);
    expect(ask.text).not.toMatch(/<mj-|<\/?p>/);
    expect(ask.variables.map((v) => v.key)).toContain('contact.firstname');

    await ideas(page).getByRole('radio', { name: IDEAS[1] }).click();
    await expect(subject(page)).toHaveValue(IDEAS[1]);
    await expect(ideas(page).getByRole('radio', { name: IDEAS[1] })).toHaveAttribute('aria-checked', 'true');
    await ideas(page).getByRole('radio', { name: IDEAS[2] }).click();
    await expect(subject(page)).toHaveValue(IDEAS[2]);

    await panel(page).getByRole('button', { name: 'Done' }).click();
    await expect(ideas(page)).toBeHidden();
    await expect(subject(page)).toHaveValue(IDEAS[2]);
    await expect(panel(page).getByRole('button', { name: 'Suggest subjects' })).toBeVisible();
  });

  test('the user’s subject stays first; More ideas asks for new ones; it can be brought back', async ({ page }) => {
    await openBuilder(page);
    await subject(page).fill('Spring news');
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    const radios = ideas(page).getByRole('radio');
    await expect(radios).toHaveCount(4);
    await expect(radios.first()).toContainText('Spring news');
    await expect(radios.first()).toContainText('yours');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');

    await radios.nth(1).click();
    await expect(subject(page)).toHaveValue(IDEAS[0]);

    await page.evaluate(() => (window.__subjectAnswers = [['Spring is here', 'What is new this spring', 'Three things for spring']]));
    await panel(page).getByRole('button', { name: 'More ideas' }).click();
    // The idea in the field stays (checked), the new ones come after it.
    await expect(radios).toHaveText([/Spring news/, IDEAS[0], 'Spring is here', 'What is new this spring', 'Three things for spring']);
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    const second = (await asks(page))[1];
    // Still the user's own subject, and the ideas already shown are avoided.
    expect(second.subject).toBe('Spring news');
    expect(second.avoid).toEqual(IDEAS);

    // A third time: every idea shown so far is avoided, not only the last three.
    await page.evaluate(() => (window.__subjectAnswers = [['A', 'B', 'C']]));
    await panel(page).getByRole('button', { name: 'More ideas' }).click();
    await expect(radios).toHaveCount(5);
    expect((await asks(page))[2].avoid).toEqual([...IDEAS, 'Spring is here', 'What is new this spring', 'Three things for spring']);

    await radios.first().click();
    await expect(subject(page)).toHaveValue('Spring news');
  });

  test('what the user types is “yours”: typed while it runs, or an idea edited, then More ideas', async ({ page }) => {
    await openBuilder(page);
    await subject(page).fill('Spring news');
    await page.evaluate(() => (window.__subjectDelay = 800));
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await subject(page).fill('Spring news, at last');
    const radios = ideas(page).getByRole('radio');
    await expect(radios.first()).toContainText('Spring news, at last');
    await expect(radios.first()).toContainText('yours');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    await expect(radios.filter({ hasText: /^Spring news(?!,)/ })).toHaveCount(0);

    // An idea picked, then edited: the edit is "yours", and More ideas starts from it.
    await radios.nth(1).click();
    await subject(page).fill(`${IDEAS[0]}!`);
    await expect(radios.first()).toContainText(`${IDEAS[0]}!`);
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => (window.__subjectDelay = 100));
    await panel(page).getByRole('button', { name: 'More ideas' }).click();
    await expect(radios).toHaveCount(4);
    expect((await asks(page))[1].subject).toBe(`${IDEAS[0]}!`);
    await expect(radios.first()).toContainText(`${IDEAS[0]}!`);
  });

  test('the email replaced (Generate) while the list is open: the list closes, nothing of the old email comes back', async ({ page }) => {
    await openBuilder(page);
    await subject(page).fill('Spring news');
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await expect(ideas(page).getByRole('radio')).toHaveCount(4);

    await page.getByRole('button', { name: 'Generate', exact: true }).click();
    const dialog = page.getByTestId('eb-generate');
    await dialog.locator('[data-purpose="password-reset"]').click();
    await dialog.getByTestId('eb-generate-submit').click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(subject(page)).toHaveValue('Reset your password');
    await expect(ideas(page)).toBeHidden();
    await expect(panel(page).getByRole('button', { name: 'Suggest subjects' })).toBeEnabled();
  });

  test('Cancel then Suggest again at once: a late answer of the first does not end the second', async ({ page }) => {
    await openBuilder(page);
    await page.evaluate(() => {
      window.__subjectDelay = 1200;
      window.__subjectLate = true;
    });
    const suggestButton = panel(page).getByRole('button', { name: 'Suggest subjects' });
    await suggestButton.click();
    await panel(page).getByRole('status').getByRole('button', { name: 'Cancel' }).click();
    // Focus back on the button, ready for another try.
    await expect(suggestButton).toBeFocused();
    await page.waitForTimeout(400);
    await suggestButton.click();
    // The first one settles while the second still runs: still running, no list, one Cancel.
    await page.waitForTimeout(1000);
    await expect(panel(page).getByRole('status')).toBeVisible();
    await expect(suggestButton).toBeDisabled();
    await expect(ideas(page)).toBeHidden();
    await expect(ideas(page).getByRole('radio')).toHaveCount(3, { timeout: 5_000 });
    expect(await asks(page)).toHaveLength(2);
  });

  test('keyboard: the list is one Tab stop, arrows move and pick; focus follows the list and comes back', async ({ page }) => {
    await openBuilder(page);
    await subject(page).fill('Spring news');
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    const radios = ideas(page).getByRole('radio');
    // The ideas arrived: focus on the checked one ("yours").
    await expect(radios.first()).toBeFocused();
    await expect(radios.first()).toHaveAttribute('tabindex', '0');
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowDown');
    await expect(subject(page)).toHaveValue(IDEAS[0]);
    await expect(radios.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(subject(page)).toHaveValue(IDEAS[2]);
    await page.keyboard.press('ArrowDown');
    await expect(subject(page)).toHaveValue('Spring news', { timeout: 2_000 });
    await expect(radios.first()).toBeFocused();
    // One Tab leaves the group, to More ideas.
    await page.keyboard.press('Tab');
    await expect(panel(page).getByRole('button', { name: 'More ideas' })).toBeFocused();
    await panel(page).getByRole('button', { name: 'Done' }).click();
    await expect(panel(page).getByRole('button', { name: 'Suggest subjects' })).toBeFocused();
  });

  test('a block selected while it runs: the request is cancelled with the panel', async ({ page }) => {
    await openBuilder(page);
    await page.evaluate(() => (window.__subjectDelay = 3000));
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await expect(panel(page).getByRole('status')).toBeVisible();
    const aborted = page.evaluate(
      () =>
        new Promise((resolve) => {
          const started = Date.now();
          const check = () => (window.__subjectAborted ? resolve(Date.now() - started) : setTimeout(check, 50));
          check();
        })
    );
    await page.frameLocator('.eb-canvas-frame').getByText('Your headline', { exact: true }).click();
    await expect(panel(page).getByRole('button', { name: 'Suggest subjects' })).toHaveCount(0);
    expect(await aborted).toBeLessThan(2500);
  });

  test('an unknown merge tag or a repeat goes back to the model; failures say why and change nothing', async ({ page }) => {
    await openBuilder(page);
    await subject(page).fill('Spring news');
    await page.evaluate(() => {
      window.__subjectAnswers = [
        ['Spring news', '{{coupon.code}} inside', 'Fresh for spring'],
        ['Fresh for spring', 'New in the shop', 'Spring, at last'],
      ];
    });
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await expect(ideas(page).getByRole('radio')).toHaveText([/Spring news/, 'Fresh for spring', 'New in the shop', 'Spring, at last']);
    await panel(page).getByRole('button', { name: 'Done' }).click();

    await page.evaluate(() => (window.__subjectFail = 'The AI service did not answer — try again in a moment.'));
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await expect(panel(page).getByRole('alert')).toHaveText('The AI service did not answer — try again in a moment.');
    await expect(subject(page)).toHaveValue('Spring news');

    // Cancel while the model thinks: no list, the field as it was.
    await page.evaluate(() => {
      window.__subjectFail = null;
      window.__subjectDelay = 5000;
    });
    await panel(page).getByRole('button', { name: 'Suggest subjects' }).click();
    await panel(page).getByRole('status').getByRole('button', { name: 'Cancel' }).click();
    await expect(panel(page).getByRole('status')).toBeHidden();
    await expect(ideas(page)).toBeHidden();
    await expect(subject(page)).toHaveValue('Spring news');
  });

  test('in French', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await panel(page).getByRole('button', { name: 'Suggérer des objets' }).click();
    await expect(page.getByRole('radiogroup', { name: "Idées d'objet" }).getByRole('radio')).toHaveCount(3);
    expect((await asks(page))[0].language).toBe('fr');
    await expect(panel(page).getByRole('button', { name: 'Autres idées' })).toBeVisible();
    await panel(page).getByRole('button', { name: 'Terminé' }).click();
  });
});
