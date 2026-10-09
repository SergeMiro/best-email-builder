// @ts-check
/**
 * QUALITY CHECKS for a template — issues that do not block saving, but that
 * should be known before sending.
 *
 *   missing unsubscribe      a legal requirement for bulk sending;
 *   image without file       an empty frame for the recipient;
 *   image without alt text   Outlook blocks images by default: the alternative
 *                            text is then all that can be read;
 *   button without link      a button that leads nowhere;
 *   http link                flagged as "not secure" by some email clients;
 *   empty subject            the message goes out as "(no subject)";
 *   size > 102 KB            Gmail clips the message and hides the end —
 *                            including the unsubscribe link.
 *
 * Dependency-free module: used by the preview (server) and tested under Node.
 */

import { identity } from '../i18n/index.js';

/** Gmail threshold beyond which the message is clipped ("[Message clipped]"). */
export const GMAIL_CLIP_BYTES = 102 * 1024;

/**
 * @typedef {{code: string, level: 'warning'|'info', message: string, count?: number}} QualityIssue
 */

/** @param {string} source @param {RegExp} pattern */
function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

/**
 * @param {{mjml: string, html?: string, subject?: string|null}} input
 * @param {{t?: import('../i18n/index.js').Translate}} [options]
 * @returns {QualityIssue[]}
 */
export function qualityReport({ mjml, html = '', subject = null }, { t = identity } = {}) {
  const source = String(mjml || '');
  /** @type {QualityIssue[]} */
  const issues = [];

  if (!/\{\{\s*unsubscribe\s*\}\}|\[UNSUBSCRIBE\]/i.test(source)) {
    issues.push({ code: 'NO_UNSUBSCRIBE', level: 'warning', message: t('Missing unsubscribe link') });
  }

  const images = source.match(/<mj-image\b[^>]*>/gi) || [];
  const noSrc = images.filter((tag) => !/\ssrc="[^"]+"/i.test(tag)).length;
  if (noSrc) {
    issues.push({
      code: 'IMAGE_NO_SRC',
      level: 'warning',
      count: noSrc,
      message: t('Image without file ({count})', { count: noSrc }),
    });
  }
  const noAlt = images.filter((tag) => !/\salt="[^"]+"/i.test(tag)).length;
  if (noAlt) {
    issues.push({
      code: 'IMAGE_NO_ALT',
      level: 'warning',
      count: noAlt,
      message: t('Image without alt text ({count})', { count: noAlt }),
    });
  }

  const noHref = count(source, /<mj-button\b(?![^>]*\shref="[^"]+")[^>]*>/gi);
  if (noHref) {
    issues.push({
      code: 'BUTTON_NO_LINK',
      level: 'warning',
      count: noHref,
      message: t('Button without link ({count})', { count: noHref }),
    });
  }

  const http = count(source, /\shref="http:\/\//gi);
  if (http) {
    issues.push({
      code: 'HTTP_LINK',
      level: 'info',
      count: http,
      message: t('Insecure http link ({count})', { count: http }),
    });
  }

  if (subject !== null && !String(subject).trim()) {
    issues.push({ code: 'NO_SUBJECT', level: 'warning', message: t('Empty subject') });
  }

  const bytes = new TextEncoder().encode(String(html || '')).length;
  if (bytes > GMAIL_CLIP_BYTES) {
    issues.push({
      code: 'GMAIL_CLIP',
      level: 'warning',
      message: t('Message is {size} KB: Gmail clips messages over {limit} KB', {
        size: Math.round(bytes / 1024),
        limit: GMAIL_CLIP_BYTES / 1024,
      }),
    });
  }

  return issues;
}
