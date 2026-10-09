// @ts-check
/**
 * UPLOADED IMAGES.
 *
 * The type is read from the BYTES (PNG, JPEG, GIF only), never trusted from the
 * file name or the declared type: an SVG renamed `.png` carries scripts and is
 * refused. The public key is derived from the content hash (32 hex characters
 * of SHA-256 + extension): the same file uploaded twice is stored once, and a
 * key reveals nothing and cannot be guessed.
 *
 * Storage is a REPOSITORY supplied by the application (database, object
 * storage…); `createMemoryAssetRepository` is the reference implementation.
 */

import { createHash } from 'node:crypto';
import { identity } from '../i18n/index.js';
import { ASSET_KEY_PATTERN, MAX_IMAGE_BYTES, detectImage } from '../validation/images.js';
import { HttpError } from './errors.js';

/**
 * @typedef {{
 *   key: string,
 *   sha256: string,
 *   contentType: string,
 *   size: number,
 *   name: string|null,
 *   data: Uint8Array,
 *   createdBy: string|null,
 * }} AssetRecord
 *
 * @typedef {{
 *   findBySha256: (sha256: string) => Promise<{key: string}|null>,
 *   insert: (record: AssetRecord) => Promise<void>,
 *   get: (key: string) => Promise<{contentType: string, data: Uint8Array, sha256?: string}|null>,
 * }} AssetRepository
 */

/**
 * @param {Uint8Array} bytes
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 */
export function inspectAsset(bytes, { t = identity } = {}) {
  if (!bytes || bytes.length === 0) throw new HttpError(400, t('Empty file'), 'EMPTY_FILE');
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, t('Image too large: {max} MB maximum', { max: MAX_IMAGE_BYTES / (1024 * 1024) }), 'TOO_LARGE');
  }
  const image = detectImage(bytes);
  if (!image) throw new HttpError(415, t('Format rejected: PNG, JPEG or GIF expected'), 'UNSUPPORTED_IMAGE');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return { type: image.type, key: `${sha256.slice(0, 32)}.${image.ext}`, sha256 };
}

function cleanName(name) {
  // eslint-disable-next-line no-control-regex
  return String(name || '').replace(/[\u0000-\u001f\u007f<>"]/g, '').trim().slice(0, 255) || null;
}

/**
 * @param {{repository: AssetRepository, publicPath: string, t?: import('../i18n/index.js').Translate}} options
 */
export function createAssetService({ repository, publicPath, t = identity }) {
  const prefix = publicPath.endsWith('/') ? publicPath : `${publicPath}/`;
  return {
    /**
     * @param {{bytes: Uint8Array, name?: string|null, user?: {id?: string|number, name?: string}|null}} input
     */
    async upload({ bytes, name = null, user = null }) {
      const { type, key, sha256 } = inspectAsset(bytes, { t });
      const result = { key, path: `${prefix}${key}`, contentType: type, size: bytes.length };
      const existing = await repository.findBySha256(sha256);
      if (existing) return { ...result, key: existing.key, path: `${prefix}${existing.key}`, created: false };
      try {
        await repository.insert({
          key,
          sha256,
          contentType: type,
          size: bytes.length,
          name: cleanName(name),
          data: bytes,
          createdBy: user ? String(user.name ?? user.id ?? '') || null : null,
        });
      } catch (error) {
        // Two simultaneous uploads of the same file: the other one won, same image.
        if (await repository.findBySha256(sha256)) return { ...result, created: false };
        throw error;
      }
      return { ...result, created: true };
    },

    /** @param {string} key */
    async get(key) {
      if (!ASSET_KEY_PATTERN.test(String(key || ''))) return null;
      return repository.get(key);
    },
  };
}

/** @returns {AssetRepository & {size: () => number}} */
export function createMemoryAssetRepository() {
  /** @type {Map<string, AssetRecord>} */
  const byKey = new Map();
  return {
    async findBySha256(sha256) {
      for (const record of byKey.values()) if (record.sha256 === sha256) return { key: record.key };
      return null;
    },
    async insert(record) {
      if (byKey.has(record.key)) throw new Error('duplicate asset');
      byKey.set(record.key, { ...record, data: new Uint8Array(record.data) });
    },
    async get(key) {
      const record = byKey.get(key);
      return record ? { contentType: record.contentType, data: record.data, sha256: record.sha256 } : null;
    },
    size: () => byKey.size,
  };
}
