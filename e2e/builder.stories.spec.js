import { test, expect } from '@playwright/test';

/**
 * The builder INTERFACE, driven like a user (mouse, keyboard) on the
 * `Builder / Interface` story: blocks sidebar, properties panel, device,
 * undo, protected exit, saving, versions, variables, images, preview, test.
 *
 * `window.__emailEditor` is only used to READ the produced MJML, never to act.
 * The story has no server: memory storage, fake render and test transport.
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
const canvas = (page) => page.frameLocator('.eb-canvas-frame');
const notice = (page, text) => page.getByTestId('email-builder').getByText(text);

/** Ids of the email's elements of a tag, in email order (from the engine's tree). */
const idsOf = (page, tag) =>
  page.evaluate((wanted) => {
    const out = [];
    const walk = (node) => {
      if (node.tag === wanted) out.push(node.id);
      node.children.forEach(walk);
    };
    walk(window.__emailAdapter.root);
    return out;
  }, tag);

/** Texts of the `mj-text` elements, in email order. */
const texts = (page) =>
  page.evaluate(() => {
    const out = [];
    const walk = (node) => {
      if (node.tag === 'mj-text') out.push(node.content.replace(/<[^>]+>/g, '').trim());
      node.children.forEach(walk);
    };
    walk(window.__emailAdapter.root);
    return out;
  });

test.describe('Interface', () => {
  test('starter template: sender, headline, text, button, footer with unsubscribe', async ({ page }) => {
    await openBuilder(page);
    await expect(page.getByText('No changes')).toBeVisible();
    const source = await mjml(page);
    for (const fragment of ['Example Inc.', 'Your headline', '{{contact.firstname}}', '<mj-button', 'href="{{ unsubscribe }}"', '1 Main Street']) {
      expect(source).toContain(fragment);
    }
    await expect(panel(page).getByRole('heading', { name: 'Email' })).toBeVisible();
  });

  test('clicking a block adds it, selects it and opens its properties', async ({ page }) => {
    await openBuilder(page);
    const before = (await mjml(page)).match(/<mj-divider/g)?.length || 0;
    await page.locator('[data-block-id="divider"]').click();
    await expect(panel(page).getByRole('heading', { name: 'Divider' })).toBeVisible();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    expect((await mjml(page)).match(/<mj-divider/g)?.length).toBe(before + 1);
  });

  test('every field type of the panel writes into the email', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="button"]').click();
    const props = panel(page);
    await expect(props.getByRole('heading', { name: 'Button' })).toBeVisible();

    await props.getByLabel('Label', { exact: true }).fill('Book a meeting');
    await props.getByLabel('Label', { exact: true }).press('Enter');
    // A refused URL is not passed on.
    await props.getByLabel('Link URL').fill('javascript:alert(1)');
    await props.getByLabel('Link URL').press('Enter');
    await expect(props.getByText('Address not allowed')).toBeVisible();
    await props.getByLabel('Link URL').fill('https://example.com/meeting/');
    await props.getByLabel('Link URL').press('Enter');
    await props.getByLabel('Size', { exact: true }).fill('18');
    await props.getByLabel('Size', { exact: true }).press('Enter');
    await props.locator('#eb-prop-background-color').fill('#c2603e');
    await props.getByLabel('Weight').click();
    await page.getByRole('option', { name: 'Normal', exact: true }).click();
    await props.getByRole('radio', { name: 'Right' }).click();
    await props.getByLabel('Padding — Top', { exact: true }).fill('30');
    await props.getByLabel('Padding — Top', { exact: true }).press('Enter');

    await expect.poll(() => mjml(page), { timeout: 5_000 }).toContain('background-color="#c2603e"');
    const source = await mjml(page);
    expect(source).toContain('>Book a meeting</mj-button>');
    expect(source).toContain('href="https://example.com/meeting/"');
    expect(source).not.toContain('javascript:');
    expect(source).toContain('font-size="18px"');
    expect(source).toContain('font-weight="normal"');
    expect(source).toMatch(/<mj-button[^>]*align="right"/);
    expect(source).toMatch(/<mj-button[^>]*padding-top="30px"/);
  });

  test('undo and redo from the toolbar', async ({ page }) => {
    await openBuilder(page);
    const undo = page.getByRole('button', { name: 'Undo' });
    await expect(undo).toBeDisabled();
    await page.locator('[data-block-id="spacer"]').click();
    const withSpacer = await mjml(page);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect.poll(() => mjml(page)).not.toBe(withSpacer);
    await expect(page.getByText('No changes')).toBeVisible();
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect.poll(() => mjml(page)).toBe(withSpacer);
  });

  test('desktop / mobile: the canvas takes the device width', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('tab', { name: 'Mobile' }).click();
    await expect.poll(async () => Math.round((await page.locator('.eb-canvas-frame').boundingBox()).width)).toBe(375);
    await page.getByRole('tab', { name: 'Desktop' }).click();
    await expect.poll(async () => Math.round((await page.locator('.eb-canvas-frame').boundingBox()).width)).toBeGreaterThan(600);
  });

  test('nothing selected: template and page settings', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="text"]').click();
    await panel(page).getByRole('button', { name: 'Deselect' }).click();
    const props = panel(page);
    await expect(props.getByRole('heading', { name: 'Email' })).toBeVisible();
    await props.getByLabel(/^Name/).fill('Newsletter');
    await expect(page.getByText('Newsletter').first()).toBeVisible();
    await props.locator('#eb-page-background-color').fill('#ffffff');
    await expect.poll(() => mjml(page)).toMatch(/<mj-body[^>]*background-color="#ffffff"/);
  });

  test('selecting in the canvas → properties of the element', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    await expect(panel(page).getByRole('heading', { name: 'Text' })).toBeVisible();
    await expect(panel(page).getByLabel('Size', { exact: true })).toHaveValue('24');
  });

  test('leaving with changes asks first; nothing is lost without consent', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="text"]').click();
    await page.getByRole('button', { name: 'Back' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Leave the builder?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('bench')).toHaveAttribute('data-closed', '0');
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByTestId('bench')).toHaveAttribute('data-closed', '1');
  });

  test('French interface', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await expect(page.getByText('Aucune modification')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
    expect(await mjml(page)).toContain('Titre du message');
    await page.locator('[data-block-id="divider"]').click();
    await expect(panel(page).getByRole('heading', { name: 'Séparateur' })).toBeVisible();
  });
});

/**
 * Drags with the real mouse: press, travel in steps (the builder's drag is
 * made of pointer events, and the pointer stays captured over the canvas
 * frame), release.
 * @param {import('@playwright/test').Page} page
 * @param {{x: number, y: number, width: number, height: number}} from
 * @param {{x: number, y: number}} to  page coordinates
 */
async function drag(page, from, to) {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
}

/** Drags a block from the sidebar onto the lower edge of a text of the canvas (= after it). */
async function dragBlock(page, blockId, textIndex) {
  const tile = await page.locator(`[data-block-id="${blockId}"]`).boundingBox();
  const target = await canvas(page).locator('.eb-tag-mj-text').nth(textIndex).boundingBox();
  await drag(page, tile, { x: target.x + target.width / 2, y: target.y + target.height - 3 });
}

test.describe('Element actions', () => {
  test('drag a block from the sidebar into the canvas', async ({ page }) => {
    await openBuilder(page);
    const before = (await mjml(page)).match(/<mj-divider/g)?.length || 0;
    // On the "Hello… Your text." text, lower half: after it.
    await dragBlock(page, 'divider', 2);
    await expect.poll(async () => (await mjml(page)).match(/<mj-divider/g)?.length || 0).toBe(before + 1);
    expect(await mjml(page)).toMatch(/Your text\.<\/mj-text>\s*<mj-divider/);
    // Dropped INSIDE the column of the target text, not in a new section.
    expect(await idsOf(page, 'mj-section')).toHaveLength(3);
    await expect(panel(page).getByRole('heading', { name: 'Divider' })).toBeVisible();
  });

  test('drag an element of the canvas to move it', async ({ page }) => {
    await openBuilder(page);
    expect((await texts(page)).slice(1, 3)).toEqual(['Your headline', 'Hello {{contact.firstname}},Your text.']);
    await canvas(page).getByText('Your headline').click();
    // The ✥ handle of the selection's toolbar.
    const handle = await canvas(page).locator('button[data-action="move"]').boundingBox();
    const box = await canvas(page).getByText('Learn more').boundingBox();
    await drag(page, handle, { x: box.x + box.width / 2, y: box.y + box.height - 2 });
    await expect.poll(async () => (await texts(page)).indexOf('Your headline')).toBe(2);
  });

  test('duplicate, move, delete from the panel', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    const props = panel(page);
    await expect(props.getByRole('button', { name: 'Move up' })).toBeDisabled();

    await props.getByRole('button', { name: 'Duplicate' }).click();
    await expect.poll(async () => (await texts(page)).slice(1, 4)).toEqual([
      'Your headline',
      'Your headline',
      'Hello {{contact.firstname}},Your text.',
    ]);
    // The copy is selected (second headline): move it down, then up.
    await props.getByRole('button', { name: 'Move down' }).click();
    await expect.poll(async () => (await texts(page))[3]).toBe('Your headline');
    await props.getByRole('button', { name: 'Move up' }).click();
    await expect.poll(async () => (await texts(page))[2]).toBe('Your headline');

    await props.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(async () => (await texts(page)).filter((t) => t === 'Your headline').length).toBe(1);
    await expect(props.getByRole('heading', { name: 'Email' })).toBeVisible();
  });

  test('columns: sideways move', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="columns-2"]').click();
    const before = await idsOf(page, 'mj-column');
    // An empty column says "Drop a block here"; clicking it selects the column.
    await canvas(page).getByText('Drop a block here').first().click();
    const props = panel(page);
    await expect(props.getByRole('heading', { name: 'Column' })).toBeVisible();
    await expect(props.getByRole('button', { name: 'Move left' })).toBeDisabled();
    await props.getByRole('button', { name: 'Move right' }).click();
    const [first, second] = before.slice(-2);
    await expect.poll(async () => (await idsOf(page, 'mj-column')).slice(-2)).toEqual([second, first]);
  });

  test('keyboard: Delete, Ctrl+Z, Ctrl+Y', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Learn more').click();
    const before = await mjml(page);
    await page.keyboard.press('Delete');
    await expect.poll(() => mjml(page)).not.toContain('<mj-button');
    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toBe(before);
    await page.keyboard.press('Control+y');
    await expect.poll(() => mjml(page)).not.toContain('<mj-button');
    // One undo per key press: no double handling by interface and engine.
    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toBe(before);
    expect(await page.evaluate(() => window.__emailEditor.canUndo())).toBe(false);
  });

  test('letters typed outside a field do not move the selection', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    const id = await page.evaluate(() => window.__emailEditor.getSelection().id);
    for (const key of ['s', 'w', 'a', 'd']) await page.keyboard.press(key);
    expect(await page.evaluate(() => window.__emailEditor.getSelection()?.id)).toBe(id);
  });
});

const builderOf = (page) => page.getByTestId('email-builder');
const stored = (page) => page.evaluate(() => window.__emailStorage.dump());
const SAVED_AT = /^Saved at \d{1,2}:\d{2}( [AP]M)?$/;

async function saveNew(page, name) {
  const deselect = panel(page).getByRole('button', { name: 'Deselect' });
  if (await deselect.count()) await deselect.click();
  await panel(page).getByLabel(/^Name/).fill(name);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText(SAVED_AT)).toBeVisible();
  return Number(await builderOf(page).getAttribute('data-template-id'));
}

test.describe('Save, reload, versions', () => {
  test('saving requires a name, then creates the template and its version 1', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(notice(page, 'Give the template a name before saving it.')).toBeVisible();
    await expect(panel(page).getByText('Name is required')).toBeVisible();
    expect((await stored(page)).rows).toHaveLength(0);

    const id = await saveNew(page, 'October letter');
    const dump = await stored(page);
    expect(dump.rows).toHaveLength(1);
    expect(dump.rows[0]).toMatchObject({ id, name: 'October letter' });
    expect(dump.versions[String(id)]).toHaveLength(1);
    expect(dump.rows[0].mjml).toBe(await mjml(page));
  });

  test('Ctrl+S creates a version; reopening gives exactly the same email', async ({ page }) => {
    await openBuilder(page);
    const id = await saveNew(page, 'Versioned');
    await page.locator('[data-block-id="divider"]').click();
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(notice(page, 'Saved — version 2.')).toBeVisible();
    const saved = await mjml(page);

    await page.evaluate((templateId) => window.__reopenBuilder(templateId), id);
    await expect(builderOf(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    await expect(builderOf(page)).toHaveAttribute('data-template-id', String(id));
    expect(await mjml(page)).toBe(saved);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await expect(panel(page).getByLabel(/^Name/)).toHaveValue('Versioned');
  });

  test('a template saved by the earlier engine (GrapesJS) opens from its MJML, and is saved in the new format', async ({ page }) => {
    await openBuilder(page);
    const legacyMjml =
      '<mjml><mj-body background-color="#eceff4"><mj-section background-color="#ffffff"><mj-column>' +
      '<mj-text font-size="15px">Saved before the switch</mj-text>' +
      '<mj-button href="https://example.com/old">Old button</mj-button>' +
      '</mj-column></mj-section></mj-body></mjml>';
    const id = await page.evaluate(async (mjmlSource) => {
      const { template } = await window.__emailStorage.create({
        name: 'Legacy',
        document: {
          schemaVersion: 1,
          engine: 'grapesjs-mjml',
          engineVersion: '0.23.6',
          builderVersion: '0.3.0',
          project: { pages: [{ frames: [{ component: { type: 'wrapper', components: [] } }] }] },
        },
        mjml: mjmlSource,
      });
      return template.id;
    }, legacyMjml);
    await page.evaluate((templateId) => window.__reopenBuilder(templateId), id);
    await expect(builderOf(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    await expect(canvas(page).getByText('Saved before the switch')).toBeVisible();
    await expect(canvas(page).getByText('Old button')).toBeVisible();
    // Opening is not a change.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    await page.locator('[data-block-id="divider"]').click();
    await page.keyboard.press('Control+s');
    await expect(notice(page, 'Saved — version 2.')).toBeVisible();
    const row = await page.evaluate(async (templateId) => window.__emailStorage.load(templateId), id);
    expect(row.document.engine).toBe('beb-mjml');
    expect(row.mjml).toContain('Saved before the switch');
    expect(row.mjml).toContain('<mj-divider');

    // Its first version (old format) can still be restored, from its MJML.
    await page.getByRole('button', { name: 'Versions' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Version 1' }).getByRole('button', { name: 'Restore version 1' }).click();
    await expect.poll(() => mjml(page)).not.toContain('<mj-divider');
    expect(await mjml(page)).toContain('Old button');
  });

  test('versions: restore version 1, then save it as version 3', async ({ page }) => {
    await openBuilder(page);
    await saveNew(page, 'History');
    const v1 = await mjml(page);
    await page.locator('[data-block-id="spacer"]').click();
    await page.keyboard.press('Control+s');
    await expect(notice(page, 'Saved — version 2.')).toBeVisible();

    await page.getByRole('button', { name: 'Versions' }).click();
    const list = page.getByRole('dialog').filter({ hasText: 'Version 1' });
    await expect(list.getByText('current')).toBeVisible();
    await list.getByRole('button', { name: 'Restore version 1' }).click();
    await expect.poll(() => mjml(page)).toBe(v1);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(notice(page, 'Saved — version 3.')).toBeVisible();
  });

  test('autosave of a saved template: no version', async ({ page }) => {
    await openBuilder(page);
    await page.evaluate(() => window.__setAutosave({ idleMs: 400, maxWaitMs: 2000 }));
    const id = await saveNew(page, 'Auto');
    await page.locator('[data-block-id="text"]').click();
    await expect(page.getByText(/^Autosaved at \d{1,2}:\d{2}( [AP]M)?$/)).toBeVisible({ timeout: 10_000 });
    const dump = await stored(page);
    expect(dump.versions[String(id)]).toHaveLength(1);
    expect(dump.rows[0].mjml).toBe(await mjml(page));
  });

  test('changed elsewhere in the meantime: nothing overwritten, a copy is offered', async ({ page }) => {
    await openBuilder(page);
    const id = await saveNew(page, 'Shared');
    // A second editor saves the same template.
    await page.evaluate(async (templateId) => {
      const storage = window.__emailStorage;
      const other = await storage.load(templateId);
      await storage.save(templateId, { document: other.document, mjml: other.mjml, revision: other.revision, name: 'Shared (other)' });
    }, id);
    await page.locator('[data-block-id="divider"]').click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Template changed in the meantime');
    await dialog.getByRole('button', { name: 'Save a copy' }).click();
    await expect(notice(page, 'Copy saved: “Shared (copy)”.')).toBeVisible();
    const dump = await stored(page);
    expect(dump.rows.map((r) => r.name)).toEqual(['Shared (other)', 'Shared (copy)']);
    expect(Number(await builderOf(page).getAttribute('data-template-id'))).not.toBe(id);
  });

  test('initial content: a new template opens on given MJML and metadata', async ({ page }) => {
    await openBuilder(page);
    await page.evaluate(() =>
      window.__reopenBuilder(null, {
        mjml: '<mjml><mj-body><mj-section><mj-column><mj-text>Imported content</mj-text></mj-column></mj-section></mj-body></mjml>',
        meta: { name: 'Imported', subject: 'Imported subject' },
      })
    );
    await expect(builderOf(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    await expect(canvas(page).getByText('Imported content')).toBeVisible();
    await expect(panel(page).getByLabel(/^Name/)).toHaveValue('Imported');
    await expect(panel(page).getByLabel('Subject', { exact: true })).toHaveValue('Imported subject');
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(SAVED_AT)).toBeVisible();
    expect((await stored(page)).rows[0].mjml).toContain('Imported content');
  });

  test('new template never saved: local draft offered at the next opening', async ({ page }) => {
    await openBuilder(page);
    await page.evaluate(() => window.__setAutosave({ draftDelayMs: 200 }));
    await panel(page).getByLabel(/^Name/).fill('Lost draft?');
    await page.locator('[data-block-id="divider"]').click();
    await page.waitForTimeout(600);
    const draft = await mjml(page);
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();

    await page.evaluate(() => window.__reopenBuilder(null));
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Resume the draft?');
    await dialog.getByRole('button', { name: 'Resume' }).click();
    await expect(builderOf(page)).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
    await expect.poll(() => mjml(page)).toBe(draft);
    await expect(page.getByText('Unsaved changes')).toBeVisible();
    await expect(panel(page).getByLabel(/^Name/)).toHaveValue('Lost draft?');

    // Once saved, the draft is gone.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/^Saved at/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('best-email-builder:new-template-draft'))).toBeNull();
  });
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function openVariables(page) {
  await page.getByRole('button', { name: 'Variables' }).click();
  const picker = page.getByTestId('variable-picker');
  await expect(picker).toBeVisible();
  return picker;
}

test.describe('Variables', () => {
  test('inserted at the caret of a text being edited', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    // Caret at the START of the text: an insertion "at the end" would show.
    await page.keyboard.press('Home');
    const picker = await openVariables(page);
    await picker.getByRole('option', { name: /First name/ }).click();
    await expect.poll(() => mjml(page)).toMatch(/>\{\{contact\.firstname\}\}\s*Your headline<\/mj-text>/);
  });

  test('search and keyboard: type, arrows, Enter', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    await page.keyboard.press('Home');
    const picker = await openVariables(page);
    await picker.getByRole('textbox').fill('comp');
    await expect(picker.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/>\{\{company\.name\}\}\s*Your headline<\/mj-text>/);
  });

  test('unsubscribe on a selected button becomes its URL', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Learn more').click();
    await expect(panel(page).getByRole('heading', { name: 'Button' })).toBeVisible();
    const picker = await openVariables(page);
    await picker.getByRole('option', { name: /Unsubscribe link/ }).click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*href="\{\{ unsubscribe \}\}"/);
  });

  test('nothing selected: nothing inserted, a hint is shown', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    const picker = await openVariables(page);
    await picker.getByRole('option', { name: /Company/ }).click();
    await expect(notice(page, 'Select a text or a button first.')).toBeVisible();
    expect(await mjml(page)).toBe(before);
  });

  test('create a custom variable: tag from the name, inserted at the caret, kept by the storage', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    await page.keyboard.press('Home');
    const picker = await openVariables(page);
    await picker.getByRole('button', { name: 'New variable' }).click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
    await dialog.getByLabel('Name').fill('Order number');
    await expect(dialog.getByLabel('Tag')).toHaveValue('order_number');
    await dialog.getByLabel('Sample value').fill('CMD-1042');
    await dialog.getByLabel('Value if empty').fill('your order');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(notice(page, 'Variable “Order number” created and inserted.')).toBeVisible();
    await expect.poll(() => mjml(page)).toMatch(/>\{\{order_number\}\}\s*Your headline<\/mj-text>/);
    const { variables } = await stored(page);
    expect(variables).toEqual([
      expect.objectContaining({ key: 'order_number', label: 'Order number', group: 'Custom', sample: 'CMD-1042', fallback: 'your order' }),
    ]);

    // It is offered in the menu, in its group.
    const again = await openVariables(page);
    await expect(again.getByRole('group', { name: 'Custom' }).getByRole('option', { name: /Order number/ })).toBeVisible();
  });

  test('a custom variable is validated, edited, then deleted; system variables are read-only', async ({ page }) => {
    await openBuilder(page);
    let picker = await openVariables(page);
    await expect(picker.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
    await picker.getByRole('button', { name: 'New variable' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
    await dialog.getByLabel('Name').fill('Email');
    await dialog.getByLabel('Tag').fill('contact.email');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('This key is already used')).toBeVisible();
    await dialog.getByLabel('Tag').fill('Bad Tag');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText(/Lowercase letters/)).toBeVisible();
    await dialog.getByLabel('Tag').fill('loyalty.points');
    await dialog.getByLabel('Name').fill('Loyalty points');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(notice(page, 'Variable “Loyalty points” created.')).toBeVisible();

    picker = await openVariables(page);
    await picker.getByRole('option', { name: /Loyalty points/ }).hover();
    await picker.getByRole('button', { name: 'Edit “Loyalty points”' }).click();
    const edit = page.getByRole('dialog').filter({ hasText: 'Edit variable' });
    await expect(edit.getByLabel('Tag')).toBeDisabled();
    await edit.getByLabel('Group').fill('Loyalty');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(notice(page, 'Variable “Loyalty points” saved.')).toBeVisible();
    picker = await openVariables(page);
    await expect(picker.getByRole('group', { name: 'Loyalty' })).toBeVisible();

    await picker.getByRole('option', { name: /Loyalty points/ }).hover();
    await picker.getByRole('button', { name: 'Edit “Loyalty points”' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Edit variable' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(notice(page, 'Variable deleted.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([]);
  });

  test('search with no result offers to create the variable under that name', async ({ page }) => {
    await openBuilder(page);
    const picker = await openVariables(page);
    await picker.getByRole('textbox').fill('Delivery date');
    await expect(picker.getByText('No variable found.')).toBeVisible();
    await picker.getByRole('button', { name: 'Create “Delivery date”' }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
    await expect(dialog.getByLabel('Name')).toHaveValue('Delivery date');
    await expect(dialog.getByLabel('Tag')).toHaveValue('delivery_date');
  });

  test('{ } button inserts a variable in the subject line, at the caret', async ({ page }) => {
    await openBuilder(page);
    const subject = panel(page).getByLabel('Subject', { exact: true });
    await subject.fill('Your order is ready');
    await subject.press('Home');
    await panel(page).getByRole('button', { name: 'Insert a variable in the subject' }).click();
    const picker = page.getByTestId('variable-picker');
    await expect(picker.getByRole('option', { name: /Unsubscribe link/ })).toHaveCount(0);
    await picker.getByRole('option', { name: /First name/ }).click();
    await expect(subject).toHaveValue('{{contact.firstname}}Your order is ready');
  });
});

test.describe('Images, preview, test send', () => {
  test('uploaded image: storage path in the email, displayed in the canvas', async ({ page }) => {
    await page.route('**/email-assets/*', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await openBuilder(page);
    await page.locator('[data-block-id="image"]').click();
    const props = panel(page);
    await expect(props.getByRole('heading', { name: 'Image' })).toBeVisible();

    // An SVG is refused before any upload.
    await props.getByTestId('eb-prop-src-file').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(props.getByText('Format rejected: PNG, JPEG or GIF expected')).toBeVisible();

    await props.getByTestId('eb-prop-src-file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: PNG });
    await expect.poll(() => mjml(page)).toMatch(/<mj-image[^>]*src="\/email-assets\/[a-f0-9]{32}\.png"/);
    const path = (await mjml(page)).match(/src="(\/email-assets\/[^"]+)"/)[1];
    expect((await stored(page)).images).toContain(path);
    await expect(props.getByLabel('Image', { exact: true })).toHaveValue(path);
    await expect
      .poll(() => canvas(page).locator(`img[src="${path}"]`).evaluate((img) => img.complete && img.naturalWidth))
      .toBe(1);
  });

  test('preview: rendering of the MJML on screen, points to check', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Email preview').first()).toBeVisible();
    await expect(dialog.frameLocator('iframe[title="Email preview"]').getByText(/Your headline/)).toBeVisible();
    await expect(dialog.getByText('Images without alt text: 1')).toBeVisible();
  });

  test('test send: the MJML on screen goes to the typed addresses', async ({ page }) => {
    await openBuilder(page);
    await panel(page).getByLabel('Subject', { exact: true }).fill('Back to school');
    await page.getByRole('button', { name: 'Test', exact: true }).click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Send a test' });
    await dialog.getByLabel('Addresses').fill('reviewer@example.com');
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(notice(page, '1 test(s) sent — check your inbox.')).toBeVisible();
    expect(await page.evaluate(() => window.__sentTests)).toEqual([{ to: 'reviewer@example.com', subject: '[TEST] Back to school' }]);
    await expect(dialog.getByRole('list', { name: 'Results' }).getByText('reviewer@example.com')).toBeVisible();
  });
});

test.describe('Template gallery', () => {
  test('every template is shown rendered; picking one replaces the email and fills an empty subject', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Templates' }).click();
    const gallery = page.getByTestId('eb-template-gallery');
    await expect(gallery.getByRole('heading', { name: 'Start from a template' })).toBeVisible();
    const cards = gallery.locator('[data-template-id]');
    await expect(cards).toHaveCount(6);
    // Thumbnails: compiled emails in sandboxed frames, never empty.
    const frames = gallery.locator('iframe');
    await expect(frames).toHaveCount(6);
    for (const frame of await frames.all()) {
      await expect(frame).toHaveAttribute('sandbox', '');
      expect((await frame.getAttribute('srcdoc'))?.length).toBeGreaterThan(500);
    }
    await expect(gallery.locator('iframe').nth(2)).toHaveAttribute('srcdoc', /The news of the month/);

    // Nothing modified yet: applied without a question.
    await gallery.locator('[data-template-id="newsletter"]').click();
    await expect(gallery).toBeHidden();
    await expect(notice(page, '“Newsletter” template applied.')).toBeVisible();
    const source = await mjml(page);
    expect(source).toContain('Article 1');
    expect(source).toContain('<mj-social');
    expect(source).toContain('href="{{ unsubscribe }}"');
    expect(source).not.toContain('data:image');
    await expect(panel(page).getByRole('textbox', { name: 'Subject' })).toHaveValue('The news of the month');

    // Modified: a confirmation first, and the subject typed by the user stays.
    await panel(page).getByRole('textbox', { name: 'Subject' }).fill('My own subject');
    await page.locator('[data-block-id="divider"]').click();
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByTestId('eb-template-gallery').locator('[data-template-id="welcome"]').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Replace the current email?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await mjml(page)).toContain('Article 1');
    await page.getByRole('button', { name: 'Templates' }).click();
    await page.getByTestId('eb-template-gallery').locator('[data-template-id="welcome"]').click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Replace' }).click();
    expect(await mjml(page)).toContain('Get started');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await expect(panel(page).getByRole('textbox', { name: 'Subject' })).toHaveValue('My own subject');
  });

  test('French gallery: names and email texts translated', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.getByRole('button', { name: 'Modèles' }).click();
    const gallery = page.getByTestId('eb-template-gallery');
    await expect(gallery.getByText('Invitation', { exact: true })).toBeVisible();
    await gallery.locator('[data-template-id="event"]').click();
    expect(await mjml(page)).toContain('Je réserve ma place');
  });
});
