import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/best-email-builder/?lang=en#/editor/new');
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

test('emoji buttons mount near the viewport, including after a group jump and search', async ({ page }) => {
  await open(page);
  await page.locator('[data-block-id="text"]').click();
  await page.getByTestId('eb-ribbon').locator('[data-drawer="emoji"]').click();
  const panel = page.getByTestId('eb-panel-emoji');
  await expect(panel.locator('[data-emoji="😀"]')).toBeVisible();
  expect(await panel.locator('[data-emoji]').count()).toBeLessThan(400);
  await expect(panel.locator('[data-group="flags"] [data-emoji]')).toHaveCount(0);
  await panel.getByRole('group', { name: 'Emoji groups' }).getByRole('button', { name: 'Flags', exact: true }).click();
  await expect(panel.locator('[data-group="flags"] [data-emoji]').first()).toBeVisible();
  await expect.poll(() => panel.locator('[data-group="smileys"] [data-emoji]').count()).toBe(0);
  expect(await panel.locator('[data-emoji]').count()).toBeLessThan(400);
  await panel.getByLabel('Search emojis', { exact: true }).fill('red heart');
  await expect(panel.locator('[data-emoji="❤️"]')).toBeVisible();
});

test('create empty variable groups, assign and move a variable, and retain groups after reload', async ({ page }) => {
  await open(page);
  const ribbon = page.getByTestId('eb-ribbon');
  const panel = page.getByTestId('eb-panel-variables');
  await ribbon.locator('[data-drawer="variables"]').click();
  for (const name of ['Platforme', 'Brevo', 'SFR']) {
    if (await panel.getByRole('group', { name, exact: true }).count()) continue;
    await panel.getByRole('button', { name: 'New group', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'New group', exact: true });
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel.getByRole('group', { name, exact: true })).toBeVisible();
  }
  await panel.getByRole('button', { name: 'New group', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(' brevo ');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await panel.getByRole('button', { name: 'New variable in Brevo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New variable', exact: true });
  await expect(dialog.getByLabel('Group', { exact: true })).toHaveValue('Brevo');
  await dialog.getByLabel('Name', { exact: true }).fill('Account code');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'Brevo', exact: true }).getByRole('button', { name: 'Account code', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Edit “Account code”', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'SFR', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByRole('group', { name: 'SFR', exact: true }).getByRole('button', { name: 'Account code', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await ribbon.locator('[data-drawer="variables"]').click();
  for (const name of ['Platforme', 'Brevo', 'SFR']) await expect(panel.getByRole('group', { name, exact: true })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'SFR', exact: true }).getByRole('button', { name: 'Account code', exact: true })).toBeVisible();
});

test('drag a variable onto another group: it moves there and stays; Esc cancels; a click still inserts', async ({ page }) => {
  await open(page);
  const panel = page.getByTestId('eb-panel-variables');
  await page.getByTestId('eb-ribbon').locator('[data-drawer="variables"]').click();
  await panel.getByRole('button', { name: 'New group', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Tester');
  await page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true }).click();
  const brevo = panel.getByRole('group', { name: 'Brevo', exact: true });
  const tester = panel.getByRole('group', { name: 'Tester', exact: true });
  const links = panel.getByRole('group', { name: 'Links', exact: true });
  await expect(tester).toBeVisible();

  /** Presses a badge and carries it over a group, in steps (the press becomes a drag past a few pixels). */
  const carry = async (badge, group) => {
    const from = await badge.boundingBox();
    const to = await group.getByRole('heading').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 10, to.y + to.height / 2, { steps: 8 });
  };

  // Esc: it stays where it was.
  await carry(brevo.getByRole('button', { name: 'Last name', exact: true }), tester);
  await expect(tester).toHaveClass(/outline-primary/);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(tester).not.toHaveClass(/outline-dashed/);
  await expect(brevo.getByRole('button', { name: 'Last name', exact: true })).toBeVisible();

  // Dropped on the empty group: it moves there, and the click that ends the drag inserts nothing.
  await carry(brevo.getByRole('button', { name: 'First name', exact: true }), tester);
  await expect(links).toHaveClass(/outline-dashed/);
  await expect(brevo).not.toHaveClass(/outline-dashed/);
  await page.mouse.up();
  await expect(tester.getByRole('button', { name: 'First name', exact: true })).toBeVisible();
  await expect(brevo.getByRole('button', { name: 'First name', exact: true })).toHaveCount(0);
  // Nothing is selected: a click would have said so.
  const hint = page.getByText('Select a text or a button first.');
  await expect(hint).toHaveCount(0);
  await tester.getByRole('button', { name: 'First name', exact: true }).click();
  await expect(hint).toBeVisible();

  // The unsubscribe link too.
  await carry(links.getByRole('button', { name: 'Unsubscribe link', exact: true }), brevo);
  await page.mouse.up();
  await expect(brevo.getByRole('button', { name: 'Unsubscribe link', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await page.getByTestId('eb-ribbon').locator('[data-drawer="variables"]').click();
  await expect(tester.getByRole('button', { name: 'First name', exact: true })).toBeVisible();
  await expect(brevo.getByRole('button', { name: 'Unsubscribe link', exact: true })).toBeVisible();
});

test('all blocks have the three spacing layers and an empty center; radius has px and % without an upper limit', async ({ page }) => {
  await open(page);
  const canvas = page.frameLocator('.eb-canvas-frame');
  const panel = page.getByTestId('eb-properties');
  const box = panel.getByTestId('eb-box-model');
  for (const id of ['text', 'image', 'button', 'divider', 'spacer', 'social', 'navbar', 'columns-2', 'hero']) {
    await page.locator(`[data-block-id="${id}"]`).click();
    expect(await box.locator('[data-box]').evaluateAll((els) => els.map((el) => el.dataset.box))).toEqual(['margin', 'border', 'padding', 'content']);
    await expect(box.locator('[data-box="content"]')).toHaveText('');
    await expect(panel.getByLabel('Vertical alignment', { exact: true })).toBeVisible();
  }
  const radius = panel.getByLabel('Corner radius', { exact: true });
  await expect(radius).not.toHaveAttribute('max');
  await radius.fill('120'); await radius.press('Enter');
  await expect(radius).toHaveValue('120');
  const section = canvas.locator('.eb-tag-mj-section').filter({ hasText: 'Your big announcement' }).first();
  await expect(section).toHaveCSS('border-top-left-radius', '120px');
  // The unit: the builder's own list, as the font's; no browser arrows on the number.
  await expect(radius).toHaveCSS('appearance', 'textfield');
  const unit = panel.getByRole('combobox', { name: 'Corner radius — Unit', exact: true });
  await expect(unit).toHaveText('px');
  await unit.click();
  await expect(page.getByRole('listbox')).toHaveCSS('border-top-left-radius', '10px');
  await page.getByRole('option', { name: '%', exact: true }).click();
  await expect(unit).toHaveText('%');
  await expect(section).toHaveCSS('border-top-left-radius', '120%');
  await radius.fill('65'); await radius.press('Enter');
  await expect(section).toHaveCSS('border-top-left-radius', '65%');
  await expect(radius).toHaveCSS('border-top-left-radius', '10px');
  await expect(panel.getByLabel('Vertical alignment', { exact: true })).toHaveCSS('border-top-left-radius', '10px');
});

test('text margin, border and padding render independently in canvas and preview, and text stays editable', async ({ page }) => {
  await open(page);
  const canvas = page.frameLocator('.eb-canvas-frame');
  await page.locator('[data-block-id="text"]').click();
  await canvas.getByText('Your text.', { exact: true }).click();
  const box = page.getByTestId('eb-box-model');
  for (const [label, value] of [['Margin — Top', '24'], ['Padding — Top', '30'], ['Border — Top', '3']]) {
    await box.getByLabel(label, { exact: true }).fill(value);
    await box.getByLabel(label, { exact: true }).press('Enter');
  }
  const text = canvas.getByText('Your text.', { exact: true });
  await expect(text.locator('..')).toHaveCSS('padding-top', '30px');
  await expect(text.locator('..')).toHaveCSS('border-top-width', '3px');
  await expect(text.locator('xpath=ancestor::td[2]')).toHaveCSS('padding-top', '24px');
  await text.dblclick();
  await expect(text).toHaveAttribute('contenteditable', 'true');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.getByRole('dialog').frameLocator('iframe[title="Email preview"]').getByText('Your text.', { exact: true });
  await expect(preview.locator('..')).toHaveCSS('padding-top', '30px', { timeout: 30_000 });
  await expect(preview.locator('..')).toHaveCSS('border-top-width', '3px');
  await expect(preview.locator('xpath=ancestor::td[2]')).toHaveCSS('padding-top', '24px');
});

test('columns keep equal heights automatically when neighboring content grows', async ({ page }) => {
  await open(page);
  await page.locator('[data-block-id="image-text"]').click();
  const panel = page.getByTestId('eb-properties');
  await panel.getByLabel('Vertical alignment', { exact: true }).click();
  await page.getByRole('option', { name: 'Top', exact: true }).click();
  const section = page.frameLocator('.eb-canvas-frame').locator('.eb-tag-mj-section').filter({ hasText: 'A few words about it.' });
  const boxes = () => section.locator('.eb-tag-mj-column').evaluateAll((els) => els.map((el) => {
    const box = el.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, height: box.height };
  }));
  await expect.poll(async () => (await boxes()).length).toBe(2);
  let columns = await boxes();
  expect(columns[0]).toEqual(columns[1]);
  const initialHeight = columns[0].height;
  await section.getByText('A few words about it.', { exact: true }).click();
  const padding = panel.getByLabel('Padding — Top', { exact: true });
  await padding.fill('140'); await padding.press('Enter');
  await expect.poll(async () => (await boxes())[0].height).toBeGreaterThan(initialHeight);
  columns = await boxes();
  expect(columns[0]).toEqual(columns[1]);
});
