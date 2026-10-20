// @ts-check
/**
 * Styles of the canvas's own layer, inside the frame: selection and hover
 * boxes, labels, toolbars, the drop line, placeholders, the caret of a text
 * being previewed. Never in the email.
 */

import { FRAME_SCROLLBAR_CSS } from '../../core/scrollbars.js';

const PRIMARY = '#5b4ff0';

export const CANVAS_CSS = `
html, body { min-height: 100%; }
body { margin: 0; }
.eb-node { cursor: default; }
.eb-node a { cursor: pointer; }
[contenteditable="true"] { outline: none; cursor: text; caret-color: ${PRIMARY}; }
td.eb-placeholder { outline: 1.5px dashed #c3cad6; outline-offset: -8px; }
.eb-preview-text[data-typing]::after { content: ''; display: inline-block; width: 1.5px; height: 1em; margin-left: 1px;
  vertical-align: -0.12em; background: currentColor; animation: eb-preview-caret 0.7s steps(1) infinite; }
@keyframes eb-preview-caret { 50% { opacity: 0; } }
.eb-placeholder { user-select: none; }

#eb-ui { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;
  font: 500 11px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
#eb-ui * { box-sizing: border-box; }
#eb-ui [hidden] { display: none !important; }
.eb-ui-box { position: absolute; pointer-events: none; }
.eb-ui-hover { box-shadow: inset 0 0 0 1px rgba(91, 79, 240, 0.55); }
.eb-ui-select { box-shadow: inset 0 0 0 2px ${PRIMARY}; }
.eb-ui-chip { position: absolute; pointer-events: none; white-space: nowrap; color: #fff; background: ${PRIMARY};
  padding: 4px 7px; border-radius: 5px; font-weight: 600; letter-spacing: 0.01em; }
.eb-ui-hover-chip { background: rgba(91, 79, 240, 0.85); }
.eb-ui-tools { position: absolute; display: flex; gap: 1px; padding: 2px; border-radius: 6px; background: ${PRIMARY};
  box-shadow: 0 4px 12px -4px rgba(40, 30, 120, 0.5); pointer-events: auto; }
.eb-ui-tools button { all: unset; box-sizing: border-box; width: 26px; height: 24px; display: grid; place-items: center;
  color: #fff; border-radius: 4px; cursor: pointer; }
.eb-ui-tools button:hover, .eb-ui-tools button:focus-visible { background: rgba(255, 255, 255, 0.2); }
.eb-ui-tools button[data-action="move"] { cursor: grab; touch-action: none; }
.eb-ui-tools button.eb-ui-parent { width: auto; gap: 4px; padding: 0 7px 0 5px; display: inline-flex; align-items: center;
  font-weight: 600; white-space: nowrap; }
.eb-ui-tools button.eb-ui-parent + button { margin-left: 2px; box-shadow: -1px 0 0 rgba(255, 255, 255, 0.25); }
.eb-ui-drop { position: absolute; height: 4px; margin-top: -2px; border-radius: 2px; background: ${PRIMARY};
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85); pointer-events: none; }
.eb-ui-drop::before, .eb-ui-drop::after { content: ''; position: absolute; top: -3px; width: 10px; height: 10px;
  border-radius: 50%; background: ${PRIMARY}; box-shadow: 0 0 0 2px #fff; }
.eb-ui-drop::before { left: -5px; }
.eb-ui-drop::after { right: -5px; }
.eb-ui-text { position: absolute; display: flex; align-items: center; gap: 1px; padding: 3px; border-radius: 8px;
  background: #fff; border: 1px solid #dfe3ea; box-shadow: 0 8px 22px -10px rgba(16, 24, 40, 0.35); pointer-events: auto; }
.eb-ui-text button { all: unset; box-sizing: border-box; width: 28px; height: 26px; display: grid; place-items: center;
  color: #2b3038; border-radius: 5px; cursor: pointer; }
.eb-ui-text button:hover, .eb-ui-text button:focus-visible { background: #eef0f6; }
.eb-ui-text button[aria-pressed="true"] { background: #e8e6fd; color: ${PRIMARY}; }
.eb-ui-text .eb-ui-sep { width: 1px; height: 18px; margin: 0 3px; background: #e3e6ec; }
.eb-ui-text input { all: unset; box-sizing: border-box; width: 220px; height: 26px; padding: 0 8px; border-radius: 5px;
  border: 1px solid #dfe3ea; font: 400 12px/1 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #2b3038; }
.eb-ui-text input:focus { border-color: ${PRIMARY}; }
${FRAME_SCROLLBAR_CSS}
`;

/** The drag label, in the host page (outside the frame): inline styles only. */
export const GHOST_STYLE = [
  'position:fixed',
  'z-index:2147483646',
  'pointer-events:none',
  'padding:6px 10px',
  'border-radius:7px',
  `background:${PRIMARY}`,
  'color:#fff',
  "font:600 12px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif",
  'box-shadow:0 8px 20px -8px rgba(40,30,120,.6)',
  'white-space:nowrap',
  'transform:translate(12px,12px)',
].join(';');
