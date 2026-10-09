// @ts-check
/**
 * Prepares MJML before compilation — shared by the server preview, the test
 * send and saving.
 *
 * The subject and the preview text (preheader) are METADATA of the template,
 * typed outside the canvas: they do not live in the engine project. They are
 * written here, into `<mj-head>`, at compile time:
 *
 *   `<mj-title>`   document title (browser tab, some webmails);
 *   `<mj-preview>` the grey text that follows the subject in the inbox.
 *
 * `lang` is set when missing: otherwise screen readers read the message with
 * the voice of the system language.
 */

function escapeXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} mjml
 * @param {{title?: string|null, preheader?: string|null, lang?: string}} [meta]
 * @returns {string}
 */
export function prepareMjml(mjml, { title = null, preheader = null, lang = 'en' } = {}) {
  let out = String(mjml || '')
    .replace(/<mj-title(?:\s[^>]*)?>[\s\S]*?<\/mj-title>/gi, '')
    .replace(/<mj-preview(?:\s[^>]*)?>[\s\S]*?<\/mj-preview>/gi, '');

  out = out.replace(/<mjml(\s[^>]*)?>/i, (tag, attrs = '') =>
    /\slang\s*=/.test(attrs) ? tag : `<mjml lang="${escapeXml(lang)}"${attrs}>`
  );

  const head = [
    title && String(title).trim() ? `<mj-title>${escapeXml(String(title).trim())}</mj-title>` : '',
    preheader && String(preheader).trim() ? `<mj-preview>${escapeXml(String(preheader).trim())}</mj-preview>` : '',
  ].join('');
  if (!head) return out;

  if (/<mj-head(\s[^>]*)?>/i.test(out)) {
    return out.replace(/<mj-head(\s[^>]*)?>/i, (tag) => `${tag}${head}`);
  }
  return out.replace(/<mjml(\s[^>]*)?>/i, (tag) => `${tag}<mj-head>${head}</mj-head>`);
}
