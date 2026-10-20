// @ts-check
/**
 * Email builder constants.
 *
 * `EMAIL_BUILDER_VERSION` versions THIS package (UI, blocks, rendering);
 * `EMAIL_DOCUMENT_SCHEMA_VERSION` versions the stored JSON envelope (the
 * project JSON). Both are written with every template, so a document read by
 * a newer version knows whether it must be migrated (see `core/document.js`).
 */

export const EMAIL_BUILDER_VERSION = '0.12.0';

export const EMAIL_DOCUMENT_SCHEMA_VERSION = 1;

/** @typedef {'desktop'|'mobile'} EmailDevice */

/** @type {EmailDevice[]} */
export const EMAIL_DEVICES = ['desktop', 'mobile'];

/** Content column width — the email client standard. */
export const EMAIL_CONTENT_WIDTH = 600;

/** Mobile preview frame width (standard iPhone, the common worst case). */
export const EMAIL_MOBILE_WIDTH = 375;
