import { test, expect } from '@playwright/test';

/**
 * THE AI in the static demo: the visitor's own key, with the provider they
 * choose in the builder's Connect dialog
 * (`createAi({ provider: ['openai', claude, 'mistral', 'gemini', 'openrouter'], askKey: true })`).
 * The providers are answered by `page.route` — nothing leaves the machine; the
 * tests check what the browser would have sent.
 */

const HOME = '/best-email-builder/';
const API = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';
const ANTHROPIC = 'https://api.anthropic.com/v1/messages*';
const KEY = 'sk-or-test-0000';
const STORED = 'best-email-builder:ai-key:openrouter';
const CHOICE = 'best-email-builder:ai-provider';

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

/** Answers `url` with `reply(request)`; returns the requests seen. */
async function fakeApi(page, url, reply) {
  const seen = [];
  await page.route(url, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() });
    return route.fulfill({ headers: CORS, ...reply(request) });
  });
  return seen;
}
const fakeOpenRouter = (page, reply) => fakeApi(page, API, reply);

/** Claude's answer, as the event stream the Anthropic SDK reads. */
const claudeStream = (text) => {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 100 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return { status: 200, contentType: 'text/event-stream', body: events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('') };
};

async function openEditor(page, lang = 'en') {
  await page.goto(`${HOME}?lang=${lang}#/editor/new`);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

/** A new email, in a page loaded afresh; the draft of the last one is not resumed. */
async function reopenEditor(page) {
  await page.goto('about:blank');
  await page.goto(`${HOME}?lang=en#/editor/new`);
  const startOver = page.getByRole('button', { name: 'Start over' });
  await expect(startOver.or(page.locator('[data-testid="email-builder"][data-status="ready"]'))).toBeVisible({ timeout: 60_000 });
  if (await startOver.isVisible()) await startOver.click();
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
/** A provider of the Connect dialog: its card, named by the provider first. */
const providerCard = (page, name) => connect(page).getByRole('radio', { name: new RegExp(`^${name}`) });
const choose = (page, name) => providerCard(page, name).click();
const stored = (page, slot) => page.evaluate((slot) => localStorage.getItem(slot), slot);

test('without a key: the Connect dialog offers five providers and asks for a key; Cancel explains it, nothing is sent', async ({ page }) => {
  const seen = await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  // The page only: the canvas frame shares its storage, and would put the key back.
  await page.addInitScript(() => window === window.top && localStorage.setItem('best-email-builder-demo:anthropic-key', 'sk-ant-old'));
  await openEditor(page);
  const note = page.getByTestId('demo-ai-note');
  await expect(note).toContainText('your own key: OpenAI, Claude, Mistral, Gemini or OpenRouter.');
  await expect(note).not.toContainText('Connected to');
  await expect(note.getByRole('button', { name: 'Forget my key' })).toBeHidden();
  // The key of the demo's Anthropic days is no longer kept.
  expect(await page.evaluate(() => localStorage.getItem('best-email-builder-demo:anthropic-key'))).toBeNull();

  const box = await generateSale(page);
  const dialog = connect(page);
  await expect(dialog.getByLabel('API key')).toBeFocused();
  // Five providers, the first one chosen; the free ones say so.
  const choices = dialog.getByRole('radiogroup', { name: 'AI provider' }).getByRole('radio');
  await expect(choices).toHaveCount(5);
  for (const [at, name] of ['OpenAI', 'Claude', 'Mistral', 'Google Gemini', 'OpenRouter'].entries()) {
    await expect(choices.nth(at)).toContainText(name);
  }
  await expect(providerCard(page, 'OpenAI')).toHaveAttribute('aria-checked', 'true');
  await expect(providerCard(page, 'OpenAI')).toContainText('gpt-5-mini');
  await expect(providerCard(page, 'Claude')).toContainText('claude-opus-5-5');
  await expect(providerCard(page, 'Google Gemini').getByLabel('Free tier, with rate limits')).toBeAttached();
  await expect(providerCard(page, 'OpenAI').getByLabel('Free tier, with rate limits')).toHaveCount(0);
  await expect(dialog.getByRole('heading', { name: 'Connect OpenAI' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Get a key' })).toHaveAttribute('href', 'https://platform.openai.com/api-keys');

  // The arrows move through them, as in any radio group.
  await providerCard(page, 'OpenAI').focus();
  await page.keyboard.press('ArrowRight');
  await expect(providerCard(page, 'Claude')).toHaveAttribute('aria-checked', 'true');
  await expect(providerCard(page, 'Claude')).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Connect Claude' })).toBeVisible();
  await page.keyboard.press('End');
  await expect(providerCard(page, 'OpenRouter')).toHaveAttribute('aria-checked', 'true');
  await expect(providerCard(page, 'OpenAI')).toHaveAttribute('aria-checked', 'false');

  await expect(dialog.getByRole('heading', { name: 'Connect OpenRouter' })).toBeVisible();
  await expect(dialog).toContainText('The AI writes with your own OpenRouter key.');
  await expect(dialog.getByText('Free models, with a free account')).toBeVisible();
  await expect(dialog.getByText('The key stays in this browser and is sent only to OpenRouter.')).toBeVisible();
  const getKey = dialog.getByRole('link', { name: 'Get a key' });
  await expect(getKey).toHaveAttribute('href', 'https://openrouter.ai/keys');
  await expect(getKey).toHaveAttribute('target', '_blank');

  // The field: hidden by default, shown on demand; Connect waits for a key.
  const field = dialog.getByLabel('API key');
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
  expect(await stored(page, STORED)).toBeNull();
  // Looking is not choosing: the choice is kept on Connect only.
  expect(await stored(page, CHOICE)).toBeNull();
});

test('with a key: OpenRouter is asked from the browser, the email opens in the editor; the key can be forgotten', async ({ page }) => {
  const seen = await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page);
  const box = await generateSale(page);
  await choose(page, 'OpenRouter');
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

  // Kept for the next generation, with the choice, until the visitor forgets it.
  expect(await stored(page, STORED)).toBe(KEY);
  expect(await stored(page, CHOICE)).toBe('openrouter');
  await expect(page.getByTestId('demo-ai-note')).toContainText('Connected to OpenRouter.');
  const forget = page.getByTestId('demo-ai-note').getByRole('button', { name: 'Forget my key' });
  await expect(forget).toBeVisible();
  await forget.click();
  await expect(forget).toBeHidden();
  await expect(page.getByTestId('demo-ai-note')).not.toContainText('Connected to');
  expect(await stored(page, STORED)).toBeNull();
});

test('a key OpenRouter refuses: the dialog asks again and says so; a good key finishes the email', async ({ page }) => {
  const seen = await fakeOpenRouter(page, (request) =>
    request.headers().authorization === 'Bearer sk-or-good' ? completion(JSON.stringify(DRAFT)) : refused
  );
  await openEditor(page);
  const box = await generateSale(page);
  await choose(page, 'OpenRouter');
  await connect(page).getByLabel('API key').fill('sk-or-wrong');
  await connect(page).getByRole('button', { name: 'Connect' }).click();

  await expect(connect(page).getByRole('alert')).toHaveText('OpenRouter refused the last key. Paste another one.');
  await expect(connect(page).getByLabel('API key')).toHaveValue('');
  expect(await stored(page, STORED)).toBeNull();
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
  await choose(page, 'OpenRouter');
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
  await expect(dialog.getByRole('radiogroup', { name: "Fournisseur d'IA" })).toBeVisible();
  await choose(page, 'OpenRouter');
  await expect(dialog.getByRole('heading', { name: 'Connecter OpenRouter' })).toBeVisible();
  await expect(dialog.getByText('Modèles gratuits, avec un compte gratuit')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Obtenir une clé' })).toBeVisible();
  await expect(dialog.getByText("La clé reste dans ce navigateur et n'est envoyée qu'à OpenRouter.")).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(box.getByRole('alert')).toHaveText("Connectez d'abord un fournisseur d'IA : il faut une clé.");
});

test('Gemini, then Mistral: each provider its own key; the choice is remembered; "Change provider" in the note', async ({ page }) => {
  const gemini = await fakeApi(page, GEMINI, () => completion(JSON.stringify(DRAFT)));
  const mistral = await fakeApi(page, MISTRAL, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page);
  let box = await generateSale(page);
  await choose(page, 'Google Gemini');
  await expect(connect(page).getByLabel('API key')).toHaveAttribute('placeholder', 'AIza…');
  await expect(connect(page).getByText('Free tier, with rate limits', { exact: true })).toBeVisible();
  await expect(connect(page).getByRole('link', { name: 'Get a key' })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');
  await connect(page).getByLabel('API key').fill('AIza-test-gemini');
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden({ timeout: 30_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Autumn sale', { exact: true })).toBeVisible();

  // Gemini's OpenAI-compatible endpoint, with Gemini's key.
  expect(gemini).toHaveLength(1);
  expect(gemini[0].headers.authorization).toBe('Bearer AIza-test-gemini');
  expect(gemini[0].body.model).toBe('gemini-3.5-flash-lite');
  expect(gemini[0].body.messages[1].content).toContain('sale');
  expect(await stored(page, 'best-email-builder:ai-key:gemini')).toBe('AIza-test-gemini');
  expect(await stored(page, CHOICE)).toBe('gemini');
  const note = page.getByTestId('demo-ai-note');
  await expect(note).toContainText('Connected to Google Gemini.');

  // Back later: the same provider, its key, no question.
  await reopenEditor(page);
  box = await generateSale(page);
  await expect(box).toBeHidden({ timeout: 30_000 });
  expect(gemini).toHaveLength(2);

  // "Change provider": Gemini in use, its key saved; Mistral needs its own.
  await note.getByRole('button', { name: 'Change provider' }).click();
  const dialog = connect(page);
  await expect(providerCard(page, 'Google Gemini')).toHaveAttribute('aria-checked', 'true');
  await expect(providerCard(page, 'Google Gemini').getByLabel('Key saved')).toBeAttached();
  await expect(dialog.getByText('A key for Google Gemini is saved in this browser: Connect uses it, or paste another one.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeEnabled();
  await choose(page, 'Mistral');
  await expect(providerCard(page, 'Mistral').getByLabel('Key saved')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Connect' })).toBeDisabled();
  await dialog.getByLabel('API key').fill('mistral-test-key');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toContainText('Connected to Mistral.');
  expect(await stored(page, CHOICE)).toBe('mistral');
  // Gemini's key stays, for coming back to it.
  expect(await stored(page, 'best-email-builder:ai-key:gemini')).toBe('AIza-test-gemini');

  // The next email: Mistral.
  await reopenEditor(page);
  box = await generateSale(page);
  await expect(box).toBeHidden({ timeout: 30_000 });
  expect(mistral).toHaveLength(1);
  expect(mistral[0].headers.authorization).toBe('Bearer mistral-test-key');
  expect(mistral[0].body.model).toBe('mistral-small-latest');
  expect(gemini).toHaveLength(2);

  // Back to Gemini with the key it keeps: nothing to paste.
  await note.getByRole('button', { name: 'Change provider' }).click();
  await choose(page, 'Google Gemini');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toContainText('Connected to Google Gemini.');
  expect(await stored(page, CHOICE)).toBe('gemini');
});

test('Claude: the Anthropic SDK in the browser; a refused key is asked again; the email is written', async ({ page }) => {
  const seen = await fakeApi(page, ANTHROPIC, (request) =>
    request.headers()['x-api-key'] === 'sk-ant-good'
      ? claudeStream(JSON.stringify(DRAFT))
      : { status: 401, contentType: 'application/json', body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) }
  );
  await openEditor(page);
  const box = await generateSale(page);
  await choose(page, 'Claude');
  await expect(connect(page).getByLabel('API key')).toHaveAttribute('placeholder', 'sk-ant-…');
  await expect(connect(page).getByRole('link', { name: 'Get a key' })).toHaveAttribute('href', 'https://console.anthropic.com/settings/keys');
  await connect(page).getByLabel('API key').fill('sk-ant-wrong');
  await page.keyboard.press('Enter');

  await expect(connect(page).getByRole('alert')).toHaveText('Claude refused the last key. Paste another one.');
  await expect(providerCard(page, 'Claude')).toHaveAttribute('aria-checked', 'true');
  expect(await stored(page, 'best-email-builder:ai-key:anthropic')).toBeNull();
  await connect(page).getByLabel('API key').fill('sk-ant-good');
  await page.keyboard.press('Enter');
  await expect(box).toBeHidden({ timeout: 30_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Autumn sale', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue(DRAFT.subject);
  await expect(page.getByTestId('demo-ai-note')).toContainText('Connected to Claude.');

  // Straight to Anthropic, the key in its own header, the answer streamed as structured output.
  expect(seen.map((request) => request.headers['x-api-key'])).toEqual(['sk-ant-wrong', 'sk-ant-good']);
  const { headers, body } = seen[1];
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(headers.authorization).toBeUndefined();
  expect(body.model).toBe('claude-opus-5-5');
  expect(body.stream).toBe(true);
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.output_config.format.schema.required).toEqual(['name', 'subject', 'preheader', 'mjml']);
  expect(body.system).toBeTruthy();
  expect(JSON.stringify(body.messages)).toContain('sale');
});
