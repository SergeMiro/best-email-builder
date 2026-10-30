import { test, expect } from '@playwright/test';

/**
 * The builder in NARROW boxes: a phone (390 px) and a tablet (900 px).
 * The layout is measured on the builder's own width (`useLayoutWidth`); these
 * tests drive it like a user, with taps, and only read the MJML.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=builder--interface&mode=preview';
const mjml = (page) => page.evaluate(() => window.__emailEditor.exportMjml());

async function openBuilder(page) {
  await page.goto(STORY);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

test.describe('Phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the canvas takes the width; blocks and properties open in drawers', async ({ page }) => {
    await openBuilder(page);
    const builder = page.getByTestId('email-builder');
    await expect(builder).toHaveAttribute('data-layout', 'narrow');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    const frame = await page.locator('.eb-canvas-frame').boundingBox();
    expect(frame.width).toBeGreaterThan(340);

    // Blocks: a drawer; a tap adds the block and opens its properties.
    await expect(page.locator('[data-block-id="heading"]')).toBeHidden();
    await page.getByRole('button', { name: 'Add a block' }).tap();
    const blocks = page.getByTestId('eb-blocks-drawer');
    await expect(blocks).toHaveAttribute('data-open', 'true');
    await blocks.locator('[data-block-id="heading"]').tap();
    await expect(blocks).toHaveAttribute('data-open', 'false');
    const drawer = page.getByTestId('eb-properties-drawer');
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await expect(drawer.getByRole('heading', { name: 'Text' })).toBeVisible();

    // One header, whose button closes the drawer (the element stays selected).
    await drawer.getByRole('button', { name: 'Close' }).tap();
    await expect(drawer).toHaveAttribute('data-open', 'false');
    // Its size: in the ribbon above the canvas.
    const size = page.getByTestId('eb-ribbon').locator('[data-control="font-size"]');
    await size.fill('30');
    await size.press('Enter');
    await expect.poll(() => mjml(page)).toContain('font-size="30px"');
    await expect(page.getByRole('button', { name: 'Edit: Text' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit: Text' }).tap();
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveAttribute('data-open', 'false');
  });

  test('saving without a name opens the settings where the name is missing', async ({ page }) => {
    await openBuilder(page);
    await page.getByRole('button', { name: 'Save' }).tap();
    const drawer = page.getByTestId('eb-properties-drawer');
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await expect(drawer.getByText('Name is required')).toBeVisible();
  });

  test('the toolbar actions scroll sideways and their dialogs fit the screen', async ({ page }) => {
    await openBuilder(page);
    const templates = page.getByRole('button', { name: 'Templates' });
    await templates.scrollIntoViewIfNeeded();
    await templates.tap();
    const gallery = page.getByTestId('eb-template-gallery');
    await expect(gallery.locator('[data-template-id]')).toHaveCount(6);
    const box = await gallery.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await gallery.locator('[data-template-id="promotion"]').tap();
    expect(await mjml(page)).toContain('SPRING30');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});

test.describe('Tablet', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('blocks stay beside the canvas, properties open in a drawer', async ({ page }) => {
    await openBuilder(page);
    await expect(page.getByTestId('email-builder')).toHaveAttribute('data-layout', 'medium');
    await expect(page.getByRole('button', { name: 'Add a block' })).toHaveCount(0);
    await page.locator('[data-block-id="button"]').click();
    const drawer = page.getByTestId('eb-properties-drawer');
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await expect(drawer.getByRole('heading', { name: 'Button' })).toBeVisible();
    await page.mouse.click(260, 400);
    await expect(drawer).toHaveAttribute('data-open', 'false');
    expect(await mjml(page)).toContain('<mj-button');
  });
});
