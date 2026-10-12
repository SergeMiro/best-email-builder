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
 */

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
    html: String(result?.html || ''),
    warnings: (result?.errors || []).map((/** @type {any} */ e) => ({
      line: e.line,
      message: String(e.formattedMessage || e.message || e),
      tagName: e.tagName,
    })),
  };
}
