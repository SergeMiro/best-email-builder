// @ts-check
/**
 * BRAND IMPORT — reads a company's website on the server: its name, logo,
 * main color, headings color and font (what it reads: features/brand/extract.js).
 *
 * The server downloads a page someone typed the address of: that is a door
 * into the server's own network (SSRF) unless every request is held to
 * these rules —
 *
 *   - http and https only, ports 80 and 443, no user:password in the address;
 *   - every address the name resolves to must be PUBLIC: loopback, private
 *     networks, link-local (cloud metadata, 169.254.169.254), carrier NAT,
 *     multicast, documentation and reserved ranges are refused, IPv4 hidden
 *     in IPv6 (::ffff:10.0.0.1, 64:ff9b::/96, 2002::/16) included;
 *   - the check happens in the socket's own DNS lookup, so the address that
 *     was checked is the one connected to (no DNS rebinding between the two);
 *   - redirects are followed by hand, at most 4, each one checked again;
 *   - 8 seconds in all; sizes capped AFTER decompression (a small gzip can
 *     unpack to gigabytes): page 1.5 MB, each stylesheet 400 KB, logo 2 MB;
 *   - nothing downloaded is executed or served as is: the page and the CSS
 *     are only read as text, the logo is checked to be a PNG, JPEG or GIF
 *     and stored like any upload.
 *
 * Node only (node:dns, node:http, node:https, node:net, node:zlib).
 */

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import { cleanBrand } from '../features/brand/brand.js';
import { brandFromCss, imageSize, logoWidthFor, readPage } from '../features/brand/extract.js';
import { MAX_IMAGE_BYTES, detectImage } from '../validation/images.js';

/**
 * @typedef {'BAD_URL'|'PRIVATE_ADDRESS'|'UNREACHABLE'|'TIMEOUT'|'HTTP_ERROR'|'NOT_HTML'|'TOO_MANY_REDIRECTS'|'TOO_LARGE'} BrandImportCode
 * @typedef {'LOGO_NOT_FOUND'|'LOGO_UNSUPPORTED'|'LOGO_ICON'|'COLORS_NOT_FOUND'} BrandNote
 *   `LOGO_UNSUPPORTED`: the site's logo is an SVG or a WebP, which most email
 *   apps do not show; `LOGO_ICON`: the site's icon was used instead.
 *
 * @typedef {{
 *   brand: import('../features/brand/brand.js').Brand,
 *   logo: {bytes: Uint8Array, width: number, height: number, type: string, ext: string, shownWidth: number}|null,
 *   notes: BrandNote[],
 * }} BrandImport
 */

export const BRAND_IMPORT_LIMITS = {
  pageBytes: 1.5 * 1024 * 1024,
  cssBytes: 400 * 1024,
  logoBytes: MAX_IMAGE_BYTES,
  stylesheets: 4,
  logos: 5,
  redirects: 4,
  timeoutMs: 8000,
};

const USER_AGENT = 'BestEmailBuilder-BrandReader/1.0 (+https://github.com/SergeMiro/best-email-builder)';

/** Why an import failed; the handler turns `code` into a message. */
export class BrandImportError extends Error {
  /** @param {BrandImportCode} code @param {string} [detail] */
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'BrandImportError';
    this.code = code;
  }
}

/* ── Which addresses may be reached ─────────────────────────────────────── */

const blocked = new net.BlockList();
for (const [network, prefix] of /** @type {[string, number][]} */ ([
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
])) {
  blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of /** @type {[string, number][]} */ ([
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['::', 96], // IPv4-compatible (deprecated)
  ['100::', 64], // discard
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (deprecated)
  ['ff00::', 8], // multicast
])) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

/**
 * The IPv4 address an IPv6 one carries (mapped, NAT64, 6to4), or ''.
 * @param {string} address
 */
function embeddedIpv4(address) {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^(?:::ffff:(?:0:)?|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1];
  const groups = expandIpv6(lower);
  if (!groups) return '';
  const toV4 = (/** @type {number} */ hi, /** @type {number} */ lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  // ::ffff:a.b.c.d written in hex
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) return toV4(groups[6], groups[7]);
  // NAT64 64:ff9b::/96
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) return toV4(groups[6], groups[7]);
  // 6to4 2002:AABB:CCDD::/48
  if (groups[0] === 0x2002) return toV4(groups[1], groups[2]);
  return '';
}

/** The eight 16-bit groups of an IPv6 address, or null. @param {string} address */
function expandIpv6(address) {
  if (!net.isIPv6(address)) return null;
  let text = address.replace(/%.*$/, '');
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split('.').map(Number);
    text = text.replace(v4[1], `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`);
  }
  const [left, right = ''] = text.split('::');
  const head = left ? left.split(':') : [];
  const tail = text.includes('::') && right ? right.split(':') : [];
  const fill = text.includes('::') ? Array(8 - head.length - tail.length).fill('0') : [];
  const groups = [...head, ...fill, ...tail].map((g) => parseInt(g || '0', 16));
  return groups.length === 8 ? groups : null;
}

/**
 * May the server connect to this IP address? Public unicast only.
 * @param {string} address
 */
export function isPublicAddress(address) {
  const ip = String(address ?? '').replace(/^\[|\]$/g, '');
  const family = net.isIP(ip);
  if (family === 4) return !blocked.check(ip, 'ipv4');
  if (family === 6) {
    const v4 = embeddedIpv4(ip);
    if (v4) return !blocked.check(v4, 'ipv4');
    return !blocked.check(ip.replace(/%.*$/, ''), 'ipv6');
  }
  return false;
}

/**
 * A DNS lookup for the socket that refuses names leading anywhere but the
 * public internet: if ANY of the addresses is refused, none is used.
 * @param {(address: string) => boolean} allow
 */
function guardedLookup(allow) {
  /** @type {any} */
  const lookup = (/** @type {string} */ hostname, /** @type {any} */ options, /** @type {any} */ callback) => {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const list = /** @type {dns.LookupAddress[]} */ (/** @type {unknown} */ (addresses));
      if (!list.length || list.some((entry) => !allow(entry.address))) {
        return callback(new BrandImportError('PRIVATE_ADDRESS', hostname));
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
  return lookup;
}

/* ── Downloading ────────────────────────────────────────────────────────── */

/** The web's own ports. @param {number} port */
const isWebPort = (port) => port === 80 || port === 443;

/**
 * An address the importer may request, or a BrandImportError.
 * @param {string|URL} input
 * @param {(address: string) => boolean} allow
 * @param {(port: number) => boolean} [allowPort]
 */
function checkUrl(input, allow, allowPort = isWebPort) {
  let url;
  try {
    url = new URL(String(input));
  } catch {
    throw new BrandImportError('BAD_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BrandImportError('BAD_URL', url.protocol);
  if (url.username || url.password) throw new BrandImportError('BAD_URL', 'credentials');
  if (url.port && !allowPort(Number(url.port))) throw new BrandImportError('BAD_URL', `port ${url.port}`);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host) throw new BrandImportError('BAD_URL');
  // An IP written in the address skips the DNS lookup: checked here.
  if (net.isIP(host) && !allow(host)) throw new BrandImportError('PRIVATE_ADDRESS', host);
  return url;
}

/**
 * What the user typed, as the address of a home page: "acme.com" →
 * "https://acme.com/".
 * @param {unknown} input
 */
export function siteUrl(input) {
  const text = String(input ?? '').trim();
  if (!text || text.length > 500 || /\s/.test(text)) throw new BrandImportError('BAD_URL');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new BrandImportError('BAD_URL');
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') && !net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw new BrandImportError('BAD_URL');
  }
  return url.href;
}

/**
 * GET one address and its redirects, under the rules above.
 * @param {string} address
 * @param {{
 *   allow: (address: string) => boolean,
 *   allowPort?: (port: number) => boolean,
 *   signal: AbortSignal,
 *   maxBytes: number,
 *   truncate?: boolean,
 *   accept?: string,
 *   redirects?: number,
 * }} options
 *   `truncate`: past `maxBytes`, keep what came (a page's head, the start of
 *   a stylesheet) instead of failing.
 * @returns {Promise<{bytes: Buffer, url: string, contentType: string}>}
 */
export async function safeGet(
  address,
  { allow, allowPort = isWebPort, signal, maxBytes, truncate = false, accept = '*/*', redirects = BRAND_IMPORT_LIMITS.redirects }
) {
  let url = checkUrl(address, allow, allowPort);
  for (let hop = 0; ; hop += 1) {
    const response = await requestOnce(url, { allow, signal, maxBytes, truncate, accept });
    if (response.location === null) return { bytes: response.bytes, url: url.href, contentType: response.contentType };
    if (hop >= redirects) throw new BrandImportError('TOO_MANY_REDIRECTS');
    url = checkUrl(new URL(response.location, url), allow, allowPort);
  }
}

/**
 * @param {URL} url
 * @param {{allow: (address: string) => boolean, signal: AbortSignal, maxBytes: number, truncate: boolean, accept: string}} options
 * @returns {Promise<{location: string|null, bytes: Buffer, contentType: string}>}
 */
function requestOnce(url, { allow, signal, maxBytes, truncate, accept }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortReason(signal));
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, {
      method: 'GET',
      agent: false,
      lookup: guardedLookup(allow),
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: accept,
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en;q=0.9, *;q=0.5',
      },
    });
    request.on('error', (error) => reject(toImportError(error, signal)));
    request.on('response', (response) => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        request.destroy();
        return resolve({ location: response.headers.location, bytes: Buffer.alloc(0), contentType: '' });
      }
      if (status < 200 || status >= 300) {
        response.resume();
        request.destroy();
        return reject(new BrandImportError('HTTP_ERROR', String(status)));
      }
      const encoding = String(response.headers['content-encoding'] || '').toLowerCase().trim();
      /** @type {NodeJS.ReadableStream} */
      let body = response;
      if (encoding === 'gzip' || encoding === 'x-gzip') body = response.pipe(zlib.createGunzip());
      else if (encoding === 'deflate') body = response.pipe(zlib.createInflate());
      else if (encoding === 'br') body = response.pipe(zlib.createBrotliDecompress());
      /** @type {Buffer[]} */
      const chunks = [];
      let size = 0;
      let done = false;
      const finish = (/** @type {Error|null} */ error) => {
        if (done) return;
        done = true;
        request.destroy();
        if (error) reject(error);
        else resolve({ location: null, bytes: Buffer.concat(chunks), contentType: String(response.headers['content-type'] || '') });
      };
      body.on('data', (/** @type {Buffer} */ chunk) => {
        if (done) return;
        if (size + chunk.length > maxBytes) {
          if (!truncate) return finish(new BrandImportError('TOO_LARGE'));
          chunks.push(chunk.subarray(0, maxBytes - size));
          size = maxBytes;
          return finish(null);
        }
        chunks.push(chunk);
        size += chunk.length;
      });
      body.on('end', () => finish(null));
      body.on('error', (error) => finish(toImportError(error, signal)));
      response.on('error', (error) => finish(toImportError(error, signal)));
      response.on('close', () => {
        if (!response.complete) finish(toImportError(new Error('connection closed'), signal));
      });
    });
    request.end();
  });
}

/** @param {AbortSignal} signal */
const abortReason = (signal) =>
  signal.reason?.name === 'TimeoutError' ? new BrandImportError('TIMEOUT') : Object.assign(new Error('Aborted'), { name: 'AbortError' });

/** @param {any} error @param {AbortSignal} signal */
function toImportError(error, signal) {
  if (error instanceof BrandImportError) return error;
  if (error?.cause instanceof BrandImportError) return error.cause;
  if (signal.aborted) return abortReason(signal);
  return new BrandImportError('UNREACHABLE', error?.code || error?.message || '');
}

/** The text of a page or stylesheet, in its declared charset. @param {Buffer} bytes @param {string} contentType */
function textOf(bytes, contentType) {
  const sniffed = bytes.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || sniffed || 'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/* ── The importer ───────────────────────────────────────────────────────── */

/**
 * @param {{
 *   timeoutMs?: number,
 *   allowAddress?: (address: string) => boolean,
 *   allowPort?: (port: number) => boolean,
 * }} [options]
 *   `allowAddress`, `allowPort`: which IP addresses and ports may be reached
 *   (default: public addresses, ports 80 and 443). Tests reading a local
 *   server loosen them; nothing else should.
 */
export function createBrandImporter({
  timeoutMs = BRAND_IMPORT_LIMITS.timeoutMs,
  allowAddress = isPublicAddress,
  allowPort = isWebPort,
} = {}) {
  /**
   * @param {unknown} input  the site's address, as typed ("acme.com" is fine)
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<BrandImport>}
   */
  async function importBrand(input, { signal } = {}) {
    const deadline = AbortSignal.timeout(timeoutMs);
    const all = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const get = (/** @type {string} */ address, /** @type {{maxBytes: number, truncate?: boolean, accept?: string}} */ options) =>
      safeGet(address, { allow: allowAddress, allowPort, signal: all, ...options });

    const page = await get(siteUrl(input), {
      maxBytes: BRAND_IMPORT_LIMITS.pageBytes,
      truncate: true,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
    });
    if (page.contentType && !/html|xml/i.test(page.contentType)) throw new BrandImportError('NOT_HTML', page.contentType);
    const reading = readPage(textOf(page.bytes, page.contentType), page.url);

    /** @type {BrandNote[]} */
    const notes = [];
    const [sheets, logo] = await Promise.all([
      Promise.all(
        reading.stylesheets.slice(0, BRAND_IMPORT_LIMITS.stylesheets).map((href) =>
          get(href, { maxBytes: BRAND_IMPORT_LIMITS.cssBytes, truncate: true, accept: 'text/css,*/*;q=0.1' })
            .then((sheet) => textOf(sheet.bytes, sheet.contentType))
            .catch((error) => {
              if (error?.name === 'AbortError') throw error;
              return '';
            })
        )
      ),
      (async () => {
        let unsupported = false;
        for (const candidate of reading.logos.slice(0, BRAND_IMPORT_LIMITS.logos)) {
          if (/\.(svg|webp|ico)(\?|#|$)/i.test(new URL(candidate.url).pathname)) {
            unsupported ||= candidate.from !== 'icon';
            continue;
          }
          let file;
          try {
            file = await get(candidate.url, { maxBytes: BRAND_IMPORT_LIMITS.logoBytes, accept: 'image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' });
          } catch (error) {
            if (/** @type {any} */ (error)?.name === 'AbortError') throw error;
            continue;
          }
          const bytes = new Uint8Array(file.bytes);
          const type = detectImage(bytes);
          const size = type && imageSize(bytes);
          if (!type || !size) {
            unsupported ||= candidate.from !== 'icon' && /svg|webp/i.test(file.contentType);
            continue;
          }
          if (size.width < 32 && size.height < 32) continue;
          if (candidate.from === 'icon') notes.push('LOGO_ICON');
          return { bytes, ...size, ...type };
        }
        notes.push(unsupported ? 'LOGO_UNSUPPORTED' : 'LOGO_NOT_FOUND');
        return null;
      })(),
    ]);

    const style = brandFromCss({ css: [reading.css, ...sheets].join('\n'), themeColor: reading.themeColor });
    if (!style.primary) notes.push('COLORS_NOT_FOUND');
    const brand = cleanBrand({ name: reading.name, website: page.url, ...style });
    return { brand, logo: logo && { ...logo, shownWidth: logoWidthFor(logo) }, notes };
  }

  return { import: importBrand };
}
