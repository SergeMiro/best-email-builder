// @ts-check
/**
 * DOCUMENT envelope — what gets stored (the project JSON).
 *
 * HTML is only a compilation output; what gets edited is the engine's
 * project. It is not stored bare but wrapped with:
 *
 *   schemaVersion  the shape of THIS envelope (migrations, see MIGRATIONS);
 *   engine         the engine that can read `project` back;
 *   engineVersion  its version at write time;
 *   builderVersion the builder version that wrote it;
 *   project        the engine data, opaque to the rest of the code.
 *
 * A document from another engine, a future schema or a malformed one is
 * REJECTED on read rather than half-loaded: a template silently emptied and
 * then saved again would be lost.
 *
 * Dependency-free module: testable outside the browser.
 */

import { EMAIL_BUILDER_VERSION, EMAIL_DOCUMENT_SCHEMA_VERSION } from './constants.js';

/**
 * @typedef {{
 *   schemaVersion: number,
 *   engine: string,
 *   engineVersion: string,
 *   builderVersion: string,
 *   project: Record<string, any>,
 * }} EmailDocument
 */

/**
 * Envelope migrations, from N to N+1. Empty while only one schema exists; the
 * first entry will be `1: (doc) => ({ ...doc, schemaVersion: 2 })`.
 *
 * @type {Record<number, (document: any) => any>}
 */
const MIGRATIONS = {};

export class EmailDocumentError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'EmailDocumentError';
    this.status = 422;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {{engine: string, engineVersion: string, project: object}} parts
 * @returns {EmailDocument}
 */
export function createDocument({ engine, engineVersion, project }) {
  if (!engine) throw new EmailDocumentError('Document: missing engine');
  if (!isPlainObject(project)) throw new EmailDocumentError('Document: invalid engine project');
  return {
    schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION,
    engine,
    engineVersion: String(engineVersion || ''),
    builderVersion: EMAIL_BUILDER_VERSION,
    project: /** @type {Record<string, any>} */ (project),
  };
}

/**
 * Reads a document (object or JSON string), migrates it to the current schema
 * and validates it.
 *
 * @param {unknown} raw
 * @returns {EmailDocument}
 * @throws {EmailDocumentError}
 */
export function readDocument(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      throw new EmailDocumentError('Unreadable document: invalid JSON');
    }
  }
  if (!isPlainObject(value)) throw new EmailDocumentError('Unreadable document: object expected');

  /** @type {any} */
  let document = { ...(/** @type {object} */ (value)) };
  const version = Number(document.schemaVersion);
  if (!Number.isInteger(version) || version < 1) {
    throw new EmailDocumentError('Unreadable document: missing schema version');
  }
  if (version > EMAIL_DOCUMENT_SCHEMA_VERSION) {
    throw new EmailDocumentError(
      `Document written by a newer version of the builder (schema ${version}) — ` +
        'reload the page'
    );
  }
  for (let v = version; v < EMAIL_DOCUMENT_SCHEMA_VERSION; v += 1) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new EmailDocumentError(`Document: no migration from schema ${v}`);
    document = migrate(document);
  }

  if (typeof document.engine !== 'string' || !document.engine) {
    throw new EmailDocumentError('Unreadable document: missing engine');
  }
  if (!isPlainObject(document.project)) {
    throw new EmailDocumentError('Unreadable document: missing engine project');
  }

  return {
    schemaVersion: EMAIL_DOCUMENT_SCHEMA_VERSION,
    engine: document.engine,
    engineVersion: String(document.engineVersion || ''),
    builderVersion: String(document.builderVersion || ''),
    project: document.project,
  };
}

/** @param {EmailDocument} document */
export function serializeDocument(document) {
  return JSON.stringify(readDocument(document));
}
