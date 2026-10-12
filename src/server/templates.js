// @ts-check
/**
 * TEMPLATES — the server-side business rules, independent of the database.
 *
 * ── THE PROJECT IS THE SOURCE, HTML A RESULT ────────────────────────────────
 * Every write receives the PROJECT (versioned envelope) and its MJML export.
 * The server validates both (`validation/`), compiles the MJML itself and only
 * stores ITS HTML. No route accepts HTML coming from the browser.
 *
 * ── CONCURRENT WRITES ───────────────────────────────────────────────────────
 * Two people can open the same template. Each write carries the `revision`
 * read at load time; the repository refuses the write (409) when someone else
 * saved in the meantime — instead of silently overwriting their work.
 *
 * ── VERSIONS ───────────────────────────────────────────────────────────────
 * One version per EXPLICIT save (`createVersion`), never per autosave. Only the
 * latest `maxVersions` stay listed.
 *
 * Storage is a REPOSITORY supplied by the application (see the typedef below
 * and `createMemoryTemplateRepository`, the reference implementation).
 */

import { identity } from '../i18n/index.js';
import { EMAIL_BUILDER_VERSION, EMAIL_DOCUMENT_SCHEMA_VERSION } from '../core/constants.js';
import { assertValidProject } from '../validation/projectValidator.js';
import { assertValidMjml } from '../validation/mjmlValidator.js';
import { prepareMjml } from '../renderer/prepareMjml.js';
import { compileMjml } from './compileMjml.js';
import { HttpError } from './errors.js';

/**
 * @typedef {{
 *   name: string,
 *   description: string|null,
 *   subject: string|null,
 *   preheader: string|null,
 *   projectJson: string,
 *   mjml: string,
 *   html: string,
 *   builderVersion: string,
 *   schemaVersion: number,
 * }} TemplateFields
 *
 * @typedef {TemplateFields & {
 *   id: string|number,
 *   revision: string,
 *   createdAt: string|Date|null,
 *   updatedAt: string|Date|null,
 *   createdBy: string|null,
 *   updatedBy: string|null,
 * }} TemplateRecord
 *
 * @typedef {{
 *   id: string|number,
 *   versionNumber: number,
 *   name: string,
 *   subject: string|null,
 *   preheader: string|null,
 *   projectJson: string,
 *   mjml: string,
 *   createdBy: string|null,
 *   createdAt: string|Date|null,
 * }} VersionRecord
 *
 * Every method may be async. `update` MUST compare `expectedRevision` and write
 * atomically (e.g. `UPDATE … WHERE id = ? AND revision = ?`), returning
 * `{ conflict: true, current }` on mismatch and `null` when the id is unknown.
 * `addVersion` numbers versions (max + 1) and keeps the latest `keep` listed.
 *
 * @typedef {{
 *   list: () => Promise<TemplateRecord[]>,
 *   find: (id: string) => Promise<TemplateRecord|null>,
 *   insert: (fields: TemplateFields & {createdBy: string|null}) => Promise<TemplateRecord>,
 *   update: (id: string, fields: Partial<TemplateFields> & {updatedBy: string|null},
 *            options: {expectedRevision: string|null}) =>
 *            Promise<TemplateRecord | {conflict: true, current: TemplateRecord} | null>,
 *   remove: (id: string) => Promise<boolean>,
 *   addVersion: (templateId: string, version: Omit<VersionRecord, 'id'|'versionNumber'|'createdAt'>,
 *                options: {keep: number}) => Promise<{id: string|number, versionNumber: number}>,
 *   listVersions: (templateId: string) => Promise<VersionRecord[]>,
 *   findVersion: (templateId: string, versionId: string) => Promise<VersionRecord|null>,
 *   transaction?: <T>(work: () => Promise<T>) => Promise<T>,
 * }} TemplateRepository
 *
 * @typedef {{id?: string|number, name?: string}|null} Actor
 */

/** Column sizes. */
export const LIMITS = { name: 200, description: 1000, subject: 250, preheader: 250 };

export const MAX_ACTIVE_VERSIONS = 50;

function text(value, max) {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : null;
}

const iso = (value) => (value ? new Date(value).toISOString() : null);
const actorName = (/** @type {Actor} */ user) => (user ? String(user.name ?? user.id ?? '') || null : null);

function parseProject(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Record → API object. */
function toTemplate(/** @type {TemplateRecord} */ row, { withProject = true } = {}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subject: row.subject,
    preheader: row.preheader,
    revision: row.revision,
    builderVersion: row.builderVersion,
    schemaVersion: row.schemaVersion,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...(withProject ? { document: parseProject(row.projectJson), mjml: row.mjml, html: row.html } : {}),
  };
}

/** @param {VersionRecord} row */
function toVersion(row, { withProject = false } = {}) {
  return {
    id: row.id,
    versionNumber: row.versionNumber,
    name: row.name,
    subject: row.subject,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    ...(withProject ? { preheader: row.preheader, document: parseProject(row.projectJson), mjml: row.mjml } : {}),
  };
}

/**
 * @param {{
 *   repository: TemplateRepository,
 *   t?: import('../i18n/index.js').Translate,
 *   lang?: string,
 *   maxVersions?: number,
 * }} options
 */
export function createTemplateService({ repository, t = identity, lang = 'en', maxVersions = MAX_ACTIVE_VERSIONS }) {
  const inTransaction = (work) => (repository.transaction ? repository.transaction(work) : work());

  /**
   * Validates the project and the MJML, compiles the final HTML.
   * @param {{document: any, mjml: any, subject?: string|null, preheader?: string|null}} input
   */
  async function compile({ document, mjml, subject = null, preheader = null }) {
    const { json } = assertValidProject(document, { t });
    assertValidMjml(mjml, { t });
    const { html, warnings } = await compileMjml(prepareMjml(mjml, { title: subject, preheader, lang }));
    if (!html) throw new HttpError(422, t('Empty MJML compilation'), 'EMPTY_COMPILATION');
    return { projectJson: json, mjml: String(mjml), html, warnings };
  }

  async function findOrThrow(id) {
    const row = await repository.find(String(id));
    if (!row) throw new HttpError(404, t('Template not found'), 'NOT_FOUND');
    return row;
  }

  const service = {
    compile,

    async list() {
      const rows = await repository.list();
      return rows.map((row) => toTemplate(row, { withProject: false }));
    },

    /** @param {string|number} id */
    async get(id) {
      return toTemplate(await findOrThrow(id));
    },

    /**
     * Creates a template and its version 1.
     * @param {any} body
     * @param {Actor} [user]
     */
    async create(body, user = null) {
      const name = text(body?.name, LIMITS.name);
      if (!name) throw new HttpError(400, t('Name required'), 'NAME_REQUIRED');
      const subject = text(body?.subject, LIMITS.subject);
      const preheader = text(body?.preheader, LIMITS.preheader);
      const { projectJson, mjml, html, warnings } = await compile({ document: body?.document, mjml: body?.mjml, subject, preheader });
      const by = actorName(user);

      const row = await inTransaction(async () => {
        const created = await repository.insert({
          name,
          description: text(body?.description, LIMITS.description),
          subject,
          preheader,
          projectJson,
          mjml,
          html,
          builderVersion: EMAIL_BUILDER_VERSION,
          schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION,
          createdBy: by,
        });
        await repository.addVersion(
          String(created.id),
          { name, subject, preheader, projectJson, mjml, createdBy: by },
          { keep: maxVersions }
        );
        return created;
      });
      return { template: toTemplate(row), warnings };
    },

    /**
     * Saves a template. Fields left undefined keep their stored value.
     * @param {string|number} id
     * @param {any} body
     * @param {Actor} [user]
     */
    async save(id, body, user = null) {
      const current = await findOrThrow(id);
      const name = body?.name !== undefined ? text(body.name, LIMITS.name) : current.name;
      if (!name) throw new HttpError(400, t('Name required'), 'NAME_REQUIRED');
      const subject = body?.subject !== undefined ? text(body.subject, LIMITS.subject) : current.subject;
      const preheader = body?.preheader !== undefined ? text(body.preheader, LIMITS.preheader) : current.preheader;
      const description =
        body?.description !== undefined ? text(body.description, LIMITS.description) : current.description;
      const { projectJson, mjml, html, warnings } = await compile({ document: body?.document, mjml: body?.mjml, subject, preheader });
      const by = actorName(user);

      const result = await inTransaction(async () => {
        const updated = await repository.update(
          String(id),
          {
            name,
            description,
            subject,
            preheader,
            projectJson,
            mjml,
            html,
            builderVersion: EMAIL_BUILDER_VERSION,
            schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION,
            updatedBy: by,
          },
          { expectedRevision: body?.revision ? String(body.revision) : null }
        );
        if (!updated) throw new HttpError(404, t('Template not found'), 'NOT_FOUND');
        if ('conflict' in updated) {
          const who = updated.current.updatedBy;
          throw new HttpError(
            409,
            who
              ? t('Template changed in the meantime by {user} — reload it before saving', { user: who })
              : t('Template changed in the meantime — reload it before saving'),
            'CONFLICT'
          );
        }
        const version = body?.createVersion
          ? await repository.addVersion(
              String(id),
              { name, subject, preheader, projectJson, mjml, createdBy: by },
              { keep: maxVersions }
            )
          : null;
        return { row: updated, version };
      });

      // The editor keeps its own document: only what changed server side is returned.
      const { document: _omit, ...template } = toTemplate(result.row);
      return { template, warnings, version: result.version };
    },

    /** @param {string|number} id @param {Actor} [user] */
    async duplicate(id, user = null) {
      const source = await findOrThrow(id);
      return service.create(
        {
          name: t('{name} (copy)', { name: source.name }).slice(0, LIMITS.name),
          description: source.description,
          subject: source.subject,
          preheader: source.preheader,
          document: parseProject(source.projectJson),
          mjml: source.mjml,
        },
        user
      );
    },

    /** @param {string|number} id */
    async remove(id) {
      if (!(await repository.remove(String(id)))) throw new HttpError(404, t('Template not found'), 'NOT_FOUND');
      return { id };
    },

    /** @param {string|number} id */
    async listVersions(id) {
      await findOrThrow(id);
      const rows = await repository.listVersions(String(id));
      return rows.map((row) => toVersion(row));
    },

    /** @param {string|number} id @param {string|number} versionId */
    async getVersion(id, versionId) {
      const row = await repository.findVersion(String(id), String(versionId));
      if (!row) throw new HttpError(404, t('Version not found'), 'NOT_FOUND');
      return toVersion(row, { withProject: true });
    },
  };
  return service;
}

/**
 * In-memory repository — reference implementation of the contract, used by the
 * tests and the example application. Data is lost on restart.
 *
 * @returns {TemplateRepository}
 */
export function createMemoryTemplateRepository() {
  /** @type {Map<string, TemplateRecord>} */
  const rows = new Map();
  /** @type {Map<string, VersionRecord[]>} */
  const versions = new Map();
  let nextId = 1;
  let nextVersionId = 1;
  let clock = 0;
  // Strictly increasing, even within the same millisecond.
  const stamp = () => {
    clock = Math.max(clock + 1, Date.now());
    return new Date(clock);
  };
  const copy = (row) => (row ? { ...row } : null);

  return {
    async list() {
      return [...rows.values()]
        .map(copy)
        .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    },
    async find(id) {
      return copy(rows.get(id));
    },
    async insert(fields) {
      const at = stamp();
      const row = { ...fields, id: nextId++, revision: at.toISOString(), createdAt: at, updatedAt: null, updatedBy: null };
      rows.set(String(row.id), row);
      return copy(row);
    },
    async update(id, fields, { expectedRevision }) {
      const row = rows.get(id);
      if (!row) return null;
      if (expectedRevision && expectedRevision !== row.revision) return { conflict: true, current: copy(row) };
      const at = stamp();
      Object.assign(row, fields, { updatedAt: at, revision: at.toISOString() });
      return copy(row);
    },
    async remove(id) {
      versions.delete(id);
      return rows.delete(id);
    },
    async addVersion(templateId, version, { keep }) {
      const list = versions.get(templateId) || [];
      const versionNumber = list.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
      const entry = { ...version, id: nextVersionId++, versionNumber, createdAt: stamp() };
      versions.set(templateId, [...list, entry].slice(-keep));
      return { id: entry.id, versionNumber };
    },
    async listVersions(templateId) {
      return [...(versions.get(templateId) || [])].reverse().map(copy);
    },
    async findVersion(templateId, versionId) {
      return copy((versions.get(templateId) || []).find((v) => String(v.id) === versionId));
    },
  };
}
