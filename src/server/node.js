// @ts-check
/**
 * Bridge between a Fetch-API handler and Node's `http` / Express / Connect.
 *
 *   app.use(toNodeListener(handler));                 // Express
 *   http.createServer(toNodeListener(handler))         // plain Node
 *
 * Requests the handler does not own (404 with code ROUTE_NOT_FOUND, outside its
 * routes) are passed to `next()` when there is one.
 */

import { Readable } from 'node:stream';

/**
 * @param {(request: Request) => Promise<Response>} handler
 * @param {{origin?: string}} [options]
 */
export function toNodeListener(handler, { origin } = {}) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {(error?: unknown) => void} [next]
   */
  return async function listener(req, res, next) {
    try {
      const host = origin || `http://${req.headers.host || 'localhost'}`;
      const url = new URL(req.url || '/', host);
      const method = (req.method || 'GET').toUpperCase();
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else if (value !== undefined) headers.set(key, value);
      }
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const request = new Request(url, {
        method,
        headers,
        body: hasBody ? /** @type {any} */ (Readable.toWeb(req)) : undefined,
        // @ts-ignore — required by Node for streamed bodies
        duplex: hasBody ? 'half' : undefined,
      });
      const response = await handler(request);
      if (response.status === 404 && next) {
        const body = await response.clone().json().catch(() => null);
        if (body?.code === 'ROUTE_NOT_FOUND') return next();
      }
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      if (!response.body || method === 'HEAD') {
        res.end();
        return;
      }
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      if (next) next(error);
      else {
        res.statusCode = 500;
        res.end();
      }
    }
  };
}
