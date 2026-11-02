// @ts-check
/**
 * TEST SEND of a template — to proofreading addresses only.
 *
 * A browser preview proves nothing about what Outlook (Word's engine) will do:
 * a test in a real mailbox is the only real check.
 *
 *   - same rendering as the preview, one address at a time (`to` is never a
 *     list: reviewers do not see each other);
 *   - subject prefixed with "[TEST]"; inert unsubscribe link;
 *   - a typed address gets sample values (its own for the email variable); a
 *     CONTACT gets its own values, empty ones included, as a real send would
 *     (`contacts`, resolved by the server — never values sent by the browser);
 *   - a bounded number of addresses — beyond that it is no longer a test;
 *   - one failure does not stop the others: each address gets its result.
 *
 * The transport is INJECTED, which makes this testable without sending.
 */

import { identity } from '../i18n/index.js';
import { DEFAULT_VARIABLES } from '../features/variables/catalog.js';
import { applyVariablesToText, sampleValues } from '../features/variables/service.js';
import { HttpError } from './errors.js';
import { compileTemplate, htmlToText, personalize, sampleUnsubscribeUrl } from './render.js';

export const MAX_TEST_RECIPIENTS = 10;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @typedef {{to: string, subject: string, html: string, text: string}} OutgoingEmail
 * @typedef {{send: (email: OutgoingEmail) => Promise<unknown>}} EmailTransport
 * @typedef {{email: string, values?: Record<string, string|null|undefined>}} TestContact
 */

/**
 * The values of a contact's email: samples for what a contact does not carry
 * (campaign name…), then the contact's own — empty ones too.
 *
 * @param {import('../features/variables/catalog.js').EmailVariable[]} variables
 * @param {TestContact} contact
 */
export function contactValues(variables, contact) {
  const values = sampleValues(variables);
  for (const [key, value] of Object.entries(contact.values || {})) values[key] = value == null ? '' : String(value);
  values['contact.email'] = String(contact.email || '');
  return values;
}

/**
 * @param {{
 *   mjml: string,
 *   subject?: string|null,
 *   preheader?: string|null,
 *   emails?: string[]|string,
 *   contacts?: TestContact[],
 *   skipped?: string[],
 *   transport: EmailTransport,
 *   baseUrl?: string|null,
 *   unsubscribeUrl?: string|null,
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
  emails = [],
  contacts = [],
  skipped = [],
  transport,
  baseUrl = null,
  unsubscribeUrl = null,
  variables = DEFAULT_VARIABLES,
  maxRecipients = MAX_TEST_RECIPIENTS,
  t = identity,
  lang = 'en',
}) {
  const list = (Array.isArray(emails) ? emails : String(emails || '').split(/[,;\s]+/))
    .map((e) => String(e || '').trim().toLowerCase())
    .filter(Boolean);
  /** @type {Map<string, Record<string, string>|null>} address → a contact's values, null for a typed address */
  const recipients = new Map();
  const invalid = [];
  for (const contact of Array.isArray(contacts) ? contacts : []) {
    const email = String(contact?.email || '').trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) invalid.push(email || String(contact?.email ?? ''));
    else if (!recipients.has(email)) recipients.set(email, contactValues(variables, { ...contact, email }));
  }
  for (const email of list) {
    if (!EMAIL_SHAPE.test(email)) invalid.push(email);
    // The same address picked as a contact keeps the contact's values.
    else if (!recipients.has(email)) recipients.set(email, null);
  }
  const valid = [...recipients.keys()];
  if (!valid.length) throw new HttpError(400, t('No usable test address'), 'NO_RECIPIENT');
  if (valid.length > maxRecipients) {
    throw new HttpError(400, t('{max} test addresses at most', { max: maxRecipients }), 'TOO_MANY_RECIPIENTS');
  }

  // Compiled once (validation included), then personalized per address.
  const { compiled, warnings, quality } = await compileTemplate({ mjml, subject, preheader }, { t, lang, variables });

  const results = [];
  for (const email of valid) {
    try {
      const values = recipients.get(email) || sampleValues(variables, { 'contact.email': email });
      const html = personalize(compiled, { values, unsubscribeUrl: unsubscribeUrl || sampleUnsubscribeUrl(variables), baseUrl, variables });
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
    // Contacts asked for that the host no longer gives (another client's, opted out…).
    skipped: [...skipped],
    results,
    warnings,
    quality,
  };
}
