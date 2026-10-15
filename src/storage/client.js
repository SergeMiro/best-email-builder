// @ts-check
/**
 * STORAGE on the browser side — the interface only knows this contract.
 *
 *   list()                      → templates, most recently changed first,
 *                                 without document, MJML or HTML  (optional:
 *                                 the library — `TemplateLibrary`)
 *   load(id)                    → template (document, mjml, revision…)
 *   remove(id)                  → void                          (optional)
 *   create(payload)             → { template, warnings }
 *   duplicate(id)               → { template, warnings }
 *   save(id, payload)           → { template, warnings, version }
 *   listVersions(id)            → versions, newest first
 *   getVersion(id, versionId)   → version, project included
 *   uploadImage(file)           → { path }: RELATIVE path of the uploaded image
 *   render(input)               → { html, warnings, quality }   (optional: preview)
 *   sendTest(input)             → { sent, failed, invalid, results } (optional: test send)
 *   listVariables()             → custom variables            (optional: user-defined
 *   saveVariable(variable)      → saved variable               variables, shared by
 *   deleteVariable(key)         → void                         every template)
 *   generate(input, {signal})   → { name, subject, preheader, mjml, warnings }
 *   rewrite(input, {signal})    → { text }
 *                                 (optional: "Generate", an email written by AI)
 *
 * Two implementations: HTTP (talks to `createEmailBuilderHandler` from
 * `best-email-builder/server`, or to any backend with the same routes) and memory
 * (stories, tests, demos). The interface cannot tell them apart.
 *
 * The document ALWAYS travels serialized then re-read (`readDocument`): a
 * project that would not survive JSON shows up in the memory implementation
 * already, not in production.
 */

import { readDocument } from '../core/document.js';
import { DEFAULT_ASSETS_PATH } from '../renderer/links.js';
import { IMAGE_TYPES, imageUploadError } from '../validation/images.js';
import { DEFAULT_VARIABLES, validateCustomVariable } from '../features/variables/catalog.js';
import { cleanBrand } from '../features/brand/brand.js';

/**
 * @typedef {import('../core/document.js').EmailDocument} EmailDocument
 * @typedef {import('../features/variables/catalog.js').EmailVariable} EmailVariable
 *
 * @typedef {{
 *   id: number|string,
 *   name: string,
 *   description?: string|null,
 *   subject?: string|null,
 *   preheader?: string|null,
 *   revision?: string|null,
 *   document?: EmailDocument,
 *   mjml?: string,
 *   html?: string,
 *   createdAt?: string,
 *   updatedAt?: string|null,
 * }} StoredTemplate
 *
 * @typedef {{
 *   name?: string,
 *   description?: string|null,
 *   subject?: string|null,
 *   preheader?: string|null,
 *   document: EmailDocument,
 *   mjml: string,
 *   revision?: string|null,
 *   createVersion?: boolean,
 * }} SavePayload
 *
 * @typedef {{
 *   id: number|string,
 *   versionNumber: number,
 *   name?: string,
 *   subject?: string|null,
 *   createdBy?: string|null,
 *   createdAt?: string,
 * }} TemplateVersion
 *
 * @typedef {{mjml: string, subject?: string|null, preheader?: string|null}} RenderInput
 * @typedef {{html: string, warnings: {message: string}[], quality: {code: string, level: string, message: string}[]}} RenderResult
 * @typedef {import('../features/generate/generator.js').GenerateInput} GenerateInput
 * @typedef {import('../features/generate/generator.js').GeneratedEmail} GeneratedEmail
 * @typedef {import('../features/generate/rewrite.js').RewriteInput} RewriteInput
 * @typedef {import('../features/brand/brand.js').Brand} Brand
 * @typedef {{brand: Brand, notes: string[]}} BrandImportResult
 *   `notes`: what could not be read (`LOGO_NOT_FOUND`, `LOGO_UNSUPPORTED`,
 *   `LOGO_ICON`, `COLORS_NOT_FOUND`).
 * @typedef {{email: string, ok: boolean, error: string|null}} TestResult
 * @typedef {{sent: number, failed: number, invalid: string[], results: TestResult[]}} SendTestResult
 *
 * @typedef {{
 *   list?: () => Promise<StoredTemplate[]>,
 *   load: (id: number|string) => Promise<StoredTemplate>,
 *   remove?: (id: number|string) => Promise<void>,
 *   create: (payload: SavePayload & {name: string}) => Promise<{template: StoredTemplate, warnings: object[]}>,
 *   duplicate: (id: number|string) => Promise<{template: StoredTemplate, warnings: object[]}>,
 *   save: (id: number|string, payload: SavePayload) => Promise<{template: StoredTemplate, warnings: object[], version: {id: number|string, versionNumber: number}|null}>,
 *   listVersions: (id: number|string) => Promise<TemplateVersion[]>,
 *   getVersion: (id: number|string, versionId: number|string) => Promise<TemplateVersion & {document: EmailDocument, mjml: string}>,
 *   uploadImage: (file: Blob & {name?: string}) => Promise<{path: string}>,
 *   render?: (input: RenderInput) => Promise<RenderResult>,
 *   sendTest?: (input: RenderInput & {emails: string[]}) => Promise<SendTestResult>,
 *   listVariables?: () => Promise<EmailVariable[]>,
 *   saveVariable?: (variable: Partial<EmailVariable>, options?: {create?: boolean}) => Promise<EmailVariable>,
 *   deleteVariable?: (key: string) => Promise<void>,
 *   generate?: (input: GenerateInput, options?: {signal?: AbortSignal}) => Promise<GeneratedEmail>,
 *   rewrite?: (input: RewriteInput, options?: {signal?: AbortSignal}) => Promise<{text: string}>,
 *   loadBrand?: () => Promise<Brand>,
 *   saveBrand?: (brand: Brand) => Promise<Brand>,
 *   importBrand?: (url: string, options?: {signal?: AbortSignal}) => Promise<BrandImportResult>,
 * }} TemplateStorage
 */

export class StorageError extends Error {
  /** @param {string} message @param {number} status @param {string} [code] */
  constructor(message, status, code) {
    super(message);
    this.name = 'StorageError';
    this.status = status;
    this.code = code;
  }
}

/** @param {{type?: string, size?: number}} file */
function assertUploadable(file) {
  const error = imageUploadError(file);
  if (error) throw new StorageError(error, 415, 'UNSUPPORTED_IMAGE');
}

/** Re-reads the document of a received template (JSON → validated envelope). */
function withDocument(template) {
  if (!template || !template.document) return template;
  return { ...template, document: readDocument(template.document) };
}

/**
 * Client for the routes of `createEmailBuilderHandler` (`best-email-builder/server`).
 *
 * `generate: true` turns on "Generate" and the AI rewriting of a text: the
 * server must have a `generator` (otherwise it answers 501). Off by default,
 * as the buttons would only fail.
 *
 * `brand: true` turns on the Brand button: the server must have a
 * `brandStore`, and a `brandImporter` to read a brand from a website
 * (`brand: {import: false}` when it has none).
 *
 * @param {{
 *   baseUrl?: string,
 *   headers?: Record<string, string> | (() => Record<string, string>),
 *   fetch?: typeof fetch,
 *   generate?: boolean,
 *   brand?: boolean|{import?: boolean},
 * }} [options]
 * @returns {TemplateStorage}
 */
export function createHttpStorage({ baseUrl = '/api/email-builder', headers = {}, fetch: fetchImpl, generate = false, brand = false } = {}) {
  const root = baseUrl.replace(/\/+$/, '');
  const doFetch = fetchImpl || ((input, init) => fetch(input, init));
  const extraHeaders = () => (typeof headers === 'function' ? headers() : headers);

  /** @param {Response} res */
  async function unwrap(res) {
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new StorageError(json.error || `Request failed (HTTP ${res.status})`, res.status, json.code);
    }
    return json.data;
  }

  /** @param {string} path @param {RequestInit} [init] */
  async function call(path, init) {
    const res = await doFetch(`${root}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...extraHeaders(), ...(init?.headers || {}) },
    });
    return unwrap(res);
  }

  /** @param {SavePayload} payload */
  function body(payload) {
    return JSON.stringify({ ...payload, document: readDocument(payload.document) });
  }

  return {
    list: async () => call('/templates'),
    load: async (id) => withDocument(await call(`/templates/${encodeURIComponent(id)}`)),
    remove: async (id) => {
      await call(`/templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    create: async (payload) => call('/templates', { method: 'POST', body: body(payload) }),
    duplicate: async (id) => call('/templates', { method: 'POST', body: JSON.stringify({ duplicateOf: id }) }),
    save: async (id, payload) => call(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: body(payload) }),
    listVersions: async (id) => call(`/templates/${encodeURIComponent(id)}/versions`),
    getVersion: async (id, versionId) =>
      withDocument(await call(`/templates/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}`)),
    render: async (input) => call('/render', { method: 'POST', body: JSON.stringify(input) }),
    sendTest: async (input) => call('/test', { method: 'POST', body: JSON.stringify(input) }),
    listVariables: async () => call('/variables'),
    saveVariable: async (variable, { create = false } = {}) =>
      create
        ? call('/variables', { method: 'POST', body: JSON.stringify(variable) })
        : call(`/variables/${encodeURIComponent(String(variable.key))}`, { method: 'PUT', body: JSON.stringify(variable) }),
    deleteVariable: async (key) => {
      await call(`/variables/${encodeURIComponent(key)}`, { method: 'DELETE' });
    },
    ...(generate
      ? {
          generate: async (input, { signal } = {}) =>
            call('/generate', { method: 'POST', body: JSON.stringify(input), signal }),
          rewrite: async (input, { signal } = {}) => call('/rewrite', { method: 'POST', body: JSON.stringify(input), signal }),
        }
      : {}),
    ...(brand
      ? {
          loadBrand: async () => call('/brand'),
          saveBrand: async (value) => call('/brand', { method: 'PUT', body: JSON.stringify(value) }),
          ...(brand === true || brand.import !== false
            ? {
                importBrand: async (url, { signal } = {}) =>
                  call('/brand/import', { method: 'POST', body: JSON.stringify({ url }), signal }),
              }
            : {}),
        }
      : {}),
    async uploadImage(file) {
      assertUploadable(file);
      const form = new FormData();
      form.append('file', file, file.name || 'image');
      // No Content-Type: the browser sets the multipart boundary itself.
      const res = await doFetch(`${root}/assets`, { method: 'POST', body: form, headers: extraHeaders() });
      const data = await unwrap(res);
      return { path: data.path };
    },
  };
}

/**
 * In-memory storage, same contract. Documents are kept SERIALIZED.
 * `render` and `sendTest` cannot run in a browser (MJML compiles on the
 * server): pass implementations to enable the preview and test buttons;
 * `generate` and `rewrite` likewise for the AI, `importBrand` for reading a
 * brand from a website. The brand itself is kept in memory (`brand`: the
 * one to start with).
 *
 * @param {{
 *   render?: TemplateStorage['render'],
 *   sendTest?: TemplateStorage['sendTest'],
 *   generate?: TemplateStorage['generate'],
 *   rewrite?: TemplateStorage['rewrite'],
 *   importBrand?: TemplateStorage['importBrand'],
 *   brand?: Brand|null,
 *   assetsPath?: string,
 *   systemVariables?: EmailVariable[],
 * }} [options]  `systemVariables`: keys a custom variable may not take
 * @returns {TemplateStorage & {dump: () => object}}
 */
export function createMemoryStorage({
  render,
  sendTest,
  generate,
  rewrite,
  importBrand,
  brand = null,
  assetsPath = DEFAULT_ASSETS_PATH,
  systemVariables = DEFAULT_VARIABLES,
} = {}) {
  /** @type {Map<string, any>} */
  const rows = new Map();
  /** @type {Map<string, any[]>} */
  const versions = new Map();
  /** @type {Map<string, Blob>} */
  const images = new Map();
  /** @type {Map<string, EmailVariable>} */
  const customVariables = new Map();
  let savedBrand = cleanBrand(brand);
  let nextId = 1;
  let tick = Date.parse('2026-01-01T00:00:00.000Z');
  const now = () => new Date((tick += 1000)).toISOString();

  /** @param {any} row */
  function toTemplate(row) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      subject: row.subject,
      preheader: row.preheader,
      revision: row.revision,
      document: readDocument(row.documentJson),
      mjml: row.mjml,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** @param {any} row */
  function snapshot(row) {
    const list = versions.get(String(row.id)) || [];
    const entry = {
      id: list.length + 1,
      versionNumber: list.length + 1,
      name: row.name,
      subject: row.subject,
      createdBy: null,
      createdAt: row.revision,
      documentJson: row.documentJson,
      mjml: row.mjml,
    };
    versions.set(String(row.id), [...list, entry]);
    return { id: entry.id, versionNumber: entry.versionNumber };
  }

  /** @param {number|string} id */
  function rowOf(id) {
    const row = rows.get(String(id));
    if (!row) throw new StorageError('Template not found', 404, 'NOT_FOUND');
    return row;
  }

  /** @type {TemplateStorage & {dump: () => object}} */
  const storage = {
    async list() {
      return [...rows.values()]
        .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
        .map((row) => {
          const { document: _d, mjml: _m, ...summary } = toTemplate(row);
          return summary;
        });
    },
    async load(id) {
      return toTemplate(rowOf(id));
    },
    async remove(id) {
      rowOf(id);
      rows.delete(String(id));
      versions.delete(String(id));
    },
    async create(payload) {
      if (!payload.name?.trim()) throw new StorageError('Name required', 400, 'NAME_REQUIRED');
      const at = now();
      const row = {
        id: nextId++,
        name: payload.name.trim(),
        description: payload.description ?? null,
        subject: payload.subject ?? null,
        preheader: payload.preheader ?? null,
        documentJson: JSON.stringify(readDocument(payload.document)),
        mjml: payload.mjml,
        createdAt: at,
        updatedAt: null,
        revision: at,
      };
      rows.set(String(row.id), row);
      snapshot(row);
      return { template: toTemplate(row), warnings: [] };
    },
    async duplicate(id) {
      const source = rowOf(id);
      return storage.create({
        name: `${source.name} (copy)`,
        description: source.description,
        subject: source.subject,
        preheader: source.preheader,
        document: readDocument(source.documentJson),
        mjml: source.mjml,
      });
    },
    async save(id, payload) {
      const row = rowOf(id);
      if (payload.revision && payload.revision !== row.revision) {
        throw new StorageError('Template changed in the meantime — reload it before saving', 409, 'CONFLICT');
      }
      const at = now();
      Object.assign(row, {
        ...(payload.name !== undefined ? { name: payload.name } : {}),
        ...(payload.description !== undefined ? { description: payload.description } : {}),
        ...(payload.subject !== undefined ? { subject: payload.subject } : {}),
        ...(payload.preheader !== undefined ? { preheader: payload.preheader } : {}),
        documentJson: JSON.stringify(readDocument(payload.document)),
        mjml: payload.mjml,
        updatedAt: at,
        revision: at,
      });
      const version = payload.createVersion ? snapshot(row) : null;
      const { document: _omit, ...template } = toTemplate(row);
      return { template, warnings: [], version };
    },
    async listVersions(id) {
      rowOf(id);
      return [...(versions.get(String(id)) || [])].reverse().map(({ documentJson: _d, mjml: _m, ...v }) => v);
    },
    async getVersion(id, versionId) {
      const entry = (versions.get(String(id)) || []).find((v) => String(v.id) === String(versionId));
      if (!entry) throw new StorageError('Version not found', 404, 'NOT_FOUND');
      const { documentJson, ...version } = entry;
      return { ...version, document: readDocument(documentJson) };
    },
    async uploadImage(file) {
      assertUploadable(file);
      // Same key as the server: 32 hex characters of the hash + extension.
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const path = `${assetsPath}${hex.slice(0, 32)}.${IMAGE_TYPES[file.type]}`;
      images.set(path, file);
      return { path };
    },
    async listVariables() {
      return [...customVariables.values()].map((v) => ({ ...v }));
    },
    async saveVariable(input, { create = false } = {}) {
      const existing = [...systemVariables, ...customVariables.values()];
      if (!create && !customVariables.has(String(input?.key))) {
        throw new StorageError('Variable not found', 404, 'NOT_FOUND');
      }
      const base = create ? {} : customVariables.get(String(input.key));
      const { variable, errors } = validateCustomVariable({ ...base, ...input }, { existing, editing: create ? null : input.key });
      if (errors) throw new StorageError(Object.values(errors)[0], 400, 'INVALID_VARIABLE');
      customVariables.set(variable.key, variable);
      return { ...variable };
    },
    async deleteVariable(key) {
      if (!customVariables.delete(String(key))) throw new StorageError('Variable not found', 404, 'NOT_FOUND');
    },
    async loadBrand() {
      return { ...savedBrand };
    },
    async saveBrand(value) {
      savedBrand = cleanBrand(value);
      return { ...savedBrand };
    },
    ...(importBrand ? { importBrand } : {}),
    ...(render ? { render } : {}),
    ...(sendTest ? { sendTest } : {}),
    ...(generate ? { generate } : {}),
    ...(rewrite ? { rewrite } : {}),
    dump: () => ({
      rows: [...rows.values()],
      versions: Object.fromEntries(versions),
      images: [...images.keys()],
      variables: [...customVariables.values()],
      brand: savedBrand,
    }),
  };
  return storage;
}
