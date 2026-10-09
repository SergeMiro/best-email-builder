// @ts-check
/**
 * Errors with an HTTP status: services throw them, the handler turns them into
 * JSON responses (`{ error, code }`). Any other error is a 500 whose message is
 * not exposed.
 */

export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {string} [code]
   */
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/** Validators and the document reader throw errors carrying a `status`. */
export function statusOf(error) {
  const status = Number(/** @type {any} */ (error)?.status);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
}
