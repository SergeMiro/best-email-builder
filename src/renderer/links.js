// @ts-check
/**
 * Service links and uploaded images in a rendered email.
 *
 *   `{{ unsubscribe }}` → the unsubscribe link. For a preview or a test it is
 *                         an INERT link: it can be displayed and clicked but
 *                         unsubscribes nobody — least of all the person
 *                         proofreading their test;
 *   `{{ mirror }}`      → "view online" link of some providers, `#` here.
 *
 * UPLOADED IMAGES: a template keeps a RELATIVE path (`/email-assets/<key>`),
 * made absolute at render time with the public URL of the environment that
 * sends. An absolute URL frozen at save time would point to whichever
 * environment saved the template.
 *
 * An uploaded image path is any root-relative path ending with an asset key:
 * 32 hex characters of the content hash and a known extension. The prefix is
 * the application's choice (`assetsPath` option of the server handler).
 */

const UNSUBSCRIBE = /\{\{\s*unsubscribe\s*\}\}|\[UNSUBSCRIBE\]/gi;
const MIRROR = /\{\{\s*mirror\s*\}\}/gi;

/** Default public path of uploaded images. */
export const DEFAULT_ASSETS_PATH = '/email-assets/';

const ASSET_PATH_PATTERN = /^\/(?:[A-Za-z0-9._~-]+\/)*[a-f0-9]{32}\.(png|jpg|gif)$/;
const RELATIVE_ASSET = /(^|["'(=\s])(\/(?:[A-Za-z0-9._~-]+\/)*[a-f0-9]{32}\.(?:png|jpg|gif))(?=["')\s>]|$)/g;

/** Is this the path of an uploaded image? @param {string} value */
export function isAssetPath(value) {
  const path = String(value || '').trim();
  return ASSET_PATH_PATTERN.test(path) && !path.split('/').some((part) => part === '..' || part === '.');
}

/**
 * Makes uploaded image paths absolute. Without a base URL the HTML is
 * returned as is (preview inside the application, same origin).
 *
 * @param {string} html
 * @param {string|null|undefined} baseUrl
 */
export function absoluteAssetUrls(html, baseUrl) {
  const root = String(baseUrl || '').replace(/\/+$/, '');
  if (!root) return String(html || '');
  return String(html || '').replace(RELATIVE_ASSET, (match, before, path) =>
    isAssetPath(path) ? `${before}${root}${path}` : match
  );
}

function escapeAttribute(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string} html
 * @param {{unsubscribeUrl: string}} links
 */
export function applyServiceLinks(html, { unsubscribeUrl }) {
  return String(html || '')
    .replace(UNSUBSCRIBE, () => escapeAttribute(unsubscribeUrl))
    .replace(MIRROR, '#');
}
