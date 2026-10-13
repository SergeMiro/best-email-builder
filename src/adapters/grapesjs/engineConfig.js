// @ts-check
/**
 * GrapesJS engine configuration — without any of its UI.
 *
 * The builder has ITS OWN React UI: GrapesJS only provides the canvas (the
 * iframe where you click and drag) and its data model. Hence:
 *   - `customUI`, `panels.defaults: []` and `custom` managers: no panel, no
 *     toolbar, no style or layer manager;
 *   - `telemetry: false` and `cssIcons: ''`: no request to a third-party
 *     service (GrapesJS stats, Font Awesome from a CDN);
 *   - `storageManager: false`: saving is ours (`storage/`), never the
 *     engine's `localStorage`;
 *   - an HTML parser that rejects scripts and `on*` attributes: a reloaded
 *     template must not be able to execute anything in the host page.
 */

import { FRAME_SCROLLBAR_CSS } from '../../core/scrollbars.js';

/** Canvas devices: ids = `EmailDevice`. */
export const DEVICES = [
  { id: 'desktop', name: 'desktop', width: '' },
  // `widthMedia`: MJML's mobile rule (480px) applies inside the frame.
  { id: 'mobile', name: 'mobile', width: '375px', widthMedia: '480px' },
];

/** Empty email: just the body, at the standard width. */
export const EMPTY_MJML =
  '<mjml><mj-body background-color="#eceff4" width="600px"></mj-body></mjml>';

/**
 * Image WITHOUT A FILE, as shown in the canvas: a light grey 600 × 220 banner
 * with an icon. Replaces GrapesJS's default `src`, raw SVG markup whose quotes
 * and ";" broke the attribute and the style string the MJML plugin reads back
 * ("illegal transform attribute"). This one is a `data:` URL with NO ";" and
 * no double quote.
 *
 * It never leaves the adapter: `GrapesJsAdapter` turns it into "no image" in
 * the export, the project and the selection.
 */
export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 220'%3E" +
  "%3Crect width='600' height='220' fill='%23f3f5f9'/%3E" +
  "%3Cg transform='translate(276 86)' fill='none' stroke='%238b93a3' stroke-width='2' " +
  "stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='1' y='1' width='46' height='46' rx='5'/%3E" +
  "%3Ccircle cx='17' cy='17' r='5'/%3E%3Cpath d='m47 31-8-8a4 4 0 0 0-6 0L5 47'/%3E%3C/g%3E%3C/svg%3E";

/**
 * Stylesheet injected INTO the canvas iframe: editing cues only, never
 * exported into the email.
 */
const CANVAS_CSS = `
  body { background: #eceff4; }
  [data-gjs-highlightable] { outline-offset: -1px; }
  *::selection { background: rgba(53, 104, 168, .22); }
${FRAME_SCROLLBAR_CSS}
`;

/**
 * @param {{
 *   container: HTMLElement,
 *   mjmlPlugin: any,
 *   locales?: {engine?: any, mjml?: any},
 *   locale?: string,
 * }} options
 */
export function buildEngineConfig({ container, mjmlPlugin, locales = {}, locale = 'en' }) {
  return {
    container,
    height: '100%',
    width: 'auto',
    telemetry: false,
    customUI: true,
    cssIcons: '',
    noticeOnUnload: false,
    storageManager: /** @type {false} */ (false),
    fromElement: false,
    showDevices: false,
    showOffsets: false,
    multipleSelection: false,
    avoidInlineStyle: true,
    log: /** @type {('warning'|'error')[]} */ (['error']),
    canvasCss: CANVAS_CSS,
    i18n: {
      locale,
      localeFallback: locale,
      detectLocale: false,
      messages: locales.engine ? { [locale]: locales.engine } : {},
    },
    panels: { defaults: [] },
    blockManager: { custom: true },
    layerManager: { custom: true },
    traitManager: { custom: true },
    selectorManager: { custom: true, componentFirst: true },
    styleManager: { custom: true },
    assetManager: { custom: true, upload: false },
    deviceManager: { devices: DEVICES, default: 'desktop' },
    undoManager: { trackSelection: false, maximumStackLength: 300 },
    // Canvas shortcuts: the ones users expect (undo, redo — Ctrl+Y included —,
    // copy, paste, delete), without GrapesJS's single-letter navigation
    // ("s", "w", "a", "d") that moved the selection on any keypress outside a
    // field.
    keymaps: {
      defaults: {
        'core:undo': { keys: '⌘+z, ctrl+z', handler: 'core:undo', opts: { prevent: true } },
        'core:redo': { keys: '⌘+shift+z, ctrl+shift+z, ctrl+y', handler: 'core:redo', opts: { prevent: true } },
        'core:copy': { keys: '⌘+c, ctrl+c', handler: 'core:copy' },
        'core:paste': { keys: '⌘+v, ctrl+v', handler: 'core:paste' },
        'core:component-delete': { keys: 'backspace, delete', handler: 'core:component-delete', opts: { prevent: true } },
      },
    },
    parser: {
      optionsHtml: {
        allowScripts: false,
        allowUnsafeAttr: false,
        allowUnsafeAttrValue: false,
      },
    },
    plugins: [
      (/** @type {any} */ editor) =>
        mjmlPlugin(editor, {
          // No blocks, devices or style settings from the plugin: blocks and
          // properties come from `blocks/`.
          blocks: [],
          resetBlocks: true,
          resetDevices: false,
          resetStyleManager: false,
          hideSelector: true,
          useCustomTheme: false,
          overwriteExport: false,
          imagePlaceholderSrc: IMAGE_PLACEHOLDER,
          i18n: locales.mjml ? { [locale]: locales.mjml } : {},
        }),
      // After the plugin: the empty image gets our banner, not the raw SVG.
      (/** @type {any} */ editor) =>
        editor.Components.addType('mj-image', { model: { defaults: { src: IMAGE_PLACEHOLDER } } }),
    ],
  };
}
