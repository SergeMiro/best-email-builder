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
    await expect(radios).toHaveText([/Spring news/, 'Spring is here', 'What is new this spring', 'Three things for spring']);
    const second = (await asks(page))[1];
    // Still the user's own subject, and the ideas already shown are avoided.
    expect(second.subject).toBe('Spring news');
    expect(second.avoid).toEqual(IDEAS);

    await radios.first().click();
    await expect(subject(page)).toHaveValue('Spring news');
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
