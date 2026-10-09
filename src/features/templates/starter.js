// @ts-check
/**
 * Starter template of a new email.
 *
 * A complete email rather than a blank page: header (logo or sender name),
 * headline, text, button, and a FOOTER with the sender's postal address and the
 * unsubscribe link — the two mentions a bulk email must carry (CAN-SPAM, GDPR)
 * and that get forgotten when starting from nothing.
 *
 * Written with the same settings as the blocks (`blocks/`), with longhand
 * paddings (see core/mjmlAttributes): what the canvas shows is what gets sent.
 */

import { identity } from '../../i18n/index.js';
import { DEFAULT_BUTTON_URL, FONT_STACK, PALETTE } from '../../blocks/shared.js';

/**
 * @typedef {{
 *   name?: string,
 *   address?: string,
 *   logoUrl?: string,
 *   logoWidth?: number,
 * }} StarterSender
 */

function escapeXml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SIDE = 'padding-left="32px" padding-right="32px"';
const TEXT = `font-family="${FONT_STACK}" color="${PALETTE.ink}"`;

/**
 * @param {{
 *   sender?: StarterSender,
 *   buttonUrl?: string,
 *   t?: import('../../i18n/index.js').Translate,
 * }} [options]
 */
export function createStarterMjml({ sender = {}, buttonUrl = DEFAULT_BUTTON_URL, t = identity } = {}) {
  const name = escapeXml(sender.name || t('Your company'));
  const footer = [name, sender.address ? escapeXml(sender.address) : ''].filter(Boolean).join(' · ');
  const header = sender.logoUrl
    ? `<mj-image src="${escapeXml(sender.logoUrl)}" alt="${name}" width="${Number(sender.logoWidth) || 140}px" align="left" ${SIDE}></mj-image>`
    : `<mj-text ${TEXT} font-size="18px" line-height="24px" font-weight="bold" ${SIDE}>${name}</mj-text>`;

  return [
    '<mjml>',
    `<mj-body background-color="${PALETTE.canvas}" width="600px">`,
    // Header: logo or sender name.
    `<mj-section background-color="${PALETTE.surface}" padding-top="28px" padding-bottom="8px">`,
    '<mj-column>',
    header,
    '</mj-column>',
    '</mj-section>',
    // Body: headline, text, button.
    `<mj-section background-color="${PALETTE.surface}" padding-top="8px" padding-bottom="28px">`,
    '<mj-column>',
    `<mj-text ${TEXT} font-size="24px" line-height="32px" font-weight="bold" ${SIDE}>${escapeXml(t('Your headline'))}</mj-text>`,
    `<mj-text ${TEXT} font-size="15px" line-height="24px" ${SIDE}>` +
      `${escapeXml(t('Hello {name},', { name: '{{contact.firstname}}' }))}<br /><br />${escapeXml(t('Your text.'))}</mj-text>`,
    `<mj-button href="${escapeXml(buttonUrl)}" background-color="${PALETTE.navy}" color="${PALETTE.white}" ` +
      `font-family="${FONT_STACK}" font-size="15px" font-weight="bold" border-radius="6px" ` +
      `inner-padding="12px 28px" align="left" ${SIDE}>${escapeXml(t('Learn more'))}</mj-button>`,
    '</mj-column>',
    '</mj-section>',
    // Footer: sender and unsubscribe link.
    '<mj-section padding-top="20px" padding-bottom="28px">',
    '<mj-column>',
    `<mj-text font-family="${FONT_STACK}" font-size="12px" line-height="18px" color="#6d7484" align="center" ${SIDE}>` +
      `${footer}<br />` +
      `<a href="{{ unsubscribe }}" style="color:#6d7484;text-decoration:underline;">${escapeXml(t('Unsubscribe'))}</a>` +
      '</mj-text>',
    '</mj-column>',
    '</mj-section>',
    '</mj-body>',
    '</mjml>',
  ].join('');
}

/** The starter template with default (English) texts. */
export const STARTER_MJML = createStarterMjml();
