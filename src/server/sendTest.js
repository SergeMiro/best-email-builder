// @ts-check
/**
 * TEST SEND of a template — to proofreading addresses only.
 *
 * A browser preview proves nothing about what Outlook (Word's engine) will do:
 * a test in a real mailbox is the only real check.
 *
 *   - same rendering as the preview, one address at a time (`to` is never a
 *     list: reviewers do not see each other);
 *   - subject prefixed with "[TEST]"; the email variable gets the address being
 *     served, the others sample values; inert unsubscribe link;
 *   - a bounded number of addresses — beyond that it is no longer a test;
 *   - one failure does not stop the others: each address gets its result.
 *
 * The transport is INJECTED, which makes this testable without sending.
 */

import { identity } from '../i18n/index.js';
import { DEFAULT_VARIABLES } from '../features/variables/catalog.js';
import { applyVariablesToText, sampleValues } from '../features/variables/service.js';
import { HttpError } from './errors.js';
import { compileTemplate, htmlToText, personalize } from './render.js';

export const MAX_TEST_RECIPIENTS = 10;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @typedef {{to: string, subject: string, html: string, text: string}} OutgoingEmail
 * @typedef {{send: (email: OutgoingEmail) => Promise<unknown>}} EmailTransport
 */

/**
 * @param {{
 *   mjml: string,
 *   subject?: string|null,
 *   preheader?: string|null,
 *   emails: string[]|string,
 *   transport: EmailTransport,
 *   baseUrl?: string|null,
 *   unsubscribeUrl?: string,
 *   variables?: import('../features/variables/catalog.js').EmailVariable[],
 *   maxRecipients?: number,
 *   t?: import('../i18n/index.js').Translate,
 *   lang?: string,
 * }} input
 */
export async function sendTestEmail({
  mjml,
  subject = null,
  preheader = null,
  emails,
  transport,
  baseUrl = null,
  unsubscribeUrl = '#',
  variables = DEFAULT_VARIABLES,
  maxRecipients = MAX_TEST_RECIPIENTS,
  t = identity,
  lang = 'en',
}) {
  const list = (Array.isArray(emails) ? emails : String(emails || '').split(/[,;\s]+/))
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
  const valid = [...new Set(list.filter((e) => EMAIL_SHAPE.test(e)))];
  const invalid = list.filter((e) => !EMAIL_SHAPE.test(e));
  if (!valid.length) throw new HttpError(400, t('No usable test address'), 'NO_RECIPIENT');
  if (valid.length > maxRecipients) {
    throw new HttpError(400, t('{max} test addresses at most', { max: maxRecipients }), 'TOO_MANY_RECIPIENTS');
  }

  // Compiled once (validation included), then personalized per address.
  const { compiled, warnings, quality } = await compileTemplate({ mjml, subject, preheader }, { t, lang, variables });

  const results = [];
  for (const email of valid) {
    try {
      const values = sampleValues(variables, { 'contact.email': email });
      const html = personalize(compiled, { values, unsubscribeUrl, baseUrl, variables });
      const personal = applyVariablesToText(String(subject || '').trim(), values, variables) || t('No subject');
      await transport.send({ to: email, subject: `[TEST] ${personal}`.slice(0, 200), html, text: htmlToText(html) });
      results.push({ email, ok: true, error: null });
    } catch (error) {
      // Short message: a gateway error can carry the whole HTML.
      results.push({ email, ok: false, error: String(/** @type {Error} */ (error)?.message || 'failed').slice(0, 300) });
    }
  }

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    invalid,
    results,
    warnings,
    quality,
  };
}
