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

async function openBuilder(page, { lang, variables } = {}) {
  await page.goto(`${STORY}${lang ? `&lang=${lang}` : ''}${variables ? `&variables=${variables}` : ''}`);
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
    for (const fragment of ['Example Inc.', 'Your headline', 'Hello,', '<mj-button', 'href="{{ unsubscribe }}"', '1 Main Street']) {
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
    await props.getByLabel('Margin — Top', { exact: true }).fill('30');
    await props.getByLabel('Margin — Top', { exact: true }).press('Enter');

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

test.describe('Side panels', () => {
  const sidePanel = (page, name) => page.locator(`[data-panel="${name}"]`);
  const widthOf = async (locator) => Math.round((await locator.boundingBox()).width);

  test('wide by default: three blocks in a row, a roomier properties panel', async ({ page }) => {
    await openBuilder(page);
    expect(await widthOf(sidePanel(page, 'blocks'))).toBe(328);
    expect(await widthOf(sidePanel(page, 'properties'))).toBe(416);
    const tops = await page.locator('[data-block-id]').evaluateAll((tiles) => tiles.slice(0, 4).map((tile) => Math.round(tile.getBoundingClientRect().top)));
    expect(tops.slice(0, 3)).toEqual([tops[0], tops[0], tops[0]]);
    expect(tops[3]).toBeGreaterThan(tops[0]);
  });

  test('a border dragged resizes its panel; the arrow keys too; remembered after a reload', async ({ page }) => {
    await openBuilder(page);
    const blocks = sidePanel(page, 'blocks');
    const properties = sidePanel(page, 'properties');
    // The properties narrower (towards the right), then the blocks wider.
    for (const [panel, dx] of [
      [properties, 60],
      [blocks, 80],
    ]) {
      const border = await panel.getByRole('separator').boundingBox();
      await page.mouse.move(border.x + border.width / 2, border.y + 300);
      await page.mouse.down();
      await page.mouse.move(border.x + border.width / 2 + dx, border.y + 300, { steps: 6 });
      await page.mouse.up();
    }
    expect(await widthOf(properties)).toBe(356);
    expect(await widthOf(blocks)).toBe(408);
    // The canvas keeps its room: dragging further stops at it.
    const border = await blocks.getByRole('separator').boundingBox();
    await page.mouse.move(border.x + border.width / 2, border.y + 300);
    await page.mouse.down();
    await page.mouse.move(border.x + 600, border.y + 300, { steps: 6 });
    await page.mouse.up();
    expect((await page.locator('.eb-canvas-frame').boundingBox()).width).toBeGreaterThanOrEqual(639);

    await properties.getByRole('separator').focus();
    await page.keyboard.press('ArrowRight');
    expect(await widthOf(properties)).toBe(340);

    await page.reload();
    await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready');
    expect(await widthOf(properties)).toBe(340);
    // A double-click puts the default width back (above the fold button, in the middle).
    await properties.getByRole('separator').dblclick({ position: { x: 4, y: 40 } });
    expect(await widthOf(properties)).toBe(416);
  });

  test('folded to a rail and unfolded; the canvas takes the room', async ({ page }) => {
    await openBuilder(page);
    const frame = page.locator('.eb-canvas-frame');
    const before = (await frame.boundingBox()).width;
    await page.getByRole('button', { name: 'Hide the blocks' }).click();
    await page.getByRole('button', { name: 'Hide the properties' }).click();
    await expect.poll(() => widthOf(sidePanel(page, 'blocks'))).toBe(40);
    await expect.poll(() => widthOf(sidePanel(page, 'properties'))).toBe(40);
    await expect.poll(async () => (await frame.boundingBox()).width).toBeGreaterThan(before + 600);
    await expect(page.locator('[data-block-id]')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready');
    await page.getByRole('button', { name: 'Show the blocks' }).click();
    await page.getByRole('button', { name: 'Show the properties' }).click();
    await expect.poll(() => widthOf(sidePanel(page, 'blocks'))).toBe(328);
    await expect(panel(page).getByRole('heading', { name: 'Email' })).toBeVisible();
  });

  test('folding and unfolding glide like the mobile view: the content keeps its width and fades', async ({ page }) => {
    await openBuilder(page);
    // The panel's width and its content's, frame by frame, from the click on.
    const glide = (label) =>
      page.evaluate(async (label) => {
        const properties = document.querySelector('[data-panel="properties"]');
        /** @type {HTMLElement} */ (document.querySelector(`button[aria-label="${label}"]`)).click();
        const frames = [];
        const start = performance.now();
        while (performance.now() - start < 700) {
          await new Promise(requestAnimationFrame);
          const content = properties.querySelector('[data-testid="eb-properties"]');
          frames.push({
            width: Math.round(properties.getBoundingClientRect().width),
            content: content ? Math.round(content.getBoundingClientRect().width) : 0,
            opacity: content ? Number(getComputedStyle(content.parentElement).opacity) : 0,
          });
        }
        return frames;
      }, label);
    const between = (frames) => frames.filter(({ width }) => width > 40 && width < 416);
    const fading = (frames) => frames.filter(({ opacity }) => opacity > 0.1 && opacity < 0.9);

    const folding = await glide('Hide the properties');
    expect(between(folding).length).toBeGreaterThan(5);
    expect(fading(folding).length).toBeGreaterThan(3);
    // Never squeezed: it keeps the panel's width (less the border) until it is gone.
    expect(new Set(folding.map(({ content }) => content).filter(Boolean))).toEqual(new Set([415]));
    expect(folding.at(-1)).toEqual({ width: 40, content: 0, opacity: 0 });

    const unfolding = await glide('Show the properties');
    expect(between(unfolding).length).toBeGreaterThan(5);
    expect(fading(unfolding).length).toBeGreaterThan(3);
    expect(new Set(unfolding.map(({ content }) => content))).toEqual(new Set([415]));
    expect(unfolding.at(-1)).toEqual({ width: 416, content: 415, opacity: 1 });

    // With reduced motion, at once.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await glide('Hide the properties'))[0]).toEqual({ width: 40, content: 0, opacity: 0 });
  });

  test('the properties are compact: a field and a select of the same height', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    const props = panel(page);
    const field = await props.locator('[data-slot=input]').first().boundingBox();
    const select = await props.locator('[data-slot=select-trigger]').first().boundingBox();
    expect(Math.round(field.height)).toBe(26);
    expect(Math.round(select.height)).toBe(26);
  });

  test('a text box is resized in height only: its width stays the panel’s', async ({ page }) => {
    await openBuilder(page);
    const box = panel(page).getByRole('textbox', { name: 'Preview text', exact: true });
    const before = await box.boundingBox();
    // The resize handle, bottom right: dragged left and down.
    await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
    await page.mouse.down();
    await page.mouse.move(before.x + before.width - 120, before.y + before.height + 60, { steps: 8 });
    await page.mouse.up();
    const after = await box.boundingBox();
    expect(after.width).toBe(before.width);
    expect(after.height).toBeGreaterThan(before.height + 40);
  });
});

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
    expect((await texts(page)).slice(1, 3)).toEqual(['Your headline', 'Hello,Your text.']);
    await canvas(page).getByText('Your headline').click();
    // The ✥ handle of the selection's toolbar.
    const handle = await canvas(page).locator('button[data-action="move"]').boundingBox();
    const box = await canvas(page).getByText('Learn more').boundingBox();
    await drag(page, handle, { x: box.x + box.width / 2, y: box.y + box.height - 2 });
    await expect.poll(async () => (await texts(page)).indexOf('Your headline')).toBe(2);
  });

  test('the panel has no action row: duplicate and delete are on the selection frame', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    await expect(panel(page).getByRole('heading', { name: 'Text' })).toBeVisible();
    await expect(panel(page).getByRole('toolbar', { name: 'Element actions' })).toHaveCount(0);

    await canvas(page).getByRole('button', { name: 'Duplicate' }).click();
    await expect.poll(async () => (await texts(page)).slice(1, 4)).toEqual([
      'Your headline',
      'Your headline',
      'Hello,Your text.',
    ]);
    await canvas(page).getByRole('button', { name: 'Delete' }).click();
    await expect.poll(async () => (await texts(page)).filter((t) => t === 'Your headline').length).toBe(1);
    await expect(panel(page).getByRole('heading', { name: 'Email' })).toBeVisible();
  });

  test('columns: arrows on the selection frame move them sideways', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="columns-2"]').click();
    const before = await idsOf(page, 'mj-column');
    // An empty column says "Drop a block here"; clicking it selects the column.
    await canvas(page).getByText('Drop a block here').first().click();
    await expect(panel(page).getByRole('heading', { name: 'Column' })).toBeVisible();
    // A column cannot leave its section: arrows instead of the drag handle.
    await expect(canvas(page).locator('button[data-action="move"]')).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Move left' })).toBeDisabled();
    await canvas(page).getByRole('button', { name: 'Move right' }).click();
    const [first, second] = before.slice(-2);
    await expect.poll(async () => (await idsOf(page, 'mj-column')).slice(-2)).toEqual([second, first]);
    // Still selected, now the last one: left again, right no more.
    await expect(canvas(page).getByRole('button', { name: 'Move right' })).toBeDisabled();
    await canvas(page).getByRole('button', { name: 'Move left' }).click();
    await expect.poll(async () => (await idsOf(page, 'mj-column')).slice(-2)).toEqual([first, second]);
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

const variablesButton = (page) => page.getByTestId('eb-ribbon').locator('[data-drawer="variables"]');
const variablesPanel = (page) => page.getByTestId('eb-panel-variables');

/** The variables panel, opened by its button at the end of the ribbon: its badges. */
async function openBar(page) {
  if ((await variablesButton(page).getAttribute('aria-pressed')) !== 'true') await variablesButton(page).click();
  const badges = variablesPanel(page).getByRole('group', { name: 'Email provider variables' });
  await expect(badges).toBeVisible();
  // Done sliding open: a badge reached while it slides would move from under the pointer.
  await expect.poll(() => variablesPanel(page).evaluate((aside) => aside.parentElement.offsetWidth)).toBe(256);
  return badges;
}

test.describe('Variables', () => {
  test('one place to insert them: the panel opened from the end of the ribbon, no Variables menu in the toolbar', async ({ page }) => {
    await openBuilder(page);
    await expect(page.getByTestId('eb-toolbar-actions').getByRole('button', { name: 'Variables', exact: true })).toHaveCount(0);
    const button = variablesButton(page);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await expect(variablesPanel(page)).toHaveCount(0);
    await button.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Email provider variables');

    await openBar(page);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // Named as its button, with no heading: the close button only.
    await expect(page.getByRole('complementary', { name: 'Variables' })).toBeVisible();
    await expect(variablesPanel(page).getByRole('heading')).toHaveCount(0);
    await expect(variablesPanel(page).getByRole('button', { name: 'Close the panel' })).toBeVisible();
    // Beside the canvas, between the email and the properties: it narrows the email, covers nothing.
    const frame = await page.locator('.eb-canvas-frame').boundingBox();
    const aside = await variablesPanel(page).boundingBox();
    const properties = await panel(page).boundingBox();
    expect(frame.x + frame.width).toBeLessThanOrEqual(aside.x + 1);
    expect(aside.x + aside.width).toBeLessThanOrEqual(properties.x + 1);

    // Its button again, or its ×, shuts it.
    await button.click();
    await expect(variablesPanel(page)).toHaveCount(0);
    await openBar(page);
    await variablesPanel(page).getByRole('button', { name: 'Close the panel' }).click();
    await expect(variablesPanel(page)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  test('none by default but the unsubscribe link: the + creates the first one', async ({ page }) => {
    await openBuilder(page, { variables: 'default' });
    // The starter template holds no variable.
    expect(await mjml(page)).not.toMatch(/\{\{(?! unsubscribe )/);
    const badges = await openBar(page);
    await expect(badges.locator('[data-variable]')).toHaveText(['Unsubscribe link']);
    await expect(badges.getByRole('button', { name: 'Edit “Unsubscribe link”' })).toBeVisible();
    const plus = badges.getByRole('button', { name: 'New variable', exact: true });
    await plus.hover();
    await expect(page.getByRole('tooltip')).toHaveText('New variable');
    await plus.click();

    const dialog = page.getByRole('dialog').filter({ hasText: 'Available in every template.' });
    // No system variable: a key the example set uses is free here.
    await dialog.getByLabel('Name').fill('First name');
    await dialog.getByLabel('Tag').fill('contact.firstname');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(notice(page, 'Variable “First name” created.')).toBeVisible();

    await openBar(page);
    await expect(badges.locator('[data-variable]')).toHaveText(['First name', 'Unsubscribe link']);
    await expect(badges.getByRole('button', { name: 'Edit “First name”' })).toBeVisible();
  });

  test('unsubscribe on a selected button becomes its URL', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Learn more').click();
    await expect(panel(page).getByRole('heading', { name: 'Button' })).toBeVisible();
    const badges = await openBar(page);
    const unsubscribe = badges.getByRole('button', { name: 'Unsubscribe link', exact: true });
    // A link: no typed preview, its tag in the tooltip.
    await unsubscribe.hover();
    await expect(page.getByRole('tooltip')).toHaveText('{{ unsubscribe }}');
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveCount(0);
    await unsubscribe.click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*href="\{\{ unsubscribe \}\}"/);
  });

  test('unsubscribe in a text being edited: a link at the caret', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    await page.keyboard.press('End');
    const badges = await openBar(page);
    await badges.getByRole('button', { name: 'Unsubscribe link', exact: true }).click();
    await expect.poll(() => mjml(page)).toMatch(/Your headline\s*<a href="\{\{ unsubscribe \}\}">Unsubscribe<\/a>/);
  });

  test('variables panel: a badge under the pointer types its tag into the selected button, wipes it out when it leaves; a click inserts it', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    const preview = canvas(page).getByTestId('eb-canvas-preview');
    const button = canvas(page).locator('.eb-tag-mj-button');
    const badges = await openBar(page);
    await expect(badges.locator('[data-variable]')).toHaveText([
      'First name',
      'Last name',
      'Email address',
      'Company',
      'Campaign name',
      'Unsubscribe link',
    ]);
    await expect(badges.getByRole('button', { name: 'New variable', exact: true })).toBeVisible();

    // Nothing selected: the tooltip names the tag, nothing is typed; a click says what to do.
    await badges.getByRole('button', { name: 'Company', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('{{company.name}}');
    await expect(preview).toHaveCount(0);
    await badges.getByRole('button', { name: 'Company', exact: true }).click();
    await expect(notice(page, 'Select a text or a button first.')).toBeVisible();
    expect(await mjml(page)).toBe(before);

    await canvas(page).getByText('Learn more').click();
    const lastName = badges.getByRole('button', { name: 'Last name', exact: true });
    await lastName.hover();
    await expect(page.getByRole('tooltip')).toHaveText('{{contact.lastname}}');
    await expect(button).toContainText('Learn more {{contact.lastname}}');
    // Another badge: only the end changes.
    await badges.getByRole('button', { name: 'First name', exact: true }).hover();
    await expect(button).toContainText('Learn more {{contact.firstname}}');
    expect(await mjml(page)).toBe(before);
    await page.mouse.move(700, 700, { steps: 8 });
    await expect(preview).toHaveCount(0);
    await expect(button).not.toContainText('{{');
    // The panel stays open: it is shut by its button.
    await expect(variablesButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('email-builder').getByText('No changes')).toBeVisible();
    expect(await mjml(page)).toBe(before);

    await lastName.hover();
    await lastName.click();
    await expect.poll(() => mjml(page)).toMatch(/>Learn more \{\{contact\.lastname\}\}<\/mj-button>/);
    await page.mouse.move(700, 700, { steps: 8 });
    await expect(preview).toHaveCount(0);
    await expect(button).toContainText('Learn more {{contact.lastname}}');
  });

  test('variables panel on a text being edited: the tag shows at the caret, a click inserts it there', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    await page.keyboard.press('Home');
    const before = await mjml(page);
    const badges = await openBar(page);
    const firstName = badges.getByRole('button', { name: 'First name', exact: true });
    await firstName.hover();
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveText('{{contact.firstname}}');
    expect(await mjml(page)).toBe(before);
    await firstName.click();
    await expect.poll(() => mjml(page)).toMatch(/>\{\{contact\.firstname\}\}\s*Your headline<\/mj-text>/);
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveCount(0);
  });

  test('create a custom variable: tag from the name, inserted at the caret, kept by the storage', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').dblclick();
    await page.keyboard.press('Home');
    const badges = await openBar(page);
    await badges.getByRole('button', { name: 'New variable', exact: true }).click();

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

    // It is offered in the panel, with its tag.
    await openBar(page);
    await badges.getByRole('button', { name: 'Order number', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('{{order_number}}');
  });

  test('a custom variable is validated, edited, then deleted', async ({ page }) => {
    await openBuilder(page);
    let badges = await openBar(page);
    await badges.getByRole('button', { name: 'New variable', exact: true }).click();
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

    badges = await openBar(page);
    await badges.getByRole('button', { name: 'Edit “Loyalty points”' }).click();
    const edit = page.getByRole('dialog').filter({ hasText: 'Edit variable' });
    await expect(edit.getByLabel('Tag')).toBeDisabled();
    await edit.getByLabel('Group').fill('Loyalty');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(notice(page, 'Variable “Loyalty points” saved.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([expect.objectContaining({ key: 'loyalty.points', group: 'Loyalty' })]);

    badges = await openBar(page);
    await badges.getByRole('button', { name: 'Edit “Loyalty points”' }).click();
    await page.getByRole('dialog').filter({ hasText: 'Edit variable' }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(notice(page, 'Variable deleted.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([]);
    await expect(badges.getByRole('button', { name: 'Loyalty points', exact: true })).toHaveCount(0);
  });

  test('the application’s variables are edited too: name and sample change, the tag stays; restored', async ({ page }) => {
    await openBuilder(page);
    let badges = await openBar(page);
    // Every one, the unsubscribe link included.
    await expect(badges.getByRole('button', { name: /^Edit “/ })).toHaveCount(6);

    await badges.getByRole('button', { name: 'Edit “First name”' }).click();
    const edit = page.getByRole('dialog').filter({ hasText: 'Edit variable' });
    await expect(edit.getByLabel('Tag')).toBeDisabled();
    await expect(edit.getByText('{{contact.firstname}}')).toBeVisible();
    // Not deleted: it is the application's.
    await expect(edit.getByRole('button', { name: 'Delete' })).toHaveCount(0);
    await expect(edit.getByRole('button', { name: 'Restore the default' })).toHaveCount(0);
    await edit.getByLabel('Name').fill('Given name');
    await edit.getByLabel('Sample value').fill('Jo');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(notice(page, 'Variable “Given name” saved.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([expect.objectContaining({ key: 'contact.firstname', label: 'Given name', sample: 'Jo' })]);

    await canvas(page).getByText(/Your text\./).click();
    badges = await openBar(page);
    await expect(badges.locator('[data-variable="contact.firstname"]')).toHaveText('Given name');
    await badges.getByRole('button', { name: 'Given name', exact: true }).click();
    await expect.poll(() => mjml(page)).toMatch(/Your text\. \{\{contact\.firstname\}\}</);

    await badges.getByRole('button', { name: 'Edit “Given name”' }).click();
    await edit.getByRole('button', { name: 'Restore the default' }).click();
    await expect(notice(page, 'Variable restored to its default.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([]);
    badges = await openBar(page);
    await expect(badges.locator('[data-variable="contact.firstname"]')).toHaveText('First name');
  });

  test('the unsubscribe link is edited like the others: its provider’s tag, never a script', async ({ page }) => {
    await openBuilder(page);
    const badges = await openBar(page);
    await badges.getByRole('button', { name: 'Edit “Unsubscribe link”' }).click();
    const edit = page.getByRole('dialog').filter({ hasText: 'Edit variable' });
    await expect(edit.getByLabel('Tag')).toBeDisabled();
    await expect(edit.getByText('{{ unsubscribe }}')).toBeVisible();
    await expect(edit.getByText('When the sending gives no link')).toBeVisible();
    await edit.getByLabel('Value if empty').fill('javascript:alert(1)');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(edit.getByText('An address, or your email provider’s tag')).toBeVisible();
    await edit.getByLabel('Name').fill('Opt out');
    await edit.getByLabel('Value if empty').fill('*|UNSUB|*');
    await edit.getByRole('button', { name: 'Save' }).click();
    await expect(notice(page, 'Variable “Opt out” saved.')).toBeVisible();
    expect((await stored(page)).variables).toEqual([expect.objectContaining({ key: 'unsubscribe', label: 'Opt out', fallback: '*|UNSUB|*' })]);
    await expect(badges.locator('[data-variable="unsubscribe"]')).toHaveText('Opt out');
  });

  test('{ } button of the subject: search and keyboard — type, arrows, Enter', async ({ page }) => {
    await openBuilder(page);
    const subject = panel(page).getByLabel('Subject', { exact: true });
    await subject.fill('Your order is ready');
    await subject.press('Home');
    await panel(page).getByRole('button', { name: 'Insert a variable in the subject' }).click();
    const picker = page.getByTestId('variable-picker');
    await picker.getByRole('textbox').fill('name');
    await expect(picker.getByRole('option')).toHaveText([/First name/, /Last name/, /Company/, /Campaign name/]);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(subject).toHaveValue('{{contact.lastname}}Your order is ready');
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

  /** Puts the pointer on the first tag of the canvas text holding `near`; its box shows. */
  async function hoverTag(page, near) {
    const frame = page.locator('.eb-canvas-frame');
    await expect(async () => {
      const at = await frame.boundingBox();
      const box = await canvas(page).locator('body').evaluate((body, near) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const start = node.data.indexOf('{{');
          if (start === -1 || !node.parentElement?.textContent.includes(near)) continue;
          const range = document.createRange();
          range.setStart(node, start);
          range.setEnd(node, node.data.indexOf('}}', start) + 2);
          const { x, y, width, height } = range.getBoundingClientRect();
          return { x, y, width, height };
        }
        return null;
      }, near);
      await page.mouse.move(at.x + box.x + box.width / 2, at.y + box.y + box.height / 2, { steps: 4 });
      await expect(canvas(page).getByTestId('eb-canvas-tag')).toBeVisible({ timeout: 500 });
    }).toPass();
  }

  async function insertFirstName(page, near) {
    await canvas(page).getByText(near).click();
    const badges = await openBar(page);
    await badges.getByRole('button', { name: 'First name', exact: true }).click();
    await page.mouse.move(10, 10);
    await expect(canvas(page).getByTestId('eb-canvas-preview')).toHaveCount(0);
  }

  test('a tag in the email: under the pointer its colours swap, its × takes it out with its space', async ({ page }) => {
    await openBuilder(page);
    await insertFirstName(page, /Your text\./);
    await expect.poll(() => mjml(page)).toMatch(/Your text\. \{\{contact\.firstname\}\}</);
    const tag = canvas(page).getByTestId('eb-canvas-tag');
    await expect(tag).toBeHidden();

    await hoverTag(page, 'Your text.');
    const ink = await canvas(page).getByText(/Your text\./).evaluate((el) => getComputedStyle(el).color);
    await expect(tag).toHaveCSS('background-color', ink);
    await expect(tag).toHaveCSS('color', 'rgb(255, 255, 255)');
    const clear = canvas(page).getByRole('button', { name: 'Remove the variable' });
    await clear.click();
    await expect.poll(() => mjml(page)).toMatch(/Your text\.</);
    expect(await mjml(page)).not.toContain('{{contact.firstname}}');
    await expect(tag).toBeHidden();
    await expect(clear).toBeHidden();
    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toMatch(/Your text\. \{\{contact\.firstname\}\}</);

    // While the text is being edited: taken out where the caret can go on typing.
    await canvas(page).getByText(/Your text\./).dblclick();
    await hoverTag(page, 'Your text.');
    await clear.click();
    await page.keyboard.type(' again');
    await page.keyboard.press('Escape');
    await expect.poll(() => mjml(page)).toMatch(/Your text\. again</);
  });

  test("a tag in a button's label: its × takes it out of the label", async ({ page }) => {
    await openBuilder(page);
    await insertFirstName(page, 'Learn more');
    await expect.poll(() => mjml(page)).toMatch(/>Learn more \{\{contact\.firstname\}\}<\/mj-button>/);
    await hoverTag(page, 'Learn more');
    await canvas(page).getByRole('button', { name: 'Remove the variable' }).click();
    await expect.poll(() => mjml(page)).toMatch(/>Learn more<\/mj-button>/);
  });

  test('a tag cut over two lines: each line of it swaps its colours, never the words beside it', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText(/Your text\./).dblclick();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' {{ contact.firstname }}');
    await page.keyboard.press('Escape');
    await expect.poll(() => mjml(page)).toMatch(/Your text\. \{\{ contact\.firstname \}\}</);
    // The text narrowed until the tag breaks after its "{{" (the rest fits on the next line); the pointer on its last line.
    const end = await canvas(page)
      .locator('body')
      .evaluate((body) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const start = node.data.indexOf('{{ contact');
          if (start === -1) continue;
          const range = document.createRange();
          const widthOf = (from, to) => {
            range.setStart(node, from);
            range.setEnd(node, to);
            return range.getBoundingClientRect().width;
          };
          const width = Math.max(widthOf(0, start + 2), widthOf(start + 3, node.data.indexOf('}}', start) + 2));
          node.parentElement.style.width = `${Math.ceil(width) + 4}px`;
          range.setStart(node, start);
          range.setEnd(node, node.data.indexOf('}}', start) + 2);
          const last = [...range.getClientRects()].filter((r) => r.width).at(-1);
          return { x: last.x + last.width / 2, y: last.y + last.height / 2 };
        }
        return null;
      });
    const at = await page.locator('.eb-canvas-frame').boundingBox();
    await page.mouse.move(at.x + end.x, at.y + end.y, { steps: 4 });

    const pieces = canvas(page).getByTestId('eb-canvas-tag');
    await expect(pieces.first()).toBeVisible();
    await expect(pieces).toHaveCount(2);
    expect((await pieces.first().boundingBox()).width).toBeLessThan(40);
    await expect(pieces).toHaveText(['{{', 'contact.firstname }}']);
    // The × at the end of the tag: the top right of its last line.
    const last = await pieces.last().boundingBox();
    const clear = await canvas(page).getByRole('button', { name: 'Remove the variable' }).boundingBox();
    expect(Math.abs(clear.x + clear.width / 2 - (last.x + last.width))).toBeLessThan(12);
    expect(Math.abs(clear.y + clear.height / 2 - last.y)).toBeLessThan(12);
    await canvas(page).getByRole('button', { name: 'Remove the variable' }).click();
    await expect.poll(() => mjml(page)).toMatch(/Your text\.</);
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

  test('image with no picture yet: saving says it stays out of the email until one is added', async ({ page }) => {
    await openBuilder(page);
    await saveNew(page, 'With an image to fill');
    await page.locator('[data-block-id="image"]').click();
    await page.keyboard.press('Control+s');
    await expect(
      notice(page, 'Saved. 1 image(s) have no picture yet: they are left out of the email until you add one.')
    ).toBeVisible();
    // Still in the email being edited, with its frame to fill.
    await expect.poll(() => mjml(page)).toMatch(/<mj-image\b/);
  });

  test('preview: rendering of the MJML on screen, points to check', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Email preview').first()).toBeVisible();
    await expect(dialog.frameLocator('iframe[title="Email preview"]').getByText(/Your headline/)).toBeVisible();
    await expect(dialog.getByText('Images without alt text: 1')).toBeVisible();
    // One scrollbar: the frame fills its box and scrolls the email, the box itself does not scroll.
    const fit = await dialog.locator('iframe[title="Email preview"]').evaluate((frame) => {
      const box = frame.closest('[data-device]').parentElement;
      return { scrolls: box.scrollHeight > box.clientHeight, padding: box.clientHeight - frame.offsetHeight };
    });
    expect(fit).toEqual({ scrolls: false, padding: 24 });
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
    // A thumbnail is a picture: no scrollbar in it.
    await expect(gallery.locator('iframe').nth(2)).toHaveAttribute('srcdoc', /html,body\{overflow:hidden!important/);
    // Every card has the same height, a long description or not.
    const heights = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);

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

  test('search and tags: one tag, several (any of them), none again with the reset; Escape clears the search first', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Templates' }).click();
    const gallery = page.getByTestId('eb-template-gallery');
    const ids = () => gallery.locator('[data-template-id]').evaluateAll((els) => els.map((el) => el.dataset.templateId));
    // The search has the focus: typing filters at once.
    const search = gallery.getByRole('searchbox', { name: 'Search templates' });
    await expect(search).toBeFocused();
    const tags = gallery.getByRole('group', { name: 'Filter by tag' });
    const reset = gallery.getByRole('button', { name: 'Clear the tag filters' });
    // No tag chosen: every template, and the reset has nothing to clear.
    await expect(tags.getByRole('button')).toHaveText(['Basics', 'Marketing', 'News', 'Onboarding', 'Sales', 'Events']);
    await expect(tags.getByRole('button', { pressed: true })).toHaveCount(0);
    await expect(gallery.locator('[data-template-id]')).toHaveCount(6);
    await expect(reset).toBeDisabled();

    await tags.getByRole('button', { name: 'Sales' }).click();
    await expect.poll(ids).toEqual(['promotion']);
    await expect(reset).toBeEnabled();
    await tags.getByRole('button', { name: 'Events' }).click();
    await expect.poll(ids).toEqual(['promotion', 'event']);
    await tags.getByRole('button', { name: 'Sales' }).click();
    await expect.poll(ids).toEqual(['event']);
    await reset.click();
    await expect(gallery.locator('[data-template-id]')).toHaveCount(6);
    await expect(tags.getByRole('button', { pressed: true })).toHaveCount(0);
    await expect(reset).toBeDisabled();

    // The search reads names, descriptions and tags, accents aside; tags narrow it.
    await search.fill('BUTTON');
    await expect.poll(ids).toEqual(['simple', 'event']);
    await tags.getByRole('button', { name: 'Basics' }).click();
    await expect.poll(ids).toEqual(['simple']);
    await search.fill('nothing like this');
    await expect(gallery.getByText('Nothing matches “nothing like this”.')).toBeVisible();
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(gallery).toBeVisible();
    await expect.poll(ids).toEqual(['blank', 'simple']);

    // Closed and opened again: everything shown.
    await page.keyboard.press('Escape');
    await expect(gallery).toBeHidden();
    await page.getByRole('button', { name: 'Templates' }).click();
    await expect(gallery.locator('[data-template-id]')).toHaveCount(6);
  });

  test('French gallery: names and email texts translated', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.getByRole('button', { name: 'Modèles' }).click();
    const gallery = page.getByTestId('eb-template-gallery');
    await expect(gallery.getByText('Invitation', { exact: true })).toBeVisible();
    await gallery.getByRole('button', { name: 'Événements' }).click();
    await expect(gallery.locator('[data-template-id]')).toHaveCount(1);
    await gallery.locator('[data-template-id="event"]').click();
    expect(await mjml(page)).toContain('Je réserve ma place');
  });
});
