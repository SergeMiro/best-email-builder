// @ts-check
/**
 * Styles of the canvas's own layer, inside the frame: selection and hover
 * boxes, labels, toolbars, the drop line, placeholders, the caret of a text
 * being previewed. Never in the email.
 */

import { FRAME_SCROLLBAR_CSS } from '../../core/scrollbars.js';

const PRIMARY = 'var(--eb-canvas-primary, var(--eb-primary, #5b4ff0))';

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

#eb-ui { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;
  font: 500 11px/1.2 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
#eb-ui * { box-sizing: border-box; }
#eb-ui [hidden] { display: none !important; }
.eb-ui-box { position: absolute; pointer-events: none; }
.eb-ui-hover { box-shadow: inset 0 0 0 1px color-mix(in oklab, ${PRIMARY} 55%, transparent); }
.eb-ui-select { box-shadow: inset 0 0 0 2px ${PRIMARY}; }
.eb-ui-chip { position: absolute; pointer-events: none; white-space: nowrap; color: #fff; background: ${PRIMARY};
  padding: 4px 7px; border-radius: 6px; font-weight: 600; letter-spacing: 0.01em; }
.eb-ui-hover-chip { background: color-mix(in oklab, ${PRIMARY} 85%, transparent); }
.eb-ui-tools { position: absolute; display: flex; gap: 1px; padding: 2px; border-radius: 10px; background: ${PRIMARY};
  box-shadow: 0 4px 12px -4px color-mix(in oklab, ${PRIMARY} 50%, transparent); pointer-events: auto; }
.eb-ui-tools button { all: unset; box-sizing: border-box; width: 26px; height: 24px; display: grid; place-items: center;
  color: #fff; border-radius: 8px; cursor: pointer; }
.eb-ui-tools button:hover, .eb-ui-tools button:focus-visible { background: rgba(255, 255, 255, 0.2); }
.eb-ui-tools button[data-action="move"] { cursor: grab; touch-action: none; }
.eb-ui-tools button:disabled { opacity: 0.4; cursor: default; background: none; }
.eb-ui-tools button.eb-ui-parent { width: auto; gap: 4px; padding: 0 7px 0 5px; display: inline-flex; align-items: center;
  font-weight: 600; white-space: nowrap; }
.eb-ui-tools button.eb-ui-parent + button { margin-left: 2px; box-shadow: -1px 0 0 rgba(255, 255, 255, 0.25); }
.eb-ui-add { all: unset; position: absolute; box-sizing: border-box; width: 22px; height: 22px; display: grid;
  place-items: center; border-radius: 50%; background: ${PRIMARY}; color: #fff; cursor: pointer; pointer-events: auto;
  box-shadow: 0 0 0 2px #fff, 0 3px 10px -3px color-mix(in oklab, ${PRIMARY} 70%, transparent); transition: transform 0.12s ease; }
.eb-ui-add:hover, .eb-ui-add:focus-visible { transform: scale(1.15); }
.eb-ui-add svg { width: 14px; height: 14px; stroke-width: 2.75; }
.eb-ui-drop { position: absolute; height: 4px; margin-top: -2px; border-radius: 2px; background: ${PRIMARY};
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85); pointer-events: none; }
.eb-ui-drop::before, .eb-ui-drop::after { content: ''; position: absolute; top: -3px; width: 10px; height: 10px;
  border-radius: 50%; background: ${PRIMARY}; box-shadow: 0 0 0 2px #fff; }
.eb-ui-drop::before { left: -5px; }
.eb-ui-drop::after { right: -5px; }
.eb-ui-tag { position: absolute; pointer-events: none; padding: 0 2px; border-radius: 3px; white-space: pre; overflow: visible; }
.eb-ui-tag-clear { all: unset; position: absolute; box-sizing: border-box; width: 16px; height: 16px; display: grid;
  place-items: center; border-radius: 50%; background: #1f2433; color: #fff; cursor: pointer; pointer-events: auto;
  box-shadow: 0 0 0 1.5px #fff, 0 2px 6px rgba(16, 24, 40, 0.3); }
.eb-ui-tag-clear:hover, .eb-ui-tag-clear:focus-visible { background: #e5484d; }
.eb-ui-tag-clear svg { width: 10px; height: 10px; stroke-width: 3; }
.eb-ui-working { border-radius: 4px; background: linear-gradient(100deg, transparent 25%, rgba(91, 79, 240, 0.16) 50%,
  transparent 75%) 0 0 / 250% 100%; animation: eb-working 1.4s ease-in-out infinite; }
@keyframes eb-working { from { background-position: 100% 0; } to { background-position: 0 0; } }
.eb-reveal { animation: eb-reveal 0.55s cubic-bezier(0.2, 0.65, 0.3, 1) both; }
@keyframes eb-reveal { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: blur(0); } }
@media (prefers-reduced-motion: reduce) {
  .eb-ui-working { animation: none; background: rgba(91, 79, 240, 0.08); }
}
${FRAME_SCROLLBAR_CSS}
`;

/** The drag label, in the host page (outside the frame): inline styles only. */
export const GHOST_STYLE = [
  'position:fixed',
  'z-index:2147483646',
  'pointer-events:none',
  'padding:6px 10px',
  'border-radius:10px',
  `background:${PRIMARY}`,
  'color:#fff',
  "font:600 12px/1.2 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif",
  'box-shadow:0 8px 20px -8px rgba(40,30,120,.6)',
  'white-space:nowrap',
  'transform:translate(12px,12px)',
].join(';');
