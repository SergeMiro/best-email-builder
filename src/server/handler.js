// @ts-check
/**
 * HTTP HANDLER — every route the builder needs, as one function
 * `(request: Request) => Promise<Response>` (Fetch API).
 *
 * Works as is in Next.js route handlers, Hono, Bun, Deno, Cloudflare Workers;
 * with Express / Node's `http` through `toNodeListener` (see `node.js`).
 *
 *   GET    {base}/templates                       read    list
 *   POST   {base}/templates                       write   create, or { duplicateOf }
 *   GET    {base}/templates/:id                   read    template
 *   PUT    {base}/templates/:id                   write   save
 *   DELETE {base}/templates/:id                   write   delete
 *   GET    {base}/templates/:id/versions          read    versions
 *   GET    {base}/templates/:id/versions/:vid     read    version with its project
 *   POST   {base}/render                          read    preview (server rendering)
 *   POST   {base}/test                            write   test send (needs `transport`)
 *   POST   {base}/assets                          write   image upload (multipart, field `file`)
 *   GET    {base}/variables                       read    custom variables
 *   POST   {base}/variables                       write   create a custom variable
 *   PUT    {base}/variables/:key                  write   edit (label, group, sample, fallback)
 *   DELETE {base}/variables/:key                  write   delete
 *   GET    {assetsPath}:key                       PUBLIC  uploaded image
 *
 * Images are PUBLIC on purpose: mail clients download them without any
 * session. Their keys are content hashes (unguessable), and they are served
 * with headers that forbid any interpretation other than an image.
 *
 * `authorize(request, { action })` is REQUIRED: it returns the user (any
 * object with `id`/`name`, recorded as author) or null to refuse (401).
 * Throw an `HttpError(403, …)` to refuse with another status.
 */

import { translatorFor } from '../i18n/index.js';
import { DEFAULT_VARIABLES, defineVariables } from '../features/variables/catalog.js';
import { applyVariablesToText, sampleValues } from '../features/variables/service.js';
import { MAX_IMAGE_BYTES } from '../validation/images.js';
import { createAssetService } from './assets.js';
import { HttpError, statusOf } from './errors.js';
import { compileTemplate, personalize } from './render.js';
import { MAX_TEST_RECIPIENTS, sendTestEmail } from './sendTest.js';
import { createTemplateService } from './templates.js';
import { createVariableService } from './variables.js';

/**
 * @typedef {'read'|'write'} Action
 * @typedef {{id?: string|number, name?: string}} User
 *
 * @typedef {{
 *   templates: import('./templates.js').TemplateRepository,
 *   assets: import('./assets.js').AssetRepository,
 *   authorize: (request: Request, context: {action: Action}) => Promise<User|null|false> | User | null | false,
 *   basePath?: string,
 *   assetsPath?: string,
 *   publicUrl?: string|null,
 *   transport?: import('./sendTest.js').EmailTransport|null,
 *   variables?: import('../features/variables/catalog.js').EmailVariable[],
 *   variableStore?: import('./variables.js').VariableRepository|null,
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   lang?: string,
 *   previewUnsubscribeUrl?: string,
 *   maxVersions?: number,
 *   maxTestRecipients?: number,
 *   rateLimits?: {testPerHour?: number, uploadsPerHour?: number},
 *   onError?: (error: unknown, request: Request) => void,
 * }} HandlerOptions
 */

/** Largest JSON body accepted (project 2 MB + MJML 512 KB + metadata). */
const MAX_JSON_BYTES = 3 * 1024 * 1024;
const HOUR = 60 * 60 * 1000;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** Sliding one-hour window per key, in memory (one process). */
function createLimiter(perHour) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();
  return (key) => {
    if (!perHour) return true;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((at) => now - at < HOUR);
    if (recent.length >= perHour) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

/**
 * The returned function also exposes `handler.catalog()`: system + custom
 * variables, for the application's own sending pipeline (`personalize`).
 *
 * @param {HandlerOptions} options
 * @returns {((request: Request) => Promise<Response>) & {catalog: () => Promise<import('../features/variables/catalog.js').EmailVariable[]>}}
 */
export function createEmailBuilderHandler(options) {
  const {
    templates: templateRepository,
    assets: assetRepository,
    authorize,
    basePath = '/api/email-builder',
    publicUrl = null,
    transport = null,
    locale = 'en',
    messages,
    lang = locale.slice(0, 2),
    previewUnsubscribeUrl = '#',
    maxVersions,
    maxTestRecipients = MAX_TEST_RECIPIENTS,
    rateLimits = {},
    onError = (error) => console.error('[best-email-builder]', error),
  } = options || /** @type {any} */ ({});
  if (typeof authorize !== 'function') throw new Error('createEmailBuilderHandler: `authorize` is required');
  if (!templateRepository || !assetRepository) {
    throw new Error('createEmailBuilderHandler: `templates` and `assets` repositories are required');
  }

  const base = basePath.replace(/\/+$/, '');
  const assetsPath = (options.assetsPath || `${base}/assets/`).replace(/\/*$/, '/');
  const variables = defineVariables(options.variables || DEFAULT_VARIABLES);
  const t = translatorFor(locale, messages);
  const templates = createTemplateService({ repository: templateRepository, t, lang, maxVersions });
  const assets = createAssetService({ repository: assetRepository, publicPath: assetsPath, t });
  const customVariables = createVariableService({ repository: options.variableStore || null, system: variables, t });
  const testLimiter = createLimiter(rateLimits.testPerHour ?? 20);
  const uploadLimiter = createLimiter(rateLimits.uploadsPerHour ?? 100);

  /** @param {Request} request @param {Action} action */
  async function userFor(request, action) {
    const user = await authorize(request, { action });
    if (!user) throw new HttpError(401, t('Authentication required'), 'UNAUTHORIZED');
    return /** @type {User} */ (user);
  }

  const userKey = (/** @type {User} */ user) => String(user.id ?? user.name ?? 'anonymous');

  /** @param {Request} request */
  async function readJson(request) {
    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_JSON_BYTES) throw new HttpError(413, t('Request too large'), 'TOO_LARGE');
    const body = await request.text();
    if (body.length > MAX_JSON_BYTES) throw new HttpError(413, t('Request too large'), 'TOO_LARGE');
    try {
      return body ? JSON.parse(body) : {};
    } catch {
      throw new HttpError(400, t('Invalid JSON'), 'INVALID_JSON');
    }
  }

  /** @param {string} key */
  async function serveAsset(key) {
    const asset = await assets.get(key);
    if (!asset) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(/** @type {any} */ (asset.data), {
      status: 200,
      headers: {
        'Content-Type': asset.contentType,
        'Content-Length': String(asset.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${asset.sha256 || key}"`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  }

  /** @param {Request} request */
  async function route(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path.startsWith(assetsPath) && (method === 'GET' || method === 'HEAD')) {
      return serveAsset(decodeURIComponent(path.slice(assetsPath.length)));
    }
    if (path !== base && !path.startsWith(`${base}/`)) return null;
    const parts = path.slice(base.length).split('/').filter(Boolean).map(decodeURIComponent);
    const [section, id, sub, subId] = parts;

    if (section === 'templates') {
      if (!id && method === 'GET') {
        await userFor(request, 'read');
        return json({ data: await templates.list() });
      }
      if (!id && method === 'POST') {
        const user = await userFor(request, 'write');
        const body = await readJson(request);
        const result =
          body?.duplicateOf !== undefined && body?.duplicateOf !== null
            ? await templates.duplicate(body.duplicateOf, user)
            : await templates.create(body, user);
        return json({ data: result }, 201);
      }
      if (id && !sub && method === 'GET') {
        await userFor(request, 'read');
        return json({ data: await templates.get(id) });
      }
      if (id && !sub && method === 'PUT') {
        const user = await userFor(request, 'write');
        return json({ data: await templates.save(id, await readJson(request), user) });
      }
      if (id && !sub && method === 'DELETE') {
        await userFor(request, 'write');
        return json({ data: await templates.remove(id) });
      }
      if (id && sub === 'versions' && method === 'GET') {
        await userFor(request, 'read');
        return json({ data: subId ? await templates.getVersion(id, subId) : await templates.listVersions(id) });
      }
    }

    if (section === 'render' && !id && method === 'POST') {
      await userFor(request, 'read');
      const body = await readJson(request);
      const catalog = await customVariables.catalog();
      const { compiled, warnings, quality } = await compileTemplate(
        { mjml: body?.mjml, subject: body?.subject, preheader: body?.preheader },
        { t, lang, variables: catalog }
      );
      // Same origin as the application: uploaded images stay relative.
      const values = sampleValues(catalog);
      const html = personalize(compiled, { values, unsubscribeUrl: previewUnsubscribeUrl, variables: catalog });
      return json({
        data: {
          html,
          subject: applyVariablesToText(body?.subject || '', values, catalog),
          preheader: applyVariablesToText(body?.preheader || '', values, catalog),
          warnings,
          quality,
        },
      });
    }

    if (section === 'test' && !id && method === 'POST') {
      const user = await userFor(request, 'write');
      if (!transport) throw new HttpError(501, t('Test sending is not configured'), 'NO_TRANSPORT');
      if (!testLimiter(userKey(user))) throw new HttpError(429, t('Too many test sends — try again later'), 'RATE_LIMITED');
      const body = await readJson(request);
      const result = await sendTestEmail({
        mjml: body?.mjml,
        subject: body?.subject,
        preheader: body?.preheader,
        emails: body?.emails,
        transport,
        baseUrl: publicUrl,
        unsubscribeUrl: previewUnsubscribeUrl,
        variables: await customVariables.catalog(),
        maxRecipients: maxTestRecipients,
        t,
        lang,
      });
      return json({ data: result });
    }

    if (section === 'assets' && !id && method === 'POST') {
      const user = await userFor(request, 'write');
      if (!uploadLimiter(userKey(user))) throw new HttpError(429, t('Too many uploads — try again later'), 'RATE_LIMITED');
      const length = Number(request.headers.get('content-length') || 0);
      if (length > MAX_IMAGE_BYTES + 64 * 1024) {
        throw new HttpError(413, t('Image too large: {max} MB maximum', { max: MAX_IMAGE_BYTES / (1024 * 1024) }), 'TOO_LARGE');
      }
      let form;
      try {
        form = await request.formData();
      } catch {
        throw new HttpError(400, t('Multipart form expected'), 'INVALID_FORM');
      }
      const file = form.get('file');
      if (!file || typeof file === 'string') throw new HttpError(400, t('File missing'), 'FILE_MISSING');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await assets.upload({ bytes, name: file.name, user });
      return json({ data: result }, result.created ? 201 : 200);
    }

    if (section === 'variables') {
      if (!id && method === 'GET') {
        await userFor(request, 'read');
        return json({ data: await customVariables.listCustom() });
      }
      if (!id && method === 'POST') {
        const user = await userFor(request, 'write');
        return json({ data: await customVariables.create(await readJson(request), user) }, 201);
      }
      if (id && !sub && method === 'PUT') {
        const user = await userFor(request, 'write');
        return json({ data: await customVariables.update(id, await readJson(request), user) });
      }
      if (id && !sub && method === 'DELETE') {
        await userFor(request, 'write');
        return json({ data: await customVariables.remove(id) });
      }
    }

    throw new HttpError(404, t('Route not found'), 'ROUTE_NOT_FOUND');
  }

  async function handle(request) {
    try {
      const response = await route(request);
      return response || json({ error: t('Route not found'), code: 'ROUTE_NOT_FOUND' }, 404);
    } catch (error) {
      const status = statusOf(error);
      if (status >= 500 && status !== 501) {
        onError(error, request);
        return json({ error: t('Internal error'), code: 'INTERNAL' }, 500);
      }
      const err = /** @type {any} */ (error);
      return json({ error: err.message, code: err.code || undefined, issues: err.issues || undefined }, status);
    }
  }

  handle.catalog = () => customVariables.catalog();
  return handle;
}
