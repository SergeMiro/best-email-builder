// @ts-check
/**
 * Rendering of a template outside of a campaign — preview and test send.
 *
 *   MJML ─► validation ─► compilation (mjml, server) ─► variables ─► links ─► HTML
 *
 * Same validation and compilation steps as saving (`templates.js`): what the
 * preview shows is what will be stored. Variables get SAMPLE values (the real
 * address for a test); the unsubscribe link is inert.
 */

import { identity } from '../i18n/index.js';
import { assertValidMjml } from '../validation/mjmlValidator.js';
import { qualityReport } from '../validation/quality.js';
import { DEFAULT_VARIABLES } from '../features/variables/catalog.js';
import { applyVariables, unknownVariables } from '../features/variables/service.js';
import { prepareMjml } from '../renderer/prepareMjml.js';
import { absoluteAssetUrls, applyServiceLinks } from '../renderer/links.js';
import { compileMjml } from './compileMjml.js';

/**
 * @typedef {import('../i18n/index.js').Translate} Translate
 * @typedef {import('../features/variables/catalog.js').EmailVariable} EmailVariable
 */

/**
 * Validation + compilation, once per template. The quality report also lists
 * tags that are not in the catalog (typos), which would render empty.
 *
 * @param {{mjml: string, subject?: string|null, preheader?: string|null}} input
 * @param {{t?: Translate, lang?: string, variables?: EmailVariable[]}} [options]
 */
export async function compileTemplate(
  { mjml, subject = null, preheader = null },
  { t = identity, lang = 'en', variables = DEFAULT_VARIABLES } = {}
) {
  assertValidMjml(mjml, { t });
  const { html, warnings } = await compileMjml(prepareMjml(mjml, { title: subject, preheader, lang }));
  const quality = qualityReport({ mjml, html, subject }, { t });
  const unknown = unknownVariables([mjml, subject || '', preheader || ''].join('\n'), variables);
  if (unknown.length) {
    quality.push({
      code: 'UNKNOWN_VARIABLE',
      level: 'warning',
      count: unknown.length,
      message: t('Unknown variables (rendered empty): {tags}', { tags: unknown.map((k) => `{{${k}}}`).join(', ') }),
    });
  }
  return { compiled: html, warnings, quality };
}

/**
 * Personalization of compiled HTML, once per recipient. `baseUrl` makes
 * uploaded images absolute — omit it for a preview inside the application,
 * which reads them from its own origin.
 *
 * @param {string} compiled
 * @param {{
 *   values: Record<string, string|null|undefined>,
 *   unsubscribeUrl: string,
 *   baseUrl?: string|null,
 *   variables?: EmailVariable[],
 * }} options
 */
export function personalize(compiled, { values, unsubscribeUrl, baseUrl = null, variables = DEFAULT_VARIABLES }) {
  const html = applyServiceLinks(applyVariables(compiled, values, variables), { unsubscribeUrl });
  return absoluteAssetUrls(html, baseUrl);
}

/**
 * Compiles and personalizes in one call — for a single email.
 *
 * @param {{
 *   mjml: string,
 *   subject?: string|null,
 *   preheader?: string|null,
 *   values?: Record<string, string|null|undefined>,
 *   unsubscribeUrl?: string,
 *   baseUrl?: string|null,
 *   variables?: EmailVariable[],
 *   t?: Translate,
 *   lang?: string,
 * }} input
 */
export async function renderEmail({
  mjml,
  subject = null,
  preheader = null,
  values = {},
  unsubscribeUrl = '#',
  baseUrl = null,
  variables = DEFAULT_VARIABLES,
  t = identity,
  lang = 'en',
}) {
  const { compiled, warnings, quality } = await compileTemplate({ mjml, subject, preheader }, { t, lang, variables });
  return { html: personalize(compiled, { values, unsubscribeUrl, baseUrl, variables }), warnings, quality };
}

/**
 * Plain-text alternative (clients without HTML, spam filters).
 * @param {string} html
 */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/h\d)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
