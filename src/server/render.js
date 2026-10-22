// @ts-check
/**
 * Rendering of a template outside of a campaign — preview and test send.
 *
 *   MJML ─► validation ─► compilation (mjml, server) ─► variables ─► links ─► HTML
 *
 * Same validation and compilation steps as saving (`templates.js`): what the
 * preview shows is what will be stored. Variables get SAMPLE values (the real
 * address for a test); the unsubscribe link gets its sample too, otherwise it
 * is inert.
 */

import { identity } from '../i18n/index.js';
import { assertValidMjml } from '../validation/mjmlValidator.js';
import { qualityReport } from '../validation/quality.js';
import { DEFAULT_VARIABLES, findVariable } from '../features/variables/catalog.js';
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
 * @param {{t?: Translate, lang?: string, variables?: EmailVariable[], preview?: boolean}} [options]
 *   `preview`: for a person, not an inbox — an image with no picture yet is
 *   kept (the page draws its frame) instead of left out.
 */
export async function compileTemplate(
  { mjml, subject = null, preheader = null },
  { t = identity, lang = 'en', variables = DEFAULT_VARIABLES, preview = false } = {}
) {
  assertValidMjml(mjml, { t });
  const prepared = prepareMjml(mjml, { title: subject, preheader, lang, emptyImages: preview ? 'keep' : 'drop' });
  const { html, warnings } = await compileMjml(prepared);
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
 * The unsubscribe link of a preview or a test send: the link's sample value,
 * otherwise an INERT link — it unsubscribes nobody, least of all the person
 * proofreading their test.
 *
 * @param {EmailVariable[]} [variables]
 */
export function sampleUnsubscribeUrl(variables = DEFAULT_VARIABLES) {
  return findVariable('unsubscribe', variables)?.sample || '#';
}

/**
 * Personalization of compiled HTML, once per recipient. `baseUrl` makes
 * uploaded images absolute — omit it for a preview inside the application,
 * which reads them from its own origin.
 *
 * Without `unsubscribeUrl`, the unsubscribe link is the link variable's value
 * if empty (the email provider's own tag, `*|UNSUB|*`), otherwise inert.
 *
 * @param {string} compiled
 * @param {{
 *   values: Record<string, string|null|undefined>,
 *   unsubscribeUrl?: string|null,
 *   baseUrl?: string|null,
 *   variables?: EmailVariable[],
 * }} options
 */
export function personalize(compiled, { values, unsubscribeUrl = null, baseUrl = null, variables = DEFAULT_VARIABLES }) {
  const link = unsubscribeUrl || findVariable('unsubscribe', variables)?.fallback || '#';
  const html = applyServiceLinks(applyVariables(compiled, values, variables), { unsubscribeUrl: link });
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
 *   unsubscribeUrl?: string|null,
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
  unsubscribeUrl = null,
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
