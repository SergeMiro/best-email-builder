// @ts-check
/**
 * MJML → HTML compilation, ON THE SERVER — the only one that counts.
 *
 * The canvas compiles too (mjml-browser) to display the email while editing;
 * but the saved HTML, a test's and a campaign's all come from here. The
 * browser never sends HTML to the server.
 *
 *   ignoreIncludes  `mj-include` would read a server file (the validator
 *                   already rejects it; belt and braces);
 *   fonts: {}       no Google font added by default: one more external link in
 *                   the message, for fonts the blocks do not use;
 *   validationLevel soft: MJML deviations come back as warnings. Blocking them
 *                   would lose work for a mistyped attribute value; safety is
 *                   enforced upstream by `validation/`.
 *
 * Two lines are added to MJML's <head>, as email best practice asks:
 *   x-apple-disable-message-reformatting  Apple Mail (macOS, iOS) does not
 *                   rescale the email it judges too wide;
 *   format-detection  iOS does not turn dates, addresses and phone numbers
 *                   into blue links over the design (a real link is written
 *                   as one: `tel:`, `mailto:`).
 */

const CLIENT_METAS =
  '<meta name="x-apple-disable-message-reformatting">' +
  '<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">';

/** @param {string} html */
export function withClientMetas(html) {
  if (!html || html.includes('x-apple-disable-message-reformatting')) return html;
  const viewport = /<meta name="viewport"[^>]*>/i.exec(html);
  if (viewport) return html.slice(0, viewport.index + viewport[0].length) + CLIENT_METAS + html.slice(viewport.index + viewport[0].length);
  return html.replace(/<head>/i, (head) => head + CLIENT_METAS);
}

import mjml2html from 'mjml';

/** @typedef {{line?: number, message: string, tagName?: string}} CompileWarning */

/**
 * @param {string} mjml
 * @returns {Promise<{html: string, warnings: CompileWarning[]}>}
 */
export async function compileMjml(mjml) {
  const compile = /** @type {any} */ (mjml2html);
  // MJML 5 compiles asynchronously; `await` also accepts a synchronous result.
  const result = await compile(String(mjml || ''), {
    validationLevel: 'soft',
    keepComments: false,
    beautify: false,
    minify: false,
    ignoreIncludes: true,
    fonts: {},
  });
  return {
    html: withClientMetas(String(result?.html || '')),
    warnings: (result?.errors || []).map((/** @type {any} */ e) => ({
      line: e.line,
      message: String(e.formattedMessage || e.message || e),
      tagName: e.tagName,
    })),
  };
}
