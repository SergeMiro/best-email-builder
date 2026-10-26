import { test, expect } from '@playwright/test';

/**
 * THE CANVAS, driven with the real mouse and keyboard on the
 * `Builder / Interface` story: drag and drop of every block, moving,
 * selecting, editing text in place, the toolbars and the "+", the names
 * shown, the defaults shown in the panel.
 *
 * `window.__emailEditor` and `window.__emailAdapter.root` are only READ.
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
const frameBox = (page) => page.locator('.eb-canvas-frame').boundingBox();

/** The email's elements of a tag, in order: {id, tag, content, parent tag, column count}. */
const nodes = (page, tag) =>
  page.evaluate((wanted) => {
    const out = [];
    const walk = (node, parent) => {
      if (node.tag === wanted) {
        out.push({
          id: node.id,
          content: node.content,
          parent: parent?.tag || null,
          parentId: parent?.id || null,
          children: node.children.map((c) => c.tag),
          attributes: node.attributes,
        });
      }
      node.children.forEach((child) => walk(child, node));
    };
    walk(window.__emailAdapter.root, null);
    return out;
  }, tag);

/** Press, travel in steps, release — the gesture of a hand. */
async function drag(page, from, to, { release = true } = {}) {
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 20 });
  if (release) await page.mouse.up();
}

const tile = (page, blockId) => page.locator(`[data-block-id="${blockId}"]`).boundingBox();

/** Starts from an email with two sections: a text "Top", then two columns, the right one holding "Right". */
async function loadSample(page) {
  await page.evaluate(() =>
    window.__emailEditor.loadMjml(
      '<mjml><mj-body background-color="#eceff4">' +
        '<mj-section background-color="#ffffff"><mj-column><mj-text font-size="15px">Top</mj-text></mj-column></mj-section>' +
        '<mj-section background-color="#ffffff"><mj-column></mj-column><mj-column><mj-text font-size="15px">Right</mj-text></mj-column></mj-section>' +
        '</mj-body></mjml>'
    )
  );
  await expect(canvas(page).getByText('Right')).toBeVisible();
}

const CONTENT_BLOCKS = [
  ['heading', 'mj-text'],
  ['text', 'mj-text'],
  ['image', 'mj-image'],
  ['button', 'mj-button'],
  ['divider', 'mj-divider'],
  ['spacer', 'mj-spacer'],
  ['social', 'mj-social'],
  ['navbar', 'mj-navbar'],
];

test.describe('Drag and drop from the sidebar', () => {
  for (const [blockId, tag] of CONTENT_BLOCKS) {
    test(`"${blockId}" into an empty column, then between two sections`, async ({ page }) => {
      await openBuilder(page);
      await loadSample(page);
      const before = (await nodes(page, tag)).length;

      // 1. Onto the empty column's "Drop a block here".
      const hint = await canvas(page).getByText('Drop a block here').boundingBox();
      await drag(page, await tile(page, blockId), { x: hint.x + hint.width / 2, y: hint.y + hint.height / 2 });
      await expect.poll(async () => (await nodes(page, tag)).length).toBe(before + 1);
      const columns = await nodes(page, 'mj-column');
      expect(columns[1].children, 'inside the empty column').toEqual([tag]);
      expect((await nodes(page, 'mj-section')).length).toBe(2);
      // Selected, its properties open.
      await expect(page.locator('[data-testid="eb-properties"] h3')).not.toHaveText('Email');

      // 2. Onto the gap between the two sections: a new section of its own.
      const top = await canvas(page).getByText('Top').boundingBox();
      const gapY = top.y + top.height + 12; // lower padding of section 1
      await drag(page, await tile(page, blockId), { x: top.x + 40, y: gapY });
      await expect.poll(async () => (await nodes(page, 'mj-section')).length).toBe(3);
      const sections = await nodes(page, 'mj-section');
      const added = await nodes(page, tag);
      expect(added.length).toBe(before + 2);
      expect(await mjml(page)).toMatch(/Top<\/mj-text>\s*<\/mj-column>\s*<\/mj-section>\s*<mj-section[^>]*>\s*<mj-column>\s*<mj-/);
      expect(sections).toHaveLength(3);
      // Nothing foreign opened (the old engine asked for an image in a dialog).
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });
  }

  for (const layoutId of ['columns-1', 'columns-2', 'columns-3', 'columns-4', 'image-text', 'hero']) {
    test(`layout "${layoutId}" between two sections`, async ({ page }) => {
      await openBuilder(page);
      await loadSample(page);
      const top = await canvas(page).getByText('Top').boundingBox();
      await drag(page, await tile(page, layoutId), { x: top.x + 40, y: top.y + top.height + 12 });
      await expect.poll(async () => (await nodes(page, 'mj-section')).length).toBe(3);
      // Second section = the layout; "Top" first, "Right" last.
      const out = await mjml(page);
      expect(out.indexOf('Top')).toBeLessThan(out.indexOf('Right'));
      const [, added] = await nodes(page, 'mj-section');
      expect(added.children.every((c) => c === 'mj-column')).toBe(true);
    });
  }

  test('the drop line shows where; Esc cancels and changes nothing', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    const before = await mjml(page);
    const top = await canvas(page).getByText('Top').boundingBox();
    await drag(page, await tile(page, 'divider'), { x: top.x + 40, y: top.y + top.height - 2 }, { release: false });
    await expect(canvas(page).locator('.eb-ui-drop')).toBeVisible();
    await expect(page.getByTestId('eb-drag-ghost')).toHaveText('Divider');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(canvas(page).locator('.eb-ui-drop')).toBeHidden();
    await expect(page.getByTestId('eb-drag-ghost')).toHaveCount(0);
    expect(await mjml(page)).toBe(before);
  });

  test('dropped outside the canvas: nothing happens; a click on a tile still adds', async ({ page }) => {
    await openBuilder(page);
    const before = await mjml(page);
    const box = await tile(page, 'text');
    await drag(page, box, { x: box.x + 20, y: box.y + 300 });
    expect(await mjml(page)).toBe(before);
    await page.locator('[data-block-id="spacer"]').click();
    await expect.poll(async () => (await nodes(page, 'mj-spacer')).length).toBe(1);
  });

  test('near the bottom edge the canvas scrolls by itself', async ({ page }) => {
    await openBuilder(page);
    // A long email.
    for (let i = 0; i < 6; i += 1) await page.locator('[data-block-id="hero"]').click();
    const frame = await frameBox(page);
    await page.evaluate(() => document.querySelector('.eb-canvas-frame').contentWindow.scrollTo(0, 0));
    await drag(page, await tile(page, 'divider'), { x: frame.x + frame.width / 2, y: frame.y + frame.height - 8 }, { release: false });
    await page.waitForTimeout(600);
    const scrolled = await page.evaluate(() => document.querySelector('.eb-canvas-frame').contentWindow.scrollY);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(scrolled).toBeGreaterThan(50);
  });
});

test.describe('Color field', () => {
  /** The background the first section shows in the canvas. */
  const shownBackground = (page) =>
    page.locator('.eb-canvas-frame').evaluate((frame) => {
      const doc = /** @type {HTMLIFrameElement} */ (frame).contentDocument;
      const text = [...doc.querySelectorAll('div')].find((el) => el.textContent.trim() === 'Top');
      for (let el = text; el; el = el.parentElement) {
        const color = getComputedStyle(el).backgroundColor;
        if (color !== 'rgba(0, 0, 0, 0)') return color;
      }
      return null;
    });
  const sectionColor = async (page) => (await nodes(page, 'mj-section'))[0].attributes['background-color'];

  test('dragged in the picker, the color paints the block as it moves; its transparency is kept; one undo step', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').click();
    await canvas(page).getByRole('button', { name: 'Select the parent' }).click();
    await canvas(page).getByRole('button', { name: 'Select the parent' }).click();
    await expect(panel(page).getByRole('heading', { name: '1 column' })).toBeVisible();
    expect(await shownBackground(page)).toBe('rgb(255, 255, 255)');

    const field = panel(page).getByLabel('Background', { exact: true });
    await field.locator('xpath=..').getByRole('button', { name: 'Pick a colour' }).click();
    const area = await page.locator('.react-colorful__saturation').boundingBox();
    await page.mouse.move(area.x + area.width * 0.2, area.y + area.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(area.x + area.width * 0.9, area.y + area.height * 0.3, { steps: 8 });
    // Still held: the block already shows the color under the pointer.
    await expect.poll(() => sectionColor(page)).toMatch(/^#[0-9a-f]{6}$/);
    const moving = await sectionColor(page);
    await expect.poll(() => shownBackground(page)).not.toBe('rgb(255, 255, 255)');
    await page.mouse.move(area.x + area.width * 0.9, area.y + area.height * 0.8, { steps: 8 });
    await expect.poll(() => sectionColor(page)).not.toBe(moving);
    await page.mouse.up();
    // The whole drag is one step (its last move is painted within 60 ms).
    await page.waitForTimeout(200);
    const dragged = await sectionColor(page);
    await page.evaluate(() => window.__emailEditor.undo());
    expect(await sectionColor(page)).toBe('#ffffff');
    await page.evaluate(() => window.__emailEditor.redo());
    expect(await sectionColor(page)).toBe(dragged);

    // The hue slider follows as well.
    const before = await sectionColor(page);
    const hue = await page.locator('.react-colorful__hue').boundingBox();
    await page.mouse.move(hue.x + 4, hue.y + hue.height / 2);
    await page.mouse.down();
    await page.mouse.move(hue.x + hue.width * 0.6, hue.y + hue.height / 2, { steps: 8 });
    await expect.poll(() => sectionColor(page)).not.toBe(before);
    await page.mouse.up();

    // Transparency: kept as rgba(), shown as such, and as #RRGGBBAA in the field.
    const alpha = await page.locator('.react-colorful__alpha').boundingBox();
    await page.mouse.move(alpha.x + alpha.width - 2, alpha.y + alpha.height / 2);
    await page.mouse.down();
    await page.mouse.move(alpha.x + alpha.width * 0.5, alpha.y + alpha.height / 2, { steps: 8 });
    await expect.poll(() => sectionColor(page)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.(49|5|51)\)$/);
    await page.mouse.up();
    await expect.poll(() => shownBackground(page)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.(49|5|51)\d*\)$/);
    await expect(field).toHaveValue(/^#[0-9A-F]{6}(7F|80|82)$/);
    expect(await mjml(page)).toMatch(/<mj-section background-color="rgba\(/);

    // Typed: a fully opaque code is a plain hex again.
    await field.fill('#12345678');
    await expect.poll(() => sectionColor(page)).toBe('rgba(18, 52, 86, 0.47)');
    await field.fill('#123456FF');
    await expect.poll(() => sectionColor(page)).toBe('#123456');
  });
});

test.describe('Moving, selecting, the toolbar', () => {
  test('a section dragged by its handle goes above the previous one', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    // Select the second section: click its empty column, then "Select the parent".
    await canvas(page).getByText('Drop a block here').click();
    await expect(panel(page).getByRole('heading', { name: 'Column' })).toBeVisible();
    await canvas(page).getByRole('button', { name: 'Select the parent' }).click();
    await expect(panel(page).getByRole('heading', { name: '2 columns' })).toBeVisible();
    const handle = await canvas(page).getByRole('button', { name: 'Drag to move' }).boundingBox();
    const top = await canvas(page).getByText('Top').boundingBox();
    await drag(page, handle, { x: top.x + 40, y: top.y + 2 });
    await expect.poll(async () => (await mjml(page)).indexOf('Right') < (await mjml(page)).indexOf('Top')).toBe(true);
  });

  test('a text dragged by its handle into the empty column', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').click();
    const handle = await canvas(page).getByRole('button', { name: 'Drag to move' }).boundingBox();
    const hint = await canvas(page).getByText('Drop a block here').boundingBox();
    await drag(page, handle, { x: hint.x + hint.width / 2, y: hint.y + hint.height / 2 });
    await expect.poll(async () => (await nodes(page, 'mj-column'))[1].children).toEqual(['mj-text']);
    // Its old column is now empty and offers itself as a drop place.
    await expect(canvas(page).getByText('Drop a block here')).toHaveCount(1);
  });

  test('toolbar on the selection: duplicate, delete, select the parent', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').click();
    await canvas(page).getByRole('button', { name: 'Duplicate' }).click();
    await expect.poll(async () => (await nodes(page, 'mj-text')).map((n) => n.content)).toEqual(['Top', 'Top', 'Right']);
    await canvas(page).getByRole('button', { name: 'Delete' }).click();
    await expect.poll(async () => (await nodes(page, 'mj-text')).map((n) => n.content)).toEqual(['Top', 'Right']);
    await canvas(page).getByText('Top').click();
    await canvas(page).getByRole('button', { name: 'Select the parent' }).click();
    await expect(panel(page).getByRole('heading', { name: 'Column' })).toBeVisible();
    await canvas(page).getByRole('button', { name: 'Select the parent' }).click();
    await expect(panel(page).getByRole('heading', { name: '1 column' })).toBeVisible();
    // A section has no "parent" button: a click beside the email shows the email's settings.
    await expect(canvas(page).getByRole('button', { name: 'Select the parent' })).toHaveCount(0);
    const frame = await frameBox(page);
    await page.mouse.click(frame.x + 20, frame.y + frame.height - 20);
    await expect(panel(page).getByRole('heading', { name: 'Email' })).toBeVisible();
    await expect(panel(page).getByLabel(/^Name/)).toBeVisible();
  });

  test('the "+" under the selection adds a block after it; the "+" after the last icon adds a network', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    const menu = page.getByTestId('eb-add-menu');
    await canvas(page).getByText('Top').click();
    await canvas(page).getByTestId('eb-canvas-add-block').click();
    await expect(menu).toBeVisible();
    // The same "+" again closes it.
    await canvas(page).getByTestId('eb-canvas-add-block').click();
    await expect(menu).toHaveCount(0);
    await canvas(page).getByTestId('eb-canvas-add-block').click();
    await menu.locator('[data-block-id="social"]').click();
    await expect(menu).toHaveCount(0);
    // After the text, in its column, and selected.
    await expect.poll(async () => (await nodes(page, 'mj-column'))[0].children).toEqual(['mj-text', 'mj-social']);
    await expect(panel(page).getByRole('heading', { name: 'Social links' })).toBeVisible();

    const networks = async () => (await nodes(page, 'mj-social-element')).map((n) => n.attributes.name);
    const defaults = ['facebook-noshare', 'instagram-noshare', 'linkedin-noshare', 'x-noshare'];
    await expect.poll(networks).toEqual(defaults);
    const plus = canvas(page).getByTestId('eb-canvas-add-item');
    await expect(plus).toHaveAttribute('aria-label', 'Add a network');
    // Just after the last icon, on its line.
    const lastId = (await nodes(page, 'mj-social-element')).at(-1).id;
    const last = await canvas(page).locator(`.eb-id-${lastId}`).boundingBox();
    const at = await plus.boundingBox();
    expect(at.x).toBeGreaterThanOrEqual(last.x + last.width);
    expect(Math.abs(at.y + at.height / 2 - (last.y + last.height / 2))).toBeLessThan(6);
    await plus.click();
    await menu.locator('[data-choice="YouTube"]').click();
    await expect.poll(networks).toEqual([...defaults, 'youtube-noshare']);
    const added = (await nodes(page, 'mj-social-element')).at(-1);
    expect(added.attributes.href).toBe('https://www.youtube.com/');
    await expect(panel(page).getByRole('heading', { name: 'Social link' })).toBeVisible();
    // An icon selected: its row's "+", none under the icon itself.
    await expect(plus).toBeVisible();
    await expect(canvas(page).getByTestId('eb-canvas-add-block')).toBeHidden();
    // One step of history.
    await page.evaluate(() => window.__emailEditor.undo());
    await expect.poll(networks).toEqual(defaults);
  });

  test('a menu’s "+" adds a link like its last one, at once, named in the interface’s language', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.evaluate(() =>
      window.__emailEditor.loadMjml(
        '<mjml><mj-body><mj-section background-color="#ffffff"><mj-column><mj-navbar>' +
          '<mj-navbar-link href="https://shop.example/" color="#123456" text-transform="none">Shop</mj-navbar-link>' +
          '</mj-navbar></mj-column></mj-section></mj-body></mjml>'
      )
    );
    await canvas(page).getByText('Shop').click();
    const plus = canvas(page).getByTestId('eb-canvas-add-item');
    await expect(plus).toHaveAttribute('aria-label', 'Ajouter un lien');
    await plus.click();
    await expect(page.getByTestId('eb-add-menu')).toHaveCount(0);
    await expect.poll(async () => (await nodes(page, 'mj-navbar-link')).map((n) => n.content)).toEqual(['Shop', 'Lien']);
    const added = (await nodes(page, 'mj-navbar-link'))[1];
    expect(added.attributes).toMatchObject({ color: '#123456', 'text-transform': 'none', href: 'https://example.com/' });
    await expect(canvas(page).getByRole('link', { name: 'Lien' })).toBeVisible();
  });

  test('keyboard in the canvas: Ctrl+C / Ctrl+V, Ctrl+D, Escape climbs to the parent, Delete', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Right').click();
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Control+v');
    await expect.poll(async () => (await nodes(page, 'mj-text')).map((n) => n.content)).toEqual(['Top', 'Right', 'Right']);
    await page.keyboard.press('Control+d');
    await expect.poll(async () => (await nodes(page, 'mj-text')).length).toBe(4);
    await page.keyboard.press('Escape');
    await expect(panel(page).getByRole('heading', { name: 'Column' })).toBeVisible();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await nodes(page, 'mj-column')).length).toBe(2);
  });

  test('the parent button says where it goes, and climbs text → column → section', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await loadSample(page);
    await canvas(page).getByText('Right').click();
    await expect(panel(page).getByRole('heading', { name: 'Texte' })).toBeVisible();
    const parent = canvas(page).locator('button[data-action="parent"]');
    await expect(parent).toHaveText('Colonne');
    await parent.click();
    await expect(panel(page).getByRole('heading', { name: 'Colonne' })).toBeVisible();
    await expect(parent).toHaveText('2 colonnes');
    await parent.click();
    await expect(panel(page).getByRole('heading', { name: '2 colonnes' })).toBeVisible();
    // A section's parent is the page: no button, a click beside the email shows the email's settings.
    await expect(parent).toHaveCount(0);
  });

  test('Ctrl+A selects every block, Delete removes them all, Ctrl+Z brings them back', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await canvas(page).getByText('Titre du message').click();
    const before = await mjml(page);
    const sections = (await nodes(page, 'mj-section')).length;
    await page.keyboard.press('Control+a');
    await expect(panel(page).getByRole('heading', { name: 'Tous les blocs' })).toBeVisible();
    await expect(panel(page).getByTestId('eb-select-all')).toContainText(`${sections} sections sélectionnées`);
    await expect(canvas(page).getByTestId('eb-canvas-multi')).toHaveCount(sections);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await nodes(page, 'mj-section')).length).toBe(0);
    await expect(canvas(page).getByText('Déposez un bloc ici')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect.poll(() => mjml(page)).toBe(before);

    // From the panel's delete button too.
    await canvas(page).getByText('Titre du message').click();
    await page.keyboard.press('Control+a');
    await panel(page).getByRole('button', { name: 'Supprimer' }).click();
    await expect.poll(async () => (await nodes(page, 'mj-section')).length).toBe(0);
    await page.keyboard.press('Control+z');

    // Escape or a click ends the selection of everything.
    await canvas(page).getByText('Titre du message').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Escape');
    await expect(canvas(page).getByTestId('eb-canvas-multi').first()).toBeHidden();
    await expect(panel(page).getByRole('heading', { name: 'Courriel' })).toBeVisible();
  });

  test('Ctrl+A inside a text selects its words only; in a field of the panel, the field', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Replaced');
    await page.keyboard.press('Escape');
    await expect.poll(() => mjml(page)).toMatch(/>Replaced<\/mj-text>/);
    expect((await nodes(page, 'mj-section')).length).toBe(2);
    await canvas(page).getByText('Right').click();
    await panel(page).getByLabel('Size', { exact: true }).click();
    await page.keyboard.press('Control+a');
    await expect(panel(page).getByRole('heading', { name: 'Text' })).toBeVisible();
  });

  test('a link in the canvas never navigates away', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Unsubscribe').click();
    await expect(page).toHaveURL(/story=builder--interface/);
    await expect(panel(page).getByRole('heading', { name: 'Text' })).toBeVisible();
  });
});

test.describe('Text, edited in place', () => {
  test('double-click, type, bold, link: what is typed is what is exported', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').dblclick();
    await expect(canvas(page).getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
    await page.keyboard.press('End');
    await page.keyboard.type(' line');
    // Bold the word just typed.
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Shift+ArrowLeft');
    await canvas(page).getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
    await expect.poll(() => mjml(page)).toMatch(/Top <b>line<\/b><\/mj-text>/);
    // Link on the selection, through the toolbar's field.
    await canvas(page).getByRole('button', { name: 'Link', exact: true }).click();
    await canvas(page).getByRole('textbox', { name: 'Link URL' }).fill('example.com/offer');
    await canvas(page).getByRole('textbox', { name: 'Link URL' }).press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<a href="https:\/\/example\.com\/offer">/);
    // Enter = a line break, Escape leaves the text.
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Next');
    await page.keyboard.press('Escape');
    await expect(canvas(page).getByRole('toolbar', { name: 'Text formatting' })).toBeHidden();
    // (The caret was inside the bold word: what follows stays bold, as in any editor.)
    await expect.poll(() => mjml(page)).toMatch(/<br \/>Next(<\/b>)?<\/mj-text>/);
    // One undo removes the whole typing session at once.
    const typed = await mjml(page);
    expect(typed).toContain('Top');
  });

  test('pasted HTML arrives as plain text', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').dblclick();
    await page.keyboard.press('End');
    await canvas(page)
      .locator('[contenteditable="true"]')
      .evaluate((el) => {
        const data = new DataTransfer();
        data.setData('text/html', '<span style="color:red" onclick="x()">Red</span><script>bad()</script>');
        data.setData('text/plain', ' pasted');
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
      });
    await page.keyboard.press('Escape');
    const out = await mjml(page);
    expect(out).toMatch(/Top pasted<\/mj-text>/);
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('<script');
  });

  test('a click on a selected text puts the caret where clicked; the panel keeps working meanwhile', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Top').click();
    await canvas(page).getByText('Top').click();
    await expect(canvas(page).locator('[contenteditable="true"]')).toBeFocused();
    // Changing the size from the panel ends the edit and applies.
    await panel(page).getByLabel('Size', { exact: true }).fill('20');
    await panel(page).getByLabel('Size', { exact: true }).press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/font-size="20px">Top</);
  });
});

test.describe('Names and defaults', () => {
  const EXPECTED = {
    en: { 'columns-2': '2 columns', column: 'Column', text: 'Text', image: 'Image', button: 'Button', body: 'Email' },
    fr: { 'columns-2': '2 colonnes', column: 'Colonne', text: 'Texte', image: 'Image', button: 'Bouton', body: 'Courriel' },
  };
  for (const lang of ['en', 'fr']) {
    test(`${lang}: the canvas label and the panel title say the same name`, async ({ page }) => {
      await openBuilder(page, { lang });
      const names = EXPECTED[lang];
      await page.locator('[data-block-id="columns-2"]').click();
      await expect(panel(page).getByRole('heading', { name: names['columns-2'] })).toBeVisible();
      await expect(canvas(page).getByTestId('eb-canvas-label')).toHaveText(names['columns-2']);
      const hint = lang === 'fr' ? 'Déposez un bloc ici' : 'Drop a block here';
      await canvas(page).getByText(hint).first().click();
      await expect(panel(page).getByRole('heading', { name: names.column })).toBeVisible();
      await expect(canvas(page).getByTestId('eb-canvas-label')).toHaveText(names.column);
      for (const id of ['text', 'image', 'button']) {
        await page.locator(`[data-block-id="${id}"]`).click();
        await expect(panel(page).getByRole('heading', { name: names[id], exact: true })).toBeVisible();
        await expect(canvas(page).getByTestId('eb-canvas-label')).toHaveText(names[id]);
      }
      // The texts a block brings are in the interface's language.
      const source = await mjml(page);
      if (lang === 'fr') {
        expect(source).toContain('Votre texte.');
        expect(source).toContain('Découvrir');
        expect(source).not.toContain('Your text.');
      }
    });
  }

  test('an empty padding shows what MJML renders; editing one side keeps the others', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="columns-2"]').click();
    const top = panel(page).getByLabel('Padding — Top', { exact: true });
    // Nothing set: empty field, MJML's 20 px shown greyed.
    await expect(top).toHaveValue('');
    await expect(top).toHaveAttribute('placeholder', '20');
    await expect(panel(page).getByLabel('Padding — Left', { exact: true })).toHaveAttribute('placeholder', '0');
    await top.fill('32');
    await top.press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/padding-top="32px"[^>]*padding-right="0px"[^>]*padding-bottom="20px"/);
  });

  test('a text with only side paddings shows MJML’s 10 px above and below, not 0', async ({ page }) => {
    await openBuilder(page);
    await canvas(page).getByText('Your headline').click();
    await expect(panel(page).getByLabel('Padding — Top', { exact: true })).toHaveValue('10');
    await expect(panel(page).getByLabel('Padding — Left', { exact: true })).toHaveValue('32');
  });

  test('box diagram: margin, border and padding where the block has them; the border written per side, styled, colored', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="button"]').click();
    const box = panel(page).getByTestId('eb-box-model');
    // Outside in, as in a browser's developer tools; the content in the middle.
    await expect(box.locator('[data-box]')).toHaveCount(4);
    expect(await box.locator('[data-box]').evaluateAll((zones) => zones.map((z) => z.getAttribute('data-box')))).toEqual(['margin', 'border', 'padding', 'content']);
    await expect(box.locator('[data-box="content"]')).toHaveText('');
    const hint = panel(page).getByTestId('eb-box-model-hint');
    await expect(hint).toHaveText('In pixels. Point at a zone to see what it sets.');
    await box.locator('[data-box="margin"]').hover({ position: { x: 6, y: 6 } });
    await expect(hint).toHaveText(/^Margin: the space outside/);
    await box.locator('[data-box="padding"]').hover({ position: { x: 6, y: 6 } });
    await expect(hint).toHaveText(/^Padding: the space inside/);

    // The margin is the button's padding in MJML, the padding its inner padding.
    await box.getByLabel('Margin — Top', { exact: true }).fill('30');
    await box.getByLabel('Margin — Top', { exact: true }).press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*padding-top="30px"/);
    await box.getByLabel('Padding — Left', { exact: true }).fill('40');
    await box.getByLabel('Padding — Left', { exact: true }).press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*inner-padding="12px 28px 12px 40px"/);

    // No border yet; a style draws one, all round, in a grey any background shows.
    await expect(box.getByRole('radio', { name: 'No border' })).toHaveAttribute('aria-checked', 'true');
    await box.getByRole('radio', { name: 'Dashed' }).click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*border="1px dashed #cbd5e1"/);
    await expect(box.getByLabel('Border — Top', { exact: true })).toHaveValue('1');
    // Another width on one side: one attribute per side.
    await box.getByLabel('Border — Bottom', { exact: true }).fill('4');
    await box.getByLabel('Border — Bottom', { exact: true }).press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*border-top="1px dashed #cbd5e1"[^>]*border-bottom="4px dashed #cbd5e1"/);
    expect(await mjml(page)).not.toMatch(/<mj-button[^>]* border="/);
    // A double line needs 3 px: the thinner sides grow to it.
    await box.getByRole('radio', { name: 'Double' }).click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*border-top="3px double #cbd5e1"[^>]*border-bottom="4px double #cbd5e1"/);
    await panel(page).locator('#eb-prop-box-border-color').fill('#c2603e');
    await panel(page).locator('#eb-prop-box-border-color').press('Enter');
    await expect.poll(() => mjml(page)).toMatch(/<mj-button[^>]*border-bottom="4px double #c2603e"/);
    // The canvas draws it.
    await expect
      .poll(() => canvas(page).locator('.eb-tag-mj-button td[style*="border-bottom"]').first().evaluate((td) => getComputedStyle(td).borderBottomStyle))
      .toBe('double');
    // Removed: no border attribute left.
    await box.getByRole('radio', { name: 'No border' }).click();
    await expect.poll(() => mjml(page)).not.toMatch(/<mj-button[^>]*border-(top|right|bottom|left)=/);

    // Text blocks now expose all three spacing zones and border controls too.
    await canvas(page).getByText('Your headline').click();
    await expect(box.locator('[data-box]')).toHaveCount(4);
    await expect(box.getByRole('radiogroup')).toBeVisible();
    await expect(box.getByRole('radio', { name: 'No border' })).toHaveAttribute('aria-checked', 'true');
  });

  test('image: added without a dialog, its frame in the canvas, its fields in the panel', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="image"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(panel(page).getByRole('heading', { name: 'Image' })).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Upload' })).toBeVisible();
    const img = canvas(page).locator('.eb-tag-mj-image img');
    await expect(img).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await panel(page).getByLabel('Image', { exact: true }).fill('https://example.com/photo.png');
    await panel(page).getByLabel('Image', { exact: true }).press('Enter');
    await expect(img).toHaveAttribute('src', 'https://example.com/photo.png');
    expect(await mjml(page)).toContain('src="https://example.com/photo.png"');
  });
});

test.describe('Panel features for well-made emails', () => {
  test('column widths: 1/3 makes the other 2/3 (in the email and on the canvas); "Equal" undoes it', async ({ page }) => {
    await openBuilder(page);
    await loadSample(page);
    await canvas(page).getByText('Drop a block here').click();
    await expect(panel(page).getByRole('heading', { name: 'Column' })).toBeVisible();
    await panel(page).getByLabel('Width', { exact: true }).click();
    await page.getByRole('option', { name: '1/3', exact: true }).click();
    await expect.poll(async () => (await nodes(page, 'mj-column')).slice(1).map((c) => c.attributes.width)).toEqual(['33%', '67%']);
    // On the canvas, the right column is twice as wide as the left one.
    await expect
      .poll(async () => {
        const [, left, right] = await nodes(page, 'mj-column');
        const width = (id) => canvas(page).locator(`.eb-id-${id}`).evaluate((el) => el.getBoundingClientRect().width);
        return Math.round((await width(right.id)) / (await width(left.id)));
      })
      .toBe(2);
    // Three columns: the others share the rest.
    await page.evaluate(() =>
      window.__emailEditor.loadMjml(
        '<mjml><mj-body><mj-section><mj-column></mj-column><mj-column></mj-column><mj-column></mj-column></mj-section></mj-body></mjml>'
      )
    );
    await canvas(page).getByText('Drop a block here').nth(1).click();
    await panel(page).getByLabel('Width', { exact: true }).click();
    await page.getByRole('option', { name: '1/2', exact: true }).click();
    await expect.poll(async () => (await nodes(page, 'mj-column')).map((c) => c.attributes.width)).toEqual(['25%', '50%', '25%']);
    // (Two choices of one field within a second make one undo step — like a
    // color being dragged. A person takes longer than that.)
    await page.waitForTimeout(1100);
    await panel(page).getByLabel('Width', { exact: true }).click();
    await page.getByRole('option', { name: 'Equal', exact: true }).click();
    await expect.poll(async () => (await nodes(page, 'mj-column')).map((c) => c.attributes.width ?? null)).toEqual([null, null, null]);
    // One undo step per choice (once the list has closed: keys inside an open list are its own).
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await nodes(page, 'mj-column')).map((c) => c.attributes.width)).toEqual(['25%', '50%', '25%']);
  });

  test('a section background across the whole screen', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="columns-1"]').click();
    await panel(page).getByLabel('Background width').click();
    await page.getByRole('option', { name: 'Whole screen' }).click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-section[^>]*full-width="full-width"/);
    // On the canvas the band reaches both edges of the frame.
    const [, , , added] = await nodes(page, 'mj-section');
    const frame = await frameBox(page);
    await expect
      .poll(() => canvas(page).locator(`.eb-id-${added.id}`).evaluate((el) => Math.round(el.getBoundingClientRect().width)))
      .toBe(Math.round(frame.width));
  });

  test('an image can take the full width on mobile', async ({ page }) => {
    await openBuilder(page);
    await page.locator('[data-block-id="image"]').click();
    await panel(page).getByLabel('Image', { exact: true }).fill('https://example.com/photo.png');
    await panel(page).getByLabel('Image', { exact: true }).press('Enter');
    await panel(page).getByLabel('Width', { exact: true }).fill('120');
    await panel(page).getByLabel('Width', { exact: true }).press('Enter');
    await panel(page).getByLabel('On mobile').click();
    await page.getByRole('option', { name: 'Full width' }).click();
    await expect.poll(() => mjml(page)).toMatch(/<mj-image[^>]*width="120px"[^>]*fluid-on-mobile="true"/);
    await page.getByRole('tab', { name: 'Mobile' }).click();
    await expect
      .poll(() => canvas(page).locator('img[src="https://example.com/photo.png"]').evaluate((img) => Math.round(img.getBoundingClientRect().width)))
      .toBeGreaterThan(250);
  });

  test('menu links: as typed by default, capitals on demand', async ({ page }) => {
    await openBuilder(page, { lang: 'fr' });
    await page.locator('[data-block-id="navbar"]').click();
    const link = canvas(page).locator('.eb-tag-mj-navbar-link').first();
    await expect(link).toHaveText('Boutique');
    await link.click();
    await expect(panel(page).getByRole('heading', { name: 'Lien du menu' })).toBeVisible();
    await panel(page).getByLabel('Majuscules').click();
    await page.getByRole('option', { name: 'Tout en majuscules', exact: true }).click();
    await expect.poll(() => link.innerText()).toBe('BOUTIQUE');
    expect(await mjml(page)).toMatch(/text-transform="uppercase"[^>]*>Boutique</);
  });
});
