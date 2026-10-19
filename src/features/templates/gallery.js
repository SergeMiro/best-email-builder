// @ts-check
/**
 * TEMPLATE GALLERY — ready-made emails to start from.
 *
 * Each entry builds its MJML from the same pieces as the blocks (palette,
 * web-safe fonts, longhand paddings) and ends with the sender's footer and the
 * unsubscribe link: a template picked here passes the server's quality checks
 * as it is. Texts go through `t()`, so a French interface starts from French
 * emails.
 *
 * Images are left EMPTY on purpose (the canvas shows a frame to fill): a
 * sample photo from a third-party service would, one day, end up in a real
 * send. Thumbnails replace them with a grey placeholder (`withThumbnailImages`).
 *
 * The list is plain data: pass your own to `<EmailBuilder templates>`, or `[]`
 * to hide the gallery.
 */

import { identity } from '../../i18n/index.js';
export { withThumbnailImages, withPlaceholderImages } from './thumbnails.js';
import { DEFAULT_BUTTON_URL, FONT_STACK, PALETTE } from '../../blocks/shared.js';
import { SOCIAL_NETWORKS } from '../../blocks/social/index.js';
import { SIDE, createStarterMjml, escapeXml, footerSectionMjml, senderHeaderMjml } from './starter.js';

/**
 * @typedef {import('./starter.js').StarterSender} StarterSender
 * @typedef {import('../../i18n/index.js').Translate} Translate
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   create: (options: {sender: StarterSender, t: Translate}) => string,
 *   meta?: (t: Translate) => {subject?: string, preheader?: string},
 * }} GalleryTemplate
 */

const WHITE_SECTION = `background-color="${PALETTE.surface}"`;

/**
 * White section, paddings in longhand (see core/mjmlAttributes).
 * @param {string} inner @param {{top?: number, bottom?: number, x?: number}} [padding]
 */
function section(inner, { top = 8, bottom = 8, x = 0 } = {}) {
  const sides = x ? ` padding-left="${x}px" padding-right="${x}px"` : '';
  return `<mj-section ${WHITE_SECTION} padding-top="${top}px" padding-bottom="${bottom}px"${sides}>${inner}</mj-section>`;
}

/** @param {string} inner @param {string} [attrs] */
function column(inner, attrs = '') {
  return `<mj-column${attrs ? ` ${attrs}` : ''}>${inner}</mj-column>`;
}

/** @param {string} text @param {{size?: number, color?: string, align?: string, side?: boolean}} [o] */
function heading(text, { size = 24, color = PALETTE.navy, align = 'left', side = true } = {}) {
  return (
    `<mj-text font-family="${FONT_STACK}" font-size="${size}px" line-height="${Math.round(size * 1.3)}px" ` +
    `font-weight="bold" color="${color}" align="${align}"${side ? ` ${SIDE}` : ''}>${text}</mj-text>`
  );
}

/** @param {string} html @param {{size?: number, color?: string, align?: string, side?: boolean}} [o] */
function paragraph(html, { size = 15, color = PALETTE.ink, align = 'left', side = true } = {}) {
  return (
    `<mj-text font-family="${FONT_STACK}" font-size="${size}px" line-height="${Math.round(size * 1.6)}px" ` +
    `color="${color}" align="${align}"${side ? ` ${SIDE}` : ''}>${html}</mj-text>`
  );
}

/** @param {string} label @param {{align?: string, background?: string, color?: string, side?: boolean}} [o] */
function button(label, { align = 'left', background = PALETTE.navy, color = PALETTE.white, side = true } = {}) {
  return (
    `<mj-button href="${DEFAULT_BUTTON_URL}" background-color="${background}" color="${color}" ` +
    `font-family="${FONT_STACK}" font-size="15px" font-weight="bold" border-radius="6px" ` +
    `inner-padding="12px 28px" align="${align}"${side ? ` ${SIDE}` : ''}>${label}</mj-button>`
  );
}

const IMAGE = '<mj-image align="center"></mj-image>';

/** @param {StarterSender} sender @param {Translate} t */
function header(sender, t) {
  return `<mj-section ${WHITE_SECTION} padding-top="28px" padding-bottom="8px">${column(senderHeaderMjml(sender, t))}</mj-section>`;
}

/** A coloured banner: title, sentence, button — the Hero banner block. */
function banner({ title, text, cta, background = PALETTE.navy }) {
  return (
    `<mj-section background-color="${background}" background-size="cover" background-position="center center" ` +
    'background-repeat="no-repeat" padding-top="48px" padding-bottom="48px">' +
    column(
      heading(title, { size: 30, color: PALETTE.white, align: 'center' }) +
        paragraph(text, { size: 16, color: PALETTE.border, align: 'center' }) +
        (cta ? button(cta, { align: 'center', background: PALETTE.white, color: PALETTE.navy }) : '')
    ) +
    '</mj-section>'
  );
}

function social() {
  const elements = ['facebook-noshare', 'instagram-noshare', 'linkedin-noshare']
    .map((name) => `<mj-social-element name="${name}" href="${SOCIAL_NETWORKS.find((n) => n.value === name)?.href}"></mj-social-element>`)
    .join('');
  return section(
    column(
      `<mj-social mode="horizontal" align="center" icon-size="28px" border-radius="14px" inner-padding="6px">${elements}</mj-social>`
    ),
    { top: 16, bottom: 16 }
  );
}

/** @param {string} body */
function email(body) {
  return `<mjml><mj-body background-color="${PALETTE.canvas}" width="600px">${body}</mj-body></mjml>`;
}

const esc = escapeXml;

/** @type {GalleryTemplate[]} */
export const TEMPLATE_GALLERY = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty page to build from scratch',
    create: () => email(''),
  },
  {
    id: 'simple',
    name: 'Simple',
    description: 'Logo, headline, text and a button',
    create: ({ sender, t }) => createStarterMjml({ sender, t }),
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'Monthly news: banner, two articles, highlights',
    meta: (t) => ({
      subject: t('The news of the month'),
      preheader: t('What changed, what is coming, and two stories worth your time.'),
    }),
    create: ({ sender, t }) =>
      email(
        header(sender, t) +
          banner({
            title: esc(t('The news of the month')),
            text: esc(t('What changed, what is coming, and two stories worth your time.')),
            cta: null,
          }) +
          [1, 2]
            .map((n) =>
              section(
                column(IMAGE, 'vertical-align="middle"') +
                  column(
                    heading(esc(t('Article {n}', { n })), { size: 20, side: false }) +
                      paragraph(esc(t('Two or three sentences that sum up the story and make people want the rest.')), {
                        side: false,
                      }) +
                      button(esc(t('Read more')), { side: false }),
                    'vertical-align="middle"'
                  ),
                { top: 16, bottom: 16, x: 16 }
              )
            )
            .join('') +
          section(column(heading(esc(t('In brief')), { size: 20 })), { top: 20, bottom: 0 }) +
          section(
            [t('A new feature'), t('An event'), t('A tip')]
              .map((title) =>
                column(
                  heading(esc(title), { size: 16, side: false }) +
                    paragraph(esc(t('One sentence about it.')), { size: 14, side: false })
                )
              )
              .join(''),
            { bottom: 20, x: 16 }
          ) +
          social() +
          footerSectionMjml(sender, t)
      ),
  },
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'Greets a new customer and lists the first steps',
    meta: (t) => ({ subject: t('Welcome aboard!'), preheader: t('Three steps to get started.') }),
    create: ({ sender, t }) =>
      email(
        header(sender, t) +
          section(
            column(
              heading(esc(t('Welcome, {name}!', { name: '{{contact.firstname}}' })), { size: 28 }) +
                paragraph(esc(t('Thank you for joining us. Here is how to get the most out of your account.')))
            ),
            { top: 16, bottom: 8 }
          ) +
          section(
            [
              [t('1. Complete your profile'), t('So we can tailor what we send you.')],
              [t('2. Explore'), t('Take a tour of what you can do.')],
              [t('3. Ask us anything'), t('Reply to this email: a person reads it.')],
            ]
              .map(([title, text]) =>
                column(
                  heading(esc(title), { size: 16, side: false }) + paragraph(esc(text), { size: 14, side: false }),
                  `background-color="${PALETTE.canvas}" padding-top="12px" padding-bottom="12px" padding-left="12px" padding-right="12px"`
                )
              )
              .join(''),
            { x: 24 }
          ) +
          section(column(button(esc(t('Get started')), { align: 'center' })), { top: 16, bottom: 28 }) +
          footerSectionMjml(sender, t)
      ),
  },
  {
    id: 'promotion',
    name: 'Promotion',
    description: 'A sale with a discount code and two products',
    meta: (t) => ({ subject: t('30% off this weekend only'), preheader: t('With the code SPRING30, until Sunday midnight.') }),
    create: ({ sender, t }) =>
      email(
        header(sender, t) +
          banner({
            title: esc(t('30% off everything')),
            text: esc(t('This weekend only, with the code SPRING30.')),
            cta: esc(t('Shop the sale')),
            background: PALETTE.brand,
          }) +
          section(
            [t('Product one'), t('Product two')]
              .map((name) =>
                column(
                  IMAGE +
                    heading(esc(name), { size: 18, side: false }) +
                    paragraph(esc(t('€49 instead of €70')), { size: 15, side: false }) +
                    button(esc(t('Buy')), { side: false })
                )
              )
              .join(''),
            { top: 20, bottom: 20, x: 16 }
          ) +
          section(
            column(
              paragraph(esc(t('Offer valid until Sunday midnight, while stocks last.')), {
                size: 12,
                color: '#6d7484',
                align: 'center',
              })
            )
          ) +
          footerSectionMjml(sender, t)
      ),
  },
  {
    id: 'event',
    name: 'Event invitation',
    description: 'Date, place and a button to book a seat',
    meta: (t) => ({ subject: t("You're invited"), preheader: t('Save the date — seats are limited.') }),
    create: ({ sender, t }) =>
      email(
        header(sender, t) +
          banner({
            title: esc(t("You're invited")),
            text: esc(t('An evening of talks and drinks with the team and our customers.')),
            cta: null,
          }) +
          section(
            column(heading(esc(t('When')), { size: 16, side: false }) + paragraph(esc(t('Thursday, 7 pm')), { side: false })) +
              column(heading(esc(t('Where')), { size: 16, side: false }) + paragraph(esc(t('Our offices, 1 Main Street')), { side: false })),
            { top: 24, x: 16 }
          ) +
          section(
            column(
              paragraph(esc(t('Seats are limited: book yours now, it takes ten seconds.'))) +
                button(esc(t('Book my seat')), { align: 'left' })
            ),
            { bottom: 28 }
          ) +
          footerSectionMjml(sender, t)
      ),
  },
];

/**
 * The gallery with its texts translated and the sender applied.
 *
 * @param {{templates?: GalleryTemplate[], sender?: StarterSender, t?: Translate}} [options]
 * @returns {{id: string, name: string, description: string, mjml: string, subject: string, preheader: string}[]}
 */
export function buildGallery({ templates = TEMPLATE_GALLERY, sender = {}, t = identity } = {}) {
  return templates.map((template) => {
    const meta = template.meta ? template.meta(t) : {};
    return {
      id: template.id,
      name: t(template.name),
      description: t(template.description),
      mjml: template.create({ sender, t }),
      subject: meta.subject || '',
      preheader: meta.preheader || '',
    };
  });
}
