import { test, expect } from '@playwright/test';

/**
 * GENERATE in the static demo: the visitor's own Anthropic key, the real SDK
 * loaded in the browser. Anthropic is answered by `page.route` — nothing
 * leaves the machine; the test checks what the browser would have sent.
 */

const HOME = '/best-email-builder/';
const API = 'https://api.anthropic.com/v1/messages**';
const KEY = 'sk-ant-test-0000';

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

/** A streamed Messages API answer whose text is `text`. @param {string} text */
function stream(text) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 100 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Answers Anthropic with `reply(request)`; returns the requests seen. */
async function fakeAnthropic(page, reply) {
  const seen = [];
  await page.route(API, async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    seen.push({ headers: request.headers(), body: request.postDataJSON() });
    return route.fulfill({ headers: CORS, ...reply(request) });
  });
  return seen;
}

async function openEditor(page) {
  await page.goto(`${HOME}?lang=en#/editor/new`);
  await expect(page.getByTestId('email-builder')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

async function generateSale(page) {
  await page.getByRole('button', { name: 'Generate', exact: true }).click();
  const box = page.getByTestId('eb-generate');
  await box.locator('[data-purpose="sale"]').click();
  await box.getByTestId('eb-generate-submit').click();
  return box;
}

test('without a key: asked once, declining explains it in the dialog', async ({ page }) => {
  const seen = await fakeAnthropic(page, () => ({ status: 500 }));
  await openEditor(page);
  await expect(page.getByTestId('demo-ai-note')).toContainText('your own Anthropic API key');
  page.once('dialog', (dialog) => {
    expect(dialog.message()).toContain('Paste your Anthropic API key');
    dialog.dismiss();
  });
  const box = await generateSale(page);
  await expect(box.getByRole('alert')).toHaveText(/needs your Anthropic API key/);
  expect(seen).toHaveLength(0);
});

test('with a key: Claude is asked from the browser, the email opens in the editor; the key can be forgotten', async ({ page }) => {
  const seen = await fakeAnthropic(page, () => ({
    status: 200,
    contentType: 'text/event-stream',
    body: stream(JSON.stringify(DRAFT)),
  }));
  await openEditor(page);
  page.once('dialog', (dialog) => dialog.accept(KEY));
  const box = await generateSale(page);
  await expect(box).toBeHidden({ timeout: 30_000 });
  await expect(page.frameLocator('.eb-canvas-frame').getByText('Autumn sale', { exact: true })).toBeVisible();
  await expect(page.getByTestId('eb-properties').getByRole('textbox', { name: 'Subject' })).toHaveValue(DRAFT.subject);

  // One request, straight to Anthropic, with the visitor's key.
  expect(seen).toHaveLength(1);
  const [{ headers, body }] = seen;
  expect(headers['x-api-key']).toBe(KEY);
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(body.model).toBe('claude-opus-5-5');
  expect(body.stream).toBe(true);
  expect(body.output_config.effort).toBe('low');
  expect(body.output_config.format.type).toBe('json_schema');
  expect(body.messages[0].content).toContain('sale');

  // Kept for the next generation, until the visitor forgets it.
  const forget = page.getByTestId('demo-ai-note').getByRole('button', { name: 'Forget my key' });
  await expect(forget).toBeVisible();
  await forget.click();
  await expect(forget).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('best-email-builder-demo:anthropic-key'))).toBeFalsy();
});

test('a key Anthropic refuses is forgotten, and the dialog says so', async ({ page }) => {
  await fakeAnthropic(page, () => ({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
  }));
  await openEditor(page);
  page.once('dialog', (dialog) => dialog.accept(KEY));
  const box = await generateSale(page);
  await expect(box.getByRole('alert')).toHaveText(/refused this API key/);
  await expect(page.getByTestId('demo-ai-note').getByRole('button', { name: 'Forget my key' })).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('best-email-builder-demo:anthropic-key'))).toBeFalsy();
});

test('rewrite with AI: the same key, one request, the selected text replaced', async ({ page }) => {
  const seen = await fakeAnthropic(page, (request) => {
    const rewriting = request.postDataJSON().messages[0].content.includes('<text>');
    const answer = rewriting ? { text: 'Big autumn sale' } : DRAFT;
    return { status: 200, contentType: 'text/event-stream', body: stream(JSON.stringify(answer)) };
  });
  await openEditor(page);
  page.once('dialog', (dialog) => dialog.accept(KEY));
  await expect(await generateSale(page)).toBeHidden({ timeout: 30_000 });

  const canvas = page.frameLocator('.eb-canvas-frame');
  await canvas.getByText('Autumn sale', { exact: true }).click();
  await page.getByTestId('eb-rewrite').getByRole('button', { name: 'Shorter', exact: true }).click();
  await expect(canvas.getByText('Big autumn sale', { exact: true })).toBeVisible({ timeout: 30_000 });

  // No second prompt for the key: the one given to Generate is used.
  expect(seen).toHaveLength(2);
  const { headers, body } = seen[1];
  expect(headers['x-api-key']).toBe(KEY);
  expect(body.output_config.effort).toBe('low');
  expect(body.output_config.format.schema.required).toEqual(['text']);
  expect(body.messages[0].content).toContain('<text>\nAutumn sale\n</text>');
});
