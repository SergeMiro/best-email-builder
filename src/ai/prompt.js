// @ts-check
/**
 * THE PROMPT that writes an email from scratch.
 *
 * Two parts:
 *   system   fixed: what the builder can edit and how a good email is made.
 *            The same for every request, so a provider can cache it;
 *   user     the request: the purpose and its brief (`purposes.js`), the
 *            user's details, the language, the sender and the variables.
 *
 * The rules in the system prompt are the builder's own conventions, the ones
 * the blocks and the gallery follow (see `blocks/shared.js`, `starter.js`):
 * longhand paddings, explicit fonts and colors on every text, web-safe fonts,
 * empty image sources. An email that follows them opens in the editor block
 * by block, and the canvas shows what will be sent.
 */

import { FONT_OPTIONS, PALETTE } from '../blocks/shared.js';

/**
 * @typedef {import('./purposes.js').EmailPurpose} EmailPurpose
 * @typedef {{key: string, label?: string}} PromptVariable
 * @typedef {{name?: string, address?: string, logoUrl?: string}} PromptSender
 */

/** JSON schema of the answer (structured output where the provider has it). */
export const EMAIL_DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Short internal name of the template' },
    subject: { type: 'string', description: 'Subject line' },
    preheader: { type: 'string', description: 'Preview text shown after the subject in the inbox' },
    mjml: { type: 'string', description: 'The complete MJML document' },
  },
  required: ['name', 'subject', 'preheader', 'mjml'],
  additionalProperties: false,
};

const FONTS = FONT_OPTIONS.map((option) => `"${option.value}"`).join(', ');

export const SYSTEM_PROMPT = `You are a senior email designer and copywriter. You write complete, ready-to-send marketing and transactional emails in MJML for a visual email builder. The user will open your email in the builder, edit it block by block and send it, so it must follow the builder's conventions exactly.

# Answer
Return one JSON object, nothing else: {"name": string, "subject": string, "preheader": string, "mjml": string}.
- name: a short internal template name (at most 50 characters), in the email's language.
- subject: at most 60 characters, specific and honest, no ALL CAPS words, no spam triggers ("FREE!!!", "$$$"), at most one emoji and only when the occasion is festive.
- preheader: 40 to 110 characters that complete the subject (never repeat it).
- mjml: the full MJML document.

# MJML the builder can edit
- Skeleton: <mjml><mj-body background-color="${PALETTE.canvas}" width="600px"> ...sections... </mj-body></mjml>. No <mj-head>: the builder adds the title, preview text and language itself.
- The body is a vertical stack of <mj-section>. Each section holds one to four <mj-column>. Content elements live only inside a column.
- Allowed elements, and only these: mj-section, mj-column, mj-text, mj-image, mj-button, mj-divider, mj-spacer, mj-social, mj-social-element.
- Never use mj-hero, mj-wrapper, mj-group, mj-table, mj-navbar, mj-raw, mj-style, mj-font, mj-include, mj-attributes, mj-class, the css-class attribute, <style> or <script>.
- Inside mj-text and mj-button, only simple inline HTML: <b>, <strong>, <i>, <em>, <u>, <br />, <a href="..." style="...">, <span style="...">, <p style="margin:0 0 12px 0;">, <ul>, <ol>, <li>. No <h1>-<h6>, <div>, <table> or <img> in text: a heading is an mj-text written large and bold.
- Inline style attributes only on <a>, <span>, <p>, <li>, and only for color, font-weight, font-style, text-decoration and margin.

# Attributes
- Padding ALWAYS as the four longhand attributes padding-top, padding-right, padding-bottom, padding-left. Never the padding="..." shorthand. The one exception: inner-padding on mj-button (shorthand, for example inner-padding="12px 28px").
- Every mj-text and mj-button sets font-family, font-size, line-height and color itself (plus font-weight="bold" when bold). Sizes in px: font-size="16px", line-height="24px".
- Fonts: web-safe only, one family for the whole email (at most two: one for headings, one for text): ${FONTS}. No web fonts.
- Side spacing: content elements of one-column sections take padding-left="32px" padding-right="32px". In two- to four-column sections use 12px to 16px on the sides of each element.
- Sections: background-color="${PALETTE.surface}" for content (or a brand tint), padding-top and padding-bottom between 8px and 48px. The email reads as one card on the ${PALETTE.canvas} body background.
- Column widths in percent only when unequal (for example width="40%" and width="60%"), always adding up to 100%.
- Images: <mj-image src="" alt="..." ...>. Leave src EMPTY: the user uploads their own pictures. Always write an alt that describes the picture to place, in the email's language. No background-url either. Use 0 to 3 images; product images in columns.
- Buttons: border-radius="6px", font-weight="bold", inner-padding="12px 28px", aligned like the text around them, href with an https URL. When the real URL is unknown, use https://example.com followed by a meaningful path (https://example.com/reset-password).
- Dividers: border-color in a light gray, border-width="1px".
- Social icons (only when the details ask for them, in the footer): <mj-social mode="horizontal" align="center" icon-size="28px" border-radius="14px" inner-padding="6px"> with <mj-social-element name="facebook-noshare" href="https://..."></mj-social-element>; names: facebook-noshare, instagram-noshare, linkedin-noshare, x-noshare, youtube-noshare, github-noshare.

# Design
- Structure: a header section (the sender's logo or name), a hero section, one to four body sections, a footer section. Three to eight sections in total.
- One brand color for buttons and accents (use the one given, otherwise ${PALETTE.brand} or a color that suits the occasion), text ${PALETTE.ink} on white, headings ${PALETTE.navy} or the brand color.
- Contrast: body text at least 4.5:1 against its background, large text and buttons at least 3:1. White text only on dark backgrounds.
- Type scale: main heading 28 to 32px with line-height 36 to 40px, section headings 20 to 22px, body 15 to 16px with line-height 24 to 26px, small print 12 to 13px.
- A hero is a section with a background color, a large heading, one sentence and usually the main button, centered.
- One primary call to action (two at most), with a clear 2- to 4-word label that starts with a verb. Repeat it at most once at the end of a long email.
- Mobile first: columns stack on phones, so each column must make sense on its own. Short paragraphs of one to three sentences.

# Copy
- Write the real email for the purpose and the details given: specific, useful, warm and concise. Never lorem ipsum, never meta comments.
- Personalize with the variables listed in the request, written exactly as {{key}}. A greeting gives the first name a natural default after a pipe, in the email's language, used when the name is unknown: Hello {{contact.firstname|there}},. Use no other {{...}} variable.
- Information that is not given and not in the variables (an order number, a date, a price, a code, an address) is written as a short placeholder in square brackets that the user will replace: [order number], [date], [20%]. Never invent facts that would be wrong.
- Links read as what they do ("Reset my password", "See the collection"), never "click here".
- The footer (last section): the sender's name and postal address (or [Company address]) in 12px #6d7484 text, centered, and the footer line the request asks for. The unsubscribe link is exactly <a href="{{ unsubscribe }}" style="color:#6d7484;text-decoration:underline;">...</a>.
- Keep the MJML under 30 KB.`;

/** Footer line asked for each kind of purpose. @type {Record<string, string>} */
const FOOTER_RULES = {
  marketing: 'This is a marketing email: the footer MUST contain the unsubscribe link (href="{{ unsubscribe }}").',
  transactional:
    'This is a transactional email: the footer contains a discreet "Manage email preferences" link with href="{{ unsubscribe }}".',
  security:
    'This is a security email: NO unsubscribe or preferences link. The footer says in one line why the recipient got this email.',
};

/**
 * English name of a language code ("fr" → "French"), the code itself when
 * the runtime does not know it.
 * @param {string} code
 */
export function languageName(code) {
  const value = String(code || 'en');
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(value) || value;
  } catch {
    return value;
  }
}

/** One line per variable, the unsubscribe link left to the footer rule. @param {PromptVariable[]} variables */
function variableLines(variables) {
  return variables
    .filter((variable) => variable.key !== 'unsubscribe')
    .map((variable) => `- {{${variable.key}}}${variable.label ? `: ${variable.label}` : ''}`)
    .join('\n');
}

/**
 * The request message.
 *
 * @param {{
 *   purpose?: EmailPurpose|null,
 *   details?: string,
 *   language?: string,
 *   sender?: PromptSender,
 *   brand?: {primary?: string, heading?: string, font?: string},
 *   variables?: PromptVariable[],
 * }} input
 */
export function buildUserPrompt({ purpose = null, details = '', language = 'en', sender = {}, brand = {}, variables = [] }) {
  const lines = [];
  if (purpose) {
    lines.push(`Write a "${purpose.label}" email.`, '', `Brief: ${purpose.brief}`);
  } else {
    lines.push('Write the email described below.');
  }
  const extra = String(details || '').trim();
  if (extra) lines.push('', 'Details from the user (they take precedence over the brief):', extra);
  lines.push(
    '',
    `Language: write everything in ${languageName(language)}, unless the details ask for another language.`,
    '',
    'Sender:',
    `- name: ${sender.name?.trim() || '[Company name]'}`,
    `- postal address: ${sender.address?.trim() || '[Company address]'}`,
    sender.logoUrl
      ? `- logo: put <mj-image src="${sender.logoUrl}" alt="${sender.name || 'Logo'}" width="140px" align="left"> in the header (this is the one image whose src you fill).`
      : '- logo: none, write the sender name in bold in the header.'
  );
  const look = [
    brand.primary && `- main color (buttons, banners, links): ${brand.primary}`,
    brand.heading && `- headings color: ${brand.heading}`,
    brand.font && `- font: font-family="${brand.font}" on every text and button`,
  ].filter(Boolean);
  if (look.length) lines.push('', 'Brand (use exactly these):', ...look);
  const vars = variableLines(variables);
  if (vars) lines.push('', 'Variables you may use:', vars);
  lines.push('', FOOTER_RULES[purpose?.kind || 'marketing']);
  return lines.join('\n');
}

/**
 * The message that asks the model to correct its email.
 * @param {string[]} problems
 */
export function buildRepairPrompt(problems) {
  return [
    'The email cannot be opened in the builder as it is. Fix these problems and return the complete corrected JSON object:',
    ...problems.map((problem) => `- ${problem}`),
  ].join('\n');
}
