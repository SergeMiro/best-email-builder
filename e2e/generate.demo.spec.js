import { test, expect } from '@playwright/test';

/**
 * THE AI in the static demo: OpenRouter with the visitor's own key, asked by
 * the builder's Connect dialog (`createAi({ provider: 'openrouter', askKey: true })`).
 * OpenRouter is answered by `page.route` — nothing leaves the machine; the
 * test checks what the browser would have sent.
 */

const HOME = '/best-email-builder/';
const API = 'https://openrouter.ai/api/v1/chat/completions';
const KEY = 'sk-or-test-0000';
const STORED = 'best-email-builder:ai-key:openrouter';

const DRAFT = {
  name: 'Autumn sale',
  subject: 'Autumn sale: 20% off everything',
  preheader: 'Three days only, from Friday.',
  mjml: `<mjml><mj-body width="600px"><mj-section padding-top="32px" padding-bottom="32px"><mj-column>
<mj-text font-family="Arial, sans-serif" font-size="28px">Autumn sale</mj-text>
<mj-button href="https://example.com" font-family="Arial, sans-serif">Shop now</mj-button>
<mj-text font-family="Arial, sans-serif" font-size="12px"><a href="{{ unsubscribe }}">Unsubscribe</a></mj-text>
</mj-column></mj-section></mj-body></mjml>`,
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };

/** A chat completion whose text is `content`. */
const completion = (content) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ id: 'gen-test', model: 'openrouter/free', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }),
});
const refused = { status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'No auth credentials found', code: 401 } }) };

/** Answers OpenRouter with `reply(request)`; returns the requests seen. */
async function fakeOpenRouter(page, reply) {
  const seen = [];
  await page.route(API, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ headers: request.headers(), body: request.postDataJSON() });
    return route.fulfill({ headers: CORS, ...reply(request) });
  });
  return seen;
}

async function openEditor(page, lang = 'en') {
  await page.goto(`${HOME}?lang=${lang}#/editor/new`);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

async function generateSale(page, label = 'Generate') {
  await page.getByRole('button', { name: label, exact: true }).click();
  const box = page.getByTestId('eb-generate');
  await box.locator('[data-purpose="sale"]').click();
  await box.getByTestId('eb-generate-submit').click();
  return box;
}

const connect = (page) => page.getByTestId('eb-ai-connect');

test('without a key: the Connect dialog asks for an OpenRouter key; Cancel explains it, nothing is sent', async ({ page }) => {
  const seen = await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  // The page only: the canvas frame shares its storage, and would put the key back.
  await page.addInitScript(() => window === window.top && localStorage.setItem('best-email-builder-demo:anthropic-key', 'sk-ant-old'));
  await openEditor(page);
  await expect(page.getByTestId('demo-ai-note')).toContainText('your own OpenRouter key');
  await expect(page.getByTestId('demo-ai-note').getByRole('button', { name: 'Forget my key' })).toBeHidden();
  // The key of the demo's Anthropic days is no longer kept.
  expect(await page.evaluate(() => localStorage.getItem('best-email-builder-demo:anthropic-key'))).toBeNull();

  const box = await generateSale(page);
  const dialog = connect(page);
  await expect(dialog.getByRole('heading', { name: 'Connect OpenRouter' })).toBeVisible();
  await expect(dialog).toContainText('The AI writes with your own OpenRouter key.');
  await expect(dialog.getByText('Free models, with a free account')).toBeVisible();
  await expect(dialog.getByText('The key stays in this browser and is sent only to OpenRouter.')).toBeVisible();
  const getKey = dialog.getByRole('link', { name: 'Get a key' });
  await expect(getKey).toHaveAttribute('href', 'https://openrouter.ai/keys');
  await expect(getKey).toHaveAttribute('target', '_blank');

  // The field: focused, hidden by default, shown on demand; Connect waits for a key.
  const field = dialog.getByLabel('API key');
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toHaveAttribute('placeholder', 'sk-or-…');
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeDisabled();
  await field.fill('gsk_not-openrouter');
  await expect(dialog.getByText('OpenRouter keys usually start with sk-or-.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Show the key' }).click();
  await expect(field).toHaveAttribute('type', 'text');
  await dialog.getByRole('button', { name: 'Hide the key' }).click();
  await expect(field).toHaveAttribute('type', 'password');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(box.getByRole('alert')).toHaveText('Connect an AI provider first: it needs a key.');
  expect(seen).toHaveLength(0);
  expect(await page.evaluate((slot) => localStorage.getItem(slot), STORED)).toBeNull();
});

test('with a key: OpenRouter is asked from the browser, the email opens in the editor; the key can be forgotten', async ({ page }) => {
  const seen = await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page);
  const box = await generateSale(page);
  await connect(page).getByLabel('API key').fill(KEY);
  await page.keyboard.press('Enter');
  await expect(connect(page)).toBeHidden();
  await expect(box).toBeHidden({ timeout: 30_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Autumn sale', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue(DRAFT.subject);

  // One request, straight to OpenRouter, with the visitor's key.
  expect(seen).toHaveLength(1);
  const [{ headers, body }] = seen;
  expect(headers.authorization).toBe(`Bearer ${KEY}`);
  expect(headers['x-title']).toBe('Best Email Builder');
  expect(body.model).toBe('openrouter/free');
  expect(body.response_format.type).toBe('json_schema');
  expect(body.response_format.json_schema.schema.required).toEqual(['name', 'subject', 'preheader', 'mjml']);
  expect(body.messages[0].role).toBe('system');
  expect(body.messages[1].content).toContain('sale');

  // Kept for the next generation, until the visitor forgets it.
  expect(await page.evaluate((slot) => localStorage.getItem(slot), STORED)).toBe(KEY);
  const forget = page.getByTestId('demo-ai-note').getByRole('button', { name: 'Forget my key' });
  await expect(forget).toBeVisible();
  await forget.click();
  await expect(forget).toBeHidden();
  expect(await page.evaluate((slot) => localStorage.getItem(slot), STORED)).toBeNull();
});

test('a key OpenRouter refuses: the dialog asks again and says so; a good key finishes the email', async ({ page }) => {
  const seen = await fakeOpenRouter(page, (request) =>
    request.headers().authorization === 'Bearer sk-or-good' ? completion(JSON.stringify(DRAFT)) : refused
  );
  await openEditor(page);
  const box = await generateSale(page);
  await connect(page).getByLabel('API key').fill('sk-or-wrong');
  await connect(page).getByRole('button', { name: 'Connect' }).click();

  await expect(connect(page).getByRole('alert')).toHaveText('OpenRouter refused the last key. Paste another one.');
  await expect(connect(page).getByLabel('API key')).toHaveValue('');
  expect(await page.evaluate((slot) => localStorage.getItem(slot), STORED)).toBeNull();
  await connect(page).getByLabel('API key').fill('sk-or-good');
  await connect(page).getByRole('button', { name: 'Connect' }).click();
  await expect(box).toBeHidden({ timeout: 30_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Autumn sale', { exact: true })).toBeVisible();
  expect(seen.map((request) => request.headers.authorization)).toEqual(['Bearer sk-or-wrong', 'Bearer sk-or-good']);
});

test('rewrite with AI: the same key, no second question, the selected text replaced', async ({ page }) => {
  const seen = await fakeOpenRouter(page, (request) => {
    const rewriting = request.postDataJSON().messages[1].content.includes('<text>');
    return completion(JSON.stringify(rewriting ? { text: 'Big autumn sale' } : DRAFT));
  });
  await openEditor(page);
  const box = await generateSale(page);
  await connect(page).getByLabel('API key').fill(KEY);
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden({ timeout: 30_000 });

  const canvas = page.frameLocator('.eb-canvas-frame');
  await canvas.getByText('Autumn sale', { exact: true }).click();
  await page.getByTestId('eb-rewrite').getByRole('button', { name: 'Shorter', exact: true }).click();
  await expect(canvas.getByText('Big autumn sale', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(connect(page)).toBeHidden();

  expect(seen).toHaveLength(2);
  const { headers, body } = seen[1];
  expect(headers.authorization).toBe(`Bearer ${KEY}`);
  expect(body.response_format.json_schema.name).toBe('rewrite');
  expect(body.response_format.json_schema.schema.required).toEqual(['text']);
  expect(body.messages[1].content).toContain('<text>\nAutumn sale\n</text>');
});

test('in French: the Connect dialog and its texts', async ({ page }) => {
  await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page, 'fr');
  const box = await generateSale(page, 'Générer');
  const dialog = connect(page);
  await expect(dialog.getByRole('heading', { name: 'Connecter OpenRouter' })).toBeVisible();
  await expect(dialog.getByText('Modèles gratuits, avec un compte gratuit')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Obtenir une clé' })).toBeVisible();
  await expect(dialog.getByText("La clé reste dans ce navigateur et n'est envoyée qu'à OpenRouter.")).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(box.getByRole('alert')).toHaveText("Connectez d'abord un fournisseur d'IA : il faut une clé.");
});
