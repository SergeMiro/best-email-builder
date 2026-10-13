// @ts-check
/**
 * MJML DEFAULTS — what MJML 5 renders when an attribute is not written.
 *
 * The properties panel shows them, greyed, in empty fields: an empty
 * "Padding" of a section is not "0" — MJML gives it 20 px above and below,
 * and the panel must say so (and start from there when one side is edited).
 *
 * Copied from the `defaultAttributes` of the mjml 5 components (the same
 * version the server and the canvas compile with); the unit tests check them
 * against the installed components.
 */

/** @type {Record<string, Record<string, string>>} */
export const MJML_DEFAULTS = {
  'mj-body': { width: '600px' },
  'mj-section': {
    'background-repeat': 'repeat',
    'background-size': 'auto',
    'background-position': 'top center',
    padding: '20px 0',
    'text-align': 'center',
  },
  'mj-wrapper': { 'background-repeat': 'repeat', 'background-size': 'auto', 'background-position': 'top center', padding: '20px 0' },
  'mj-column': { 'vertical-align': 'top' },
  'mj-text': {
    align: 'left',
    color: '#000000',
    'font-family': 'Ubuntu, Helvetica, Arial, sans-serif',
    'font-size': '13px',
    'line-height': '1',
    padding: '10px 25px',
  },
  'mj-image': { align: 'center', height: 'auto', padding: '10px 25px' },
  'mj-button': {
    align: 'center',
    'background-color': '#414141',
    'border-radius': '3px',
    color: '#ffffff',
    'font-family': 'Ubuntu, Helvetica, Arial, sans-serif',
    'font-size': '13px',
    'font-weight': 'normal',
    'inner-padding': '10px 25px',
    'line-height': '120%',
    padding: '10px 25px',
  },
  'mj-divider': { 'border-color': '#000000', 'border-style': 'solid', 'border-width': '4px', padding: '10px 25px', width: '100%', align: 'center' },
  'mj-spacer': { height: '20px' },
  'mj-social': {
    align: 'center',
    'border-radius': '3px',
    'icon-size': '20px',
    mode: 'horizontal',
    padding: '10px 25px',
  },
  'mj-social-element': { 'border-radius': '3px', padding: '4px' },
  'mj-navbar': { align: 'center' },
  'mj-navbar-link': {
    color: '#000000',
    'font-family': 'Ubuntu, Helvetica, Arial, sans-serif',
    'font-size': '13px',
    'font-weight': 'normal',
    'line-height': '22px',
    padding: '15px 10px',
    'text-transform': 'uppercase',
  },
  'mj-hero': { 'background-color': '#ffffff', padding: '0px' },
};
