// @ts-check
/**
 * WHY AN AI REQUEST FAILED — in English keys the interface translates.
 * Status: the HTTP status the server answers with.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

export const GENERATION_ERRORS = {
  REFUSED: { status: 422, message: 'The AI declined this request.' },
  TRUNCATED: { status: 502, message: 'The answer was too long to finish. Try with less text.' },
  INVALID_ANSWER: { status: 502, message: 'The AI answer could not be read. Try again.' },
  INVALID_OUTPUT: { status: 502, message: 'The AI answer could not be used. Try again.' },
  NOTHING_TO_REWRITE: { status: 400, message: 'There is no text to rewrite.' },
  REWRITE_REFUSED: { status: 422, message: 'The AI declined to rewrite this text.' },
  REWRITE_UNUSABLE: { status: 502, message: 'The rewritten text lost a link or a variable, so nothing was changed. Try again.' },
  NOTHING_TO_SUGGEST: { status: 400, message: 'Write the email or a subject first: the ideas are drawn from it.' },
  SUBJECTS_REFUSED: { status: 422, message: 'The AI declined to suggest subjects for this email.' },
  SUBJECTS_UNUSABLE: { status: 502, message: 'No usable subject came back. Try again.' },
  NOTHING_TO_PROOFREAD: { status: 400, message: 'The email has no text to check yet.' },
  PROOFREAD_REFUSED: { status: 422, message: 'The AI declined to check this email.' },
  // The provider's side (providers.js). Never 401 to the browser: the key is the AI's, not the user's session.
  KEY_MISSING: { status: 502, message: 'Connect an AI provider first: it needs a key.' },
  KEY_REFUSED: { status: 502, message: 'The AI provider refused the key. Check it, or use another one.' },
  MODEL_UNAVAILABLE: { status: 502, message: 'The AI provider does not have this model. Choose another one.' },
  MODEL_CREDITS: { status: 502, message: 'The AI provider account has no credits left.' },
  MODEL_BUSY: { status: 503, message: 'The AI is busy right now. Try again in a minute.' },
  MODEL_ERROR: { status: 502, message: 'The AI provider could not answer. Try again.' },
};

export class EmailGenerationError extends Error {
  /**
   * @param {keyof typeof GENERATION_ERRORS} code
   * @param {string} [detail]  what went wrong, for logs and for the model
   */
  constructor(code, detail = '') {
    const known = GENERATION_ERRORS[code] || GENERATION_ERRORS.INVALID_OUTPUT;
    super(known.message);
    this.name = 'EmailGenerationError';
    this.code = code;
    this.status = known.status;
    this.detail = detail || known.message;
  }
}

/**
 * Markup a model escaped twice — `<a href=\\"…\\">` once the JSON is read —
 * decoded once more. Markup with real quotes is left as it is.
 * @param {string} markup
 */
export function unescapedTwice(markup) {
  if (!/=\\"/.test(markup) || /=\s*"/.test(markup.replace(/=\\"/g, ''))) return markup;
  try {
    const decoded = JSON.parse(`"${markup}"`);
    if (typeof decoded === 'string') return decoded;
  } catch {
    // Not a JSON string body (a raw line break…): the quotes alone.
  }
  return markup.replace(/\\"/g, '"').replace(/\\n/g, '\n');
}

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
