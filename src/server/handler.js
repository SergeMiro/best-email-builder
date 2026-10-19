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
 *   POST   {base}/rewrite                         write   write or rewrite one text of an email (needs `generator`,
 *                                                         the AI module: best-email-builder/ai/server)
 *   POST   {base}/proofread                       write   the mistakes of an email's texts (needs `generator`)
 *   POST   {base}/subjects                        write   three other subject lines (needs `generator`)
 *   GET    {base}/variables                       read    custom variables
 *   POST   {base}/variables                       write   create a custom variable
 *   PUT    {base}/variables/:key                  write   edit (label, group, sample, fallback)
 *   DELETE {base}/variables/:key                  write   delete
 *   GET    {base}/brand                           read    the workspace's brand
 *   PUT    {base}/brand                           write   save it (needs `brandStore`)
 *   POST   {base}/brand/import                    write   read a brand from a website (needs `brandImporter`)
 *   GET    {assetsPath}:key                       PUBLIC  uploaded image
 *
 * Images are PUBLIC on purpose: mail clients download them without any
 * session. Their keys are content hashes (unguessable), and they are served
 * with headers that forbid any interpretation other than an image.
 *
 * `authorize(request, { action })` is REQUIRED: it returns the user (any
 * object with `id`/`name`, recorded as author) or null to refuse (401).
 * Throw an `HttpError(403, …)` to refuse with another status. The AI routes
 * hand that user to the generator, down to its model: an agent of your own
 * (agentEmailModel) forwards who asks.
 */

import { messagesOf, translatorFor } from '../i18n/index.js';
import { DEFAULT_VARIABLES, defineVariables } from '../features/variables/catalog.js';
import { applyVariablesToText, sampleValues } from '../features/variables/service.js';
import { MAX_IMAGE_BYTES } from '../validation/images.js';
import { createAssetService } from './assets.js';
import { HttpError, statusOf } from './errors.js';
import { compileTemplate, personalize } from './render.js';
import { MAX_TEST_RECIPIENTS, sendTestEmail } from './sendTest.js';
import { createTemplateService } from './templates.js';
import { createVariableService } from './variables.js';
import { createBrandService } from './brand.js';
import { BrandImportError } from './brandImport.js';
import { BRAND_IMPORT_ERRORS } from '../features/brand/messages.js';

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
 *   generator?: {
 *     proofread?: (input: import('../ai/proofread.js').ProofreadInput, options?: {signal?: AbortSignal, user?: User}) => Promise<{fixes: import('../ai/proofread.js').ProofreadFix[]}>,
 *     rewrite?: (input: import('../ai/rewrite.js').RewriteInput, options?: {signal?: AbortSignal, user?: User}) => Promise<{text: string}>,
 *     suggestSubjects?: (input: import('../ai/subjects.js').SubjectsInput, options?: {signal?: AbortSignal, user?: User}) => Promise<{subjects: string[]}>,
 *     messages?: Record<string, Record<string, string>>,
 *   }|null,
 *   variables?: import('../features/variables/catalog.js').EmailVariable[],
 *   variableStore?: import('./variables.js').VariableRepository|null,
 *   brandStore?: import('./brand.js').BrandRepository|null,
 *   brandImporter?: {import: (url: string, options?: {signal?: AbortSignal}) => Promise<import('./brandImport.js').BrandImport>}|null,
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   lang?: string,
 *   previewUnsubscribeUrl?: string,
 *   maxVersions?: number,
 *   maxTestRecipients?: number,
 *   rateLimits?: {testPerHour?: number, uploadsPerHour?: number, proofreadPerHour?: number, rewritePerHour?: number, subjectsPerHour?: number, brandImportsPerHour?: number},
 *   onError?: (error: unknown, request: Request) => void,
 * }} HandlerOptions
 */

/** Largest JSON body accepted (project 2 MB + MJML 512 KB + metadata). */
const MAX_JSON_BYTES = 3 * 1024 * 1024;

const HOUR = 60 * 60 * 1000;

/**
 * An error of the AI module, recognised without importing it (a server
 * without AI does not load it).
 * @param {any} error
 * @returns {error is {name: 'EmailGenerationError', status: number, message: string, code: string}}
 */
const isGenerationError = (error) =>
  error?.name === 'EmailGenerationError' && Number.isInteger(error.status) && typeof error.code === 'string';

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
    generator = null,
    brandImporter = null,
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
  // The AI module's texts (its errors) under the host's own.
  const t = translatorFor(locale, { ...messagesOf(generator?.messages, locale), ...messages });
  const templates = createTemplateService({ repository: templateRepository, t, lang, maxVersions });
  const assets = createAssetService({ repository: assetRepository, publicPath: assetsPath, t });
  const customVariables = createVariableService({ repository: options.variableStore || null, system: variables, t });
  const brand = createBrandService({ repository: options.brandStore || null, t });
  const testLimiter = createLimiter(rateLimits.testPerHour ?? 20);
  const uploadLimiter = createLimiter(rateLimits.uploadsPerHour ?? 100);
  const proofreadLimiter = createLimiter(rateLimits.proofreadPerHour ?? 60);
  const rewriteLimiter = createLimiter(rateLimits.rewritePerHour ?? 200);
  const subjectsLimiter = createLimiter(rateLimits.subjectsPerHour ?? 100);
  const brandImportLimiter = createLimiter(rateLimits.brandImportsPerHour ?? 20);

  /** @param {Request} request @param {Action} action */
  async function userFor(request, action) {
    const user = await authorize(request, { action });
    if (!user) throw new HttpError(401, t('Authentication required'), 'UNAUTHORIZED');
    return /** @type {User} */ (user);
  }

  const userKey = (/** @type {User} */ user) => String(user.id ?? user.name ?? 'anonymous');

  /** @param {Request} request */
  /** The browser's language when it is one (`fr`, `pt-BR`), else the server's. @param {unknown} value */
  const languageOr = (value) => (typeof value === 'string' && /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(value) ? value : lang);

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

  /**
   * A model call answered as JSON: its errors as the interface shows them,
   * a cancelled request (the user closed the dialog) as 499.
   * @param {Request} request @param {() => Promise<unknown>} call
   */
  async function askModel(request, call) {
    try {
      return json({ data: await call() });
    } catch (error) {
      if (request.signal?.aborted) return json({ error: t('Cancelled'), code: 'CANCELLED' }, 499);
      // The generator's own errors (EmailGenerationError, best-email-builder/ai/server) say what to show.
      if (isGenerationError(error)) throw new HttpError(error.status, t(error.message), error.code);
      onError(error, request);
      throw new HttpError(502, t('The AI service did not answer — try again in a moment.'), 'MODEL_ERROR');
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
        { t, lang, variables: catalog, preview: true }
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

    if (section === 'proofread' && !id && method === 'POST') {
      const user = await userFor(request, 'write');
      const proofread = generator?.proofread;
      if (typeof proofread !== 'function') throw new HttpError(501, t('Proofreading is not configured'), 'NO_GENERATOR');
      if (!proofreadLimiter(userKey(user))) throw new HttpError(429, t('Too many proofreadings — try again later'), 'RATE_LIMITED');
      const body = await readJson(request);
      return askModel(request, () => proofread({ ...body, language: languageOr(body?.language) }, { signal: request.signal, user }));
    }

    if (section === 'rewrite' && !id && method === 'POST') {
      const user = await userFor(request, 'write');
      const rewrite = generator?.rewrite;
      if (typeof rewrite !== 'function') throw new HttpError(501, t('Text rewriting is not configured'), 'NO_GENERATOR');
      if (!rewriteLimiter(userKey(user))) throw new HttpError(429, t('Too many rewrites — try again later'), 'RATE_LIMITED');
      const body = await readJson(request);
      return askModel(request, () => rewrite(body, { signal: request.signal, user }));
    }

    if (section === 'subjects' && !id && method === 'POST') {
      const user = await userFor(request, 'write');
      const suggestSubjects = generator?.suggestSubjects;
      if (typeof suggestSubjects !== 'function') throw new HttpError(501, t('Subject ideas are not configured'), 'NO_GENERATOR');
      if (!subjectsLimiter(userKey(user))) throw new HttpError(429, t('Too many subject ideas — try again later'), 'RATE_LIMITED');
      const body = await readJson(request);
      // The merge tags are the server's catalog, whatever the browser sent.
      const catalog = await customVariables.catalog();
      return askModel(request, () =>
        suggestSubjects({ ...body, language: languageOr(body?.language), variables: catalog }, { signal: request.signal, user })
      );
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

    if (section === 'brand' && !sub) {
      if (!id && method === 'GET') {
        await userFor(request, 'read');
        return json({ data: await brand.get() });
      }
      if (!id && method === 'PUT') {
        const user = await userFor(request, 'write');
        return json({ data: await brand.save(await readJson(request), user) });
      }
      if (id === 'import' && method === 'POST') {
        const user = await userFor(request, 'write');
        if (!brandImporter) throw new HttpError(501, t('Reading a brand from a website is not configured'), 'NO_BRAND_IMPORTER');
        if (!brandImportLimiter(userKey(user))) {
          throw new HttpError(429, t('Too many websites read — try again later'), 'RATE_LIMITED');
        }
        const body = await readJson(request);
        return json({ data: await importBrand(request, body?.url, user) });
      }
    }

    throw new HttpError(404, t('Route not found'), 'ROUTE_NOT_FOUND');
  }

  /**
   * A website's brand, its logo stored like an upload. Not saved: the user
   * looks at it first.
   * @param {Request} request @param {unknown} address @param {User} user
   */
  async function importBrand(request, address, user) {
    let result;
    try {
      result = await /** @type {NonNullable<typeof brandImporter>} */ (brandImporter).import(String(address ?? ''), { signal: request.signal });
    } catch (error) {
      if (request.signal?.aborted) throw new HttpError(499, t('Cancelled'), 'CANCELLED');
      if (!(error instanceof BrandImportError)) throw error;
      const [status, message] = BRAND_IMPORT_ERRORS[error.code] || BRAND_IMPORT_ERRORS.UNREACHABLE;
      throw new HttpError(status, t(message), `BRAND_${error.code}`);
    }
    const found = { ...result.brand };
    if (result.logo) {
      const { path } = await assets.upload({ bytes: result.logo.bytes, name: `logo.${result.logo.ext}`, user });
      found.logoUrl = path;
      found.logoWidth = result.logo.shownWidth;
    }
    return { brand: found, notes: result.notes };
  }

  async function handle(request) {
    try {
      const response = await route(request);
      return response || json({ error: t('Route not found'), code: 'ROUTE_NOT_FOUND' }, 404);
    } catch (error) {
      const status = statusOf(error);
      // A 5xx we raised ourselves (not configured, AI service down) says why.
      if (status >= 500 && !(error instanceof HttpError)) {
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
