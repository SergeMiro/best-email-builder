// @ts-check
/**
 * Images UPLOADED in the builder — one rule shared by the browser (immediate
 * rejection, storage/client.js) and the server (storage/server/assetFile.js).
 *
 * PNG, JPEG, GIF: the three formats every email client displays. WebP and SVG
 * do not display in Outlook, and an SVG can carry script.
 * The server reads the type from the file BYTES; the browser, from `file.type`.
 */

import { identity } from '../i18n/index.js';

/** Maximum image size: beyond it, the email becomes slow to open. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Accepted types → extension of the public key. */
export const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };

/** Public key: 32 hex characters of the hash + extension. */
export const ASSET_KEY_PATTERN = /^[a-f0-9]{32}\.(png|jpg|gif)$/;

const SIGNATURES = [
  { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

/**
 * Image type detected from the file signature, or `null`.
 * @param {Uint8Array} bytes
 * @returns {{type: string, ext: string}|null}
 */
export function detectImage(bytes) {
  if (!bytes || bytes.length < 8) return null;
  const found = SIGNATURES.find((s) => s.bytes.every((b, i) => bytes[i] === b));
  return found ? { type: found.type, ext: IMAGE_TYPES[found.type] } : null;
}

/**
 * Immediate rejection of a file the server would refuse, or `null`.
 * @param {{type?: string, size?: number}} file
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 */
export function imageUploadError(file, { t = identity } = {}) {
  if (!(String(file?.type || '') in IMAGE_TYPES)) return t('Format rejected: PNG, JPEG or GIF expected');
  if (Number(file?.size || 0) > MAX_IMAGE_BYTES) {
    return t('Image too large: {max} MB maximum', { max: MAX_IMAGE_BYTES / (1024 * 1024) });
  }
  return null;
}
