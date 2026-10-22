// @ts-check
/** @typedef {import('./EmailEditor.js').TextFormat} TextFormat */

/** No text is being edited: nothing to show pressed. @type {TextFormat} */
export const NO_FORMAT = Object.freeze({ editing: false, bold: false, italic: false, underline: false, strike: false, link: null });
