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

/** The lists of models the providers give (`GET …/models`), as they shape them. */
const MODELS = {
  'https://openrouter.ai/api/v1/models': {
    data: [
      { id: 'openai/gpt-5.5', name: 'OpenAI: GPT-5.5', created: 300, pricing: { prompt: '0.000002', completion: '0.00001' }, architecture: { output_modalities: ['text'] } },
      { id: 'google/lyria-3', name: 'Google: Lyria 3', created: 400, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['audio'] } },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA: Nemotron 3 Super (free)', created: 100, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
      { id: 'openrouter/free', name: 'Free Models Router', created: 50, pricing: { prompt: '0', completion: '0' }, architecture: { output_modalities: ['text'] } },
      { id: 'anthropic/claude-sonnet-5.5', name: 'Anthropic: Claude Sonnet 5.5', created: 200, pricing: { prompt: '0.000003', completion: '0.000015' }, architecture: { output_modalities: ['text'] } },
    ],
  },
  'https://generativelanguage.googleapis.com/v1beta/openai/models': {
    object: 'list',
    data: [
      { id: 'models/gemini-2.5-flash', object: 'model', display_name: 'Gemini 2.5 Flash' },
      { id: 'models/gemini-2.5-pro', object: 'model', display_name: 'Gemini 2.5 Pro' },
      { id: 'models/gemini-3.5-flash-lite', object: 'model', display_name: 'Gemini 3.5 Flash-Lite' },
      { id: 'models/gemini-2.5-flash-preview-tts', object: 'model', display_name: 'Gemini 2.5 Flash TTS' },
      { id: 'models/gemini-embedding-001', object: 'model', display_name: 'Gemini Embedding' },
    ],
  },
  'https://api.mistral.ai/v1/models': {
    data: [
      { id: 'mistral-small-latest', created: 1, capabilities: { completion_chat: true } },
      { id: 'mistral-large-latest', created: 2, capabilities: { completion_chat: true } },
      { id: 'mistral-embed', created: 3, capabilities: { completion_chat: false } },
    ],
  },
  'https://api.openai.com/v1/models': { data: [{ id: 'gpt-5-mini', created: 1 }, { id: 'gpt-5.5', created: 2 }, { id: 'whisper-1', created: 3 }] },
  'https://api.anthropic.com/v1/models': {
    data: [
      { type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-04-01T00:00:00Z' },
      { type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5', created_at: '2026-05-01T00:00:00Z' },
    ],
    has_more: false,
    first_id: 'claude-opus-5-5',
    last_id: 'claude-haiku-5-5',
  },
};

/**
 * Every provider's list of models, answered here — the dialog asks for it as
 * soon as it can (OpenRouter's without a key). Returns the requests seen.
 */
async function fakeModels(page) {
  const seen = [];
  await page.route(/\/models(\?.*)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-methods': 'GET' } });
    const url = request.url().replace(/\?.*$/, '');
    if (!MODELS[url]) return route.continue();
    seen.push({ url: request.url(), headers: request.headers() });
    return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(MODELS[url]) });
  });
  return seen;
}
test.beforeEach(({ page }) => fakeModels(page));
const modelField = (page) => connect(page).getByTestId('eb-ai-connect-model');
const modelStatus = (page) => connect(page).getByTestId('eb-ai-connect-models-status');
const modelList = (page) => connect(page).getByRole('listbox', { name: /^(Model|Modèle)$/ });

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
  // Always a new tab: this page and its dialog stay.
  await page.context().route('https://openrouter.ai/keys', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Keys</title>' }));
  const [tab] = await Promise.all([page.context().waitForEvent('page'), getKey.click()]);
  await tab.waitForURL('https://openrouter.ai/keys');
  await tab.close();
  await expect(dialog).toBeVisible();
  expect(page.url()).toContain('#/editor/new');

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
  await expect(page.getByTestId('demo-ai-note')).toContainText('Connected to OpenRouter · openrouter/free.');
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
  await expect(note).toContainText('Connected to Google Gemini · gemini-3.5-flash-lite.');

  // Back later: the same provider, its key, no question.
  await reopenEditor(page);
  box = await generateSale(page);
  await expect(box).toBeHidden({ timeout: 30_000 });
  expect(gemini).toHaveLength(2);

  // "Change provider": Gemini in use, its key saved; Mistral needs its own.
  await note.getByRole('button', { name: 'Change provider or model' }).click();
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
  await expect(note).toContainText('Connected to Mistral · mistral-small-latest.');
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
  await note.getByRole('button', { name: 'Change provider or model' }).click();
  await choose(page, 'Google Gemini');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toContainText('Connected to Google Gemini · gemini-3.5-flash-lite.');
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
  await expect(page.getByTestId('demo-ai-note')).toContainText('Connected to Claude · claude-opus-5-5.');

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

test('the model: Gemini lists its models once the key is pasted; the one chosen is sent, remembered, and shown', async ({ page }) => {
  const lists = await fakeModels(page);
  const gemini = await fakeApi(page, GEMINI, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page);
  let box = await generateSale(page);
  await choose(page, 'Google Gemini');
  const dialog = connect(page);
  // No key yet: the provider's own model, and how to see the others.
  await expect(modelField(page)).toContainText('gemini-3.5-flash-lite');
  await expect(modelField(page)).toContainText('Default');
  await expect(modelStatus(page)).toHaveText('Paste the key to see all the models of Google Gemini.');
  expect(lists.filter((request) => request.url.includes('googleapis'))).toHaveLength(0);

  await dialog.getByLabel('API key').fill('AIza-test-gemini-000000000');
  await expect(modelStatus(page)).toHaveText('3 models.');
  const asked = lists.filter((request) => request.url.includes('googleapis'));
  expect(asked).toHaveLength(1);
  expect(asked[0].headers.authorization).toBe('Bearer AIza-test-gemini-000000000');

  // The list opens in place: the default first, no speech nor embeddings.
  await modelField(page).click();
  await expect(modelField(page)).toHaveAttribute('aria-expanded', 'true');
  const search = dialog.getByRole('combobox', { name: 'Search the models' });
  await expect(search).toBeFocused();
  const options = modelList(page).getByRole('option');
  await expect(options).toHaveCount(3);
  await expect(options.first()).toContainText('Gemini 3.5 Flash-Lite');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(modelList(page)).not.toContainText('TTS');
  await expect(modelList(page)).not.toContainText('Embedding');
  // Esc closes the list, not the dialog.
  await page.keyboard.press('Escape');
  await expect(modelList(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(modelField(page)).toBeFocused();

  // Typed, then Enter: chosen, and the dialog still open.
  await modelField(page).click();
  await search.fill('pro');
  await expect(options).toHaveCount(2);
  await expect(options.nth(1)).toHaveText('Use “pro”');
  await page.keyboard.press('Enter');
  await expect(modelList(page)).toBeHidden();
  await expect(dialog).toBeVisible();
  await expect(modelField(page)).toContainText('gemini-2.5-pro');
  await expect(modelField(page)).not.toContainText('Default');
  await expect(providerCard(page, 'Google Gemini')).toContainText('gemini-2.5-pro');

  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(box).toBeHidden({ timeout: 30_000 });
  expect(gemini).toHaveLength(1);
  expect(gemini[0].body.model).toBe('gemini-2.5-pro');
  expect(await stored(page, 'best-email-builder:ai-model:gemini')).toBe('gemini-2.5-pro');
  const note = page.getByTestId('demo-ai-note');
  await expect(note).toContainText('Connected to Google Gemini · gemini-2.5-pro.');

  // Back later: the same model. Then a model the list does not have, by its id.
  await reopenEditor(page);
  box = await generateSale(page);
  await expect(box).toBeHidden({ timeout: 30_000 });
  expect(gemini[1].body.model).toBe('gemini-2.5-pro');
  await note.getByRole('button', { name: 'Change provider or model' }).click();
  await expect(modelStatus(page)).toHaveText('3 models.');
  await expect(modelField(page)).toContainText('gemini-2.5-pro');
  await modelField(page).click();
  await search.fill('gemini-9-ultra');
  await expect(options).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(modelField(page)).toContainText('gemini-9-ultra');
  await dialog.getByRole('button', { name: 'Connect' }).click();
  await expect(dialog).toBeHidden();
  await expect(note).toContainText('Connected to Google Gemini · gemini-9-ultra.');
  expect(await stored(page, 'best-email-builder:ai-model:gemini')).toBe('gemini-9-ultra');
});

test('the model: OpenRouter lists its models without a key, the free ones first, marked; "Free only"', async ({ page }) => {
  const lists = await fakeModels(page);
  const seen = await fakeOpenRouter(page, () => completion(JSON.stringify(DRAFT)));
  await openEditor(page);
  await generateSale(page);
  await choose(page, 'OpenRouter');
  await expect(modelStatus(page)).toHaveText('4 models, the free ones first.');
  const asked = lists.filter((request) => request.url.includes('openrouter'));
  expect(asked.length).toBeGreaterThan(0);
  expect(asked[0].headers.authorization).toBeUndefined();

  await modelField(page).click();
  const options = modelList(page).getByRole('option');
  // The default, the free ones, then the newest; no music.
  await expect(options).toHaveCount(4);
  await expect(options.nth(0)).toContainText('Free Models Router');
  await expect(options.nth(0)).toContainText('Default');
  await expect(options.nth(1)).toContainText('NVIDIA: Nemotron 3 Super (free)');
  await expect(options.nth(1)).toContainText('Free');
  await expect(options.nth(2)).toContainText('OpenAI: GPT-5.5');
  await expect(options.nth(2)).not.toContainText('Free');
  await expect(options.nth(3)).toContainText('Anthropic: Claude Sonnet 5.5');
  await expect(modelList(page)).not.toContainText('Lyria');
  await connect(page).getByRole('button', { name: 'Free only' }).click();
  await expect(options).toHaveCount(2);
  await options.nth(1).click();
  await expect(modelField(page)).toContainText('nvidia/nemotron-3-super-120b-a12b:free');

  await connect(page).getByLabel('API key').fill(KEY);
  await connect(page).getByRole('button', { name: 'Connect' }).click();
  await expect(connect(page)).toBeHidden();
  await expect.poll(() => seen.length, { timeout: 30_000 }).toBe(1);
  expect(seen[0].body.model).toBe('nvidia/nemotron-3-super-120b-a12b:free');
});

test('the model in French; Claude\'s list through the Anthropic SDK', async ({ page }) => {
  const lists = await fakeModels(page);
  // Claude's key kept from before; OpenRouter in use, with none: the dialog asks.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('best-email-builder:ai-key:anthropic', 'sk-ant-saved');
    localStorage.setItem('best-email-builder:ai-provider', 'openrouter');
  });
  await openEditor(page, 'fr');
  const box = await generateSale(page, 'Générer');
  const dialog = connect(page);
  await choose(page, 'OpenRouter');
  await expect(dialog.getByText('Modèle', { exact: true })).toBeVisible();
  await expect(modelStatus(page)).toHaveText('4 modèles, les gratuits en premier.');
  await modelField(page).click();
  await expect(modelList(page).getByRole('option').nth(1)).toContainText('Gratuit');
  await expect(dialog.getByRole('button', { name: 'Gratuits', exact: true })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Rechercher un modèle' }).fill('zz-model');
  await expect(modelList(page)).toContainText('Utiliser « zz-model »');

  await choose(page, 'Claude');
  await expect(modelStatus(page)).toHaveText('2 modèles.');
  const asked = lists.filter((request) => request.url.includes('anthropic'));
  expect(asked).toHaveLength(1);
  expect(asked[0].headers['x-api-key']).toBe('sk-ant-saved');
  await modelField(page).click();
  await expect(modelList(page).getByRole('option')).toHaveText([/Claude Opus 5.5/, /Claude Haiku 5.5/]);
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(box.getByRole('alert')).toBeVisible();
});
