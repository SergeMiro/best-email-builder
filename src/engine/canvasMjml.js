// @ts-check
/**
 * CANVAS MJML — the email as the canvas compiles it.
 *
 * The canvas shows the REAL compiled email (mjml-browser), not an imitation:
 * what you see is the HTML Outlook, Gmail and Apple Mail will get. To find an
 * element of the model in that HTML, every element is marked through MJML's
 * own `css-class` attribute, which MJML copies onto the element's HTML box:
 *
 *   eb-node eb-id-<id> eb-tag-<tag>
 *
 * Canvas-only additions, never in the exported MJML:
 *   - an image without a file shows a grey frame saying where to choose one;
 *   - an empty column shows "Drop a block here" (it would be zero pixels high
 *     and impossible to drop into);
 *   - an empty email shows the same hint in a section.
 * None of them carries an id: clicking them selects their container.
 */

import { serializeMjml } from './mjml.js';
import { isAssetPath } from '../renderer/links.js';
import { IMAGE_ATTRIBUTES } from '../validation/urls.js';

/** @typedef {import('./model.js').EmailNode} EmailNode */

/** Elements that accept `css-class` (MJML copies it onto their HTML box). */
const MARKED_TAGS = new Set([
  'mj-body',
  'mj-wrapper',
  'mj-section',
  'mj-group',
  'mj-column',
  'mj-hero',
  'mj-text',
  'mj-image',
  'mj-button',
  'mj-divider',
  'mj-spacer',
  'mj-social',
  'mj-social-element',
  'mj-navbar',
  'mj-navbar-link',
  'mj-table',
]);

export const NODE_CLASS = 'eb-node';
export const ID_CLASS_PREFIX = 'eb-id-';
export const TAG_CLASS_PREFIX = 'eb-tag-';
export const PLACEHOLDER_CLASS = 'eb-placeholder';

/** @param {string} text */
function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Grey frame of an image without a file (an SVG data URL, canvas only),
 * drawn at the width it will be shown so its text stays readable in a narrow
 * column (it says where to choose the image only when there is room).
 * @param {string} label @param {number} [width]
 */
export function imagePlaceholder(label, width = 600) {
  const w = Math.max(80, Math.round(width));
  const h = w >= 360 ? 200 : Math.max(90, Math.round(w * 0.62));
  const showText = w >= 220;
  const iconY = showText ? Math.round(h / 2) - 26 : Math.round(h / 2) - 15;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="#e9edf3"/>` +
    `<g fill="none" stroke="#8a94a6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" transform="translate(${Math.round(w / 2) - 18} ${iconY})">` +
    '<rect x="1" y="1" width="34" height="28" rx="4"/><circle cx="11" cy="10" r="3"/><path d="m35 21-8-8-17 17"/></g>' +
    (showText
      ? `<text x="${Math.round(w / 2)}" y="${iconY + 56}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#5b6475">${escapeXml(label)}</text>`
      : '') +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Width each image will roughly get: the body's width shared by the columns
 * of its section (or the column's own width), minus MJML's default padding.
 * @param {EmailNode} root
 * @returns {Map<string, number>}
 */
function imageWidths(root) {
  /** @type {Map<string, number>} */
  const widths = new Map();
  /** @param {string|undefined} value @param {number} of */
  const size = (value, of) => {
    const n = Number.parseFloat(String(value || ''));
    if (!Number.isFinite(n)) return null;
    return String(value).trim().endsWith('%') ? (of * n) / 100 : n;
  };
  /** @param {EmailNode} node @param {number} available */
  const visit = (node, available) => {
    if (node.tag === 'mj-image') {
      widths.set(node.id, size(node.attributes.width, available) || Math.max(60, available - 50));
      return;
    }
    let inner = available;
    if (node.tag === 'mj-body') inner = size(node.attributes.width, 600) || 600;
    const columns = node.children.filter((c) => c.tag === 'mj-column');
    for (const child of node.children) {
      const share = child.tag === 'mj-column' ? size(child.attributes.width, inner) || inner / Math.max(1, columns.length) : inner;
      visit(child, share);
    }
  };
  visit(root, 600);
  return widths;
}

/**
 * Uploaded images (`/email-assets/<key>`) at the address the page can show
 * them from: the template keeps the path.
 * @param {Record<string, string>} attributes
 * @param {(path: string) => string} imageUrl
 */
function shownImages(attributes, imageUrl) {
  /** @type {Record<string, string>|null} */ let shown = null;
  for (const [name, value] of Object.entries(attributes)) {
    if (!IMAGE_ATTRIBUTES.has(name) || !isAssetPath(value)) continue;
    shown = shown || { ...attributes };
    shown[name] = imageUrl(value.trim()) || value;
  }
  return shown || attributes;
}

/**
 * @param {EmailNode} root
 * @param {{t?: (key: string) => string, imageUrl?: ((path: string) => string)|null}} [options]
 *   `imageUrl`: where the page shows an uploaded image from (see the storage's `imageUrl`).
 * @returns {string}
 */
export function canvasMjml(root, { t = (key) => key, imageUrl = null } = {}) {
  const imageLabel = t('Choose an image in the panel');
  const widths = imageWidths(root);
  const dropLabel = t('Drop a block here');
  const hint = (padding) =>
    `<mj-text css-class="${PLACEHOLDER_CLASS}" align="center" color="#7b8496" font-family="Arial, Helvetica, sans-serif" ` +
    `font-size="13px" line-height="20px" padding="${padding}">${escapeXml(dropLabel)}</mj-text>`;

  return serializeMjml(root, {
    pretty: false,
    attributes(node) {
      const shown = imageUrl ? shownImages(node.attributes, imageUrl) : node.attributes;
      if (!MARKED_TAGS.has(node.tag)) return shown;
      const own = node.attributes['css-class'] ? `${node.attributes['css-class']} ` : '';
      /** @type {Record<string, string>} */
      const attributes = {
        ...shown,
        'css-class': `${own}${NODE_CLASS} ${ID_CLASS_PREFIX}${node.id} ${TAG_CLASS_PREFIX}${node.tag}`,
      };
      if (node.tag === 'mj-image' && !node.attributes.src) {
        attributes.src = imagePlaceholder(imageLabel, widths.get(node.id));
        if (!attributes.alt) attributes.alt = imageLabel;
      }
      return attributes;
    },
    extraChildren(node) {
      if (node.tag === 'mj-column' && node.children.length === 0) return hint('24px 10px');
      if (node.tag === 'mj-body' && node.children.length === 0) {
        return `<mj-section css-class="${PLACEHOLDER_CLASS}"><mj-column>${hint('48px 10px')}</mj-column></mj-section>`;
      }
      return '';
    },
  });
}

/**
 * Id of the model element an HTML element belongs to (its own marker or its
 * closest marked ancestor's), or null.
 * @param {Element|null} element
 * @returns {{id: string, element: Element}|null}
 */
export function markedAncestor(element) {
  let current = element;
  while (current && current.nodeType === 1) {
    const classes = current.classList;
    if (classes && classes.contains(NODE_CLASS)) {
      for (const name of classes) {
        if (name.startsWith(ID_CLASS_PREFIX) && !name.endsWith('-outlook')) {
          return { id: name.slice(ID_CLASS_PREFIX.length), element: current };
        }
      }
    }
    current = current.parentElement;
  }
  return null;
}
