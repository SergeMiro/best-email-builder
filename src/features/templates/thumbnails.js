// @ts-check
/**
 * THUMBNAILS — a grey frame in place of an image not chosen yet, so a
 * thumbnail or a preview never shows a broken image icon. Apart from the
 * gallery: the library previews templates without loading the bases.
 */

/** Grey frame drawn in place of an image not chosen yet, in thumbnails only. */
const THUMBNAIL_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 300'%3E" +
  "%3Crect width='600' height='300' fill='%23dfe6f0'/%3E%3C/svg%3E";

/**
 * MJML for a thumbnail: empty images get a grey frame instead of a broken
 * image icon. Never saved: the template itself keeps its empty images.
 * @param {string} mjml
 */
export function withThumbnailImages(mjml) {
  return String(mjml || '').replace(/<mj-image(?![^>]*\ssrc=)([^>]*)>/g, `<mj-image src="${THUMBNAIL_IMAGE}"$1>`);
}

/**
 * Compiled HTML for a thumbnail or a preview: an image not chosen yet (an
 * `<img>` with no `src`) gets the same grey frame. For HTML that went through
 * the server's validator, which rightly refuses `data:` images in MJML.
 * @param {string} html
 */
export function withPlaceholderImages(html) {
  return String(html || '').replace(/<img(?![^>]*\ssrc=)(\s[^>]*)?>/g, (_m, attrs = '') => `<img src="${THUMBNAIL_IMAGE}"${attrs}>`);
}
