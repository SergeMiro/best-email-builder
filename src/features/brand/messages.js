// @ts-check
/**
 * What the user is told about reading a brand from a website: why it failed
 * (the server's answer) and what it could not find (notes under the field).
 * English source strings, translated where they are shown.
 */

/**
 * Why a website could not be read: [HTTP status, message], by
 * BrandImportError code (src/server/brandImport.js).
 * @type {Record<string, [number, string]>}
 */
export const BRAND_IMPORT_ERRORS = {
  BAD_URL: [400, 'Enter the address of a website, like acme.com'],
  PRIVATE_ADDRESS: [400, 'This address is not a public website'],
  UNREACHABLE: [422, 'The website could not be reached. Check the address.'],
  TIMEOUT: [422, 'The website took too long to answer'],
  HTTP_ERROR: [422, 'The website does not let the builder read it. Fill in your brand below.'],
  NOT_HTML: [422, 'This address is not a web page'],
  TOO_MANY_REDIRECTS: [422, 'The website redirects too many times'],
  TOO_LARGE: [422, 'The website sent too much data'],
};

/** What could not be read, by note code. @type {Record<string, string>} */
export const BRAND_NOTES = {
  LOGO_NOT_FOUND: 'No logo was found on the website. Upload it below.',
  LOGO_UNSUPPORTED: 'The logo on the website is an SVG or WebP image, which most email apps do not show. Upload a PNG or JPEG version.',
  LOGO_ICON: 'The website icon is used as the logo. Upload your full logo if you have one.',
  COLORS_NOT_FOUND: 'No main color was found on the website. Pick one below.',
};
