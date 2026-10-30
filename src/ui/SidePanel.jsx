'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './primitives/cn.js';
import { TooltipWrap } from './primitives/misc.jsx';

/**
 * The side panels of the builder: the blocks on the left, the properties on
 * the right (wide layout; the blocks also in the medium one).
 *
 * The border between a panel and the canvas is dragged to resize the panel
 * (or moved with the arrow keys once focused; a double-click puts the default
 * width back). The round button on that border folds the panel to a narrow
 * rail; the same button, on the rail's border, unfolds it. Widths and folds
 * are remembered in this browser, for this viewer only.
 *
 * Folding and unfolding glide, as the canvas does to the mobile view: the
 * grid's columns move for `FOLD_MS`, while the content keeps its width and
 * slides under the panel's border with the canvas, fading out or in. With
 * reduced motion, they happen at once.
 *
 * The widths are wishes: the canvas keeps `CANVAS_MIN`, the panels give way
 * down to their `min` when the builder is narrower than all of them.
 */

export const SIDE_PANELS = {
  // Two blocks in a row: wider, the row takes three.
  blocks: { width: 272, min: 200, max: 480 },
  properties: { width: 416, min: 296, max: 640 },
};

/** Width of a folded panel. */
export const RAIL_WIDTH = 40;

/** How long a panel folds or unfolds: as long as the canvas narrows to the mobile view. */
export const FOLD_MS = 350;

/** Room the canvas keeps beside the panels: the email (600 px) and its margins. */
export const CANVAS_MIN = { wide: 640, medium: 480 };

const STORAGE_KEY = 'best-email-builder:side-panels';
/**
 * The blocks' former default width, saved by every visit until 0.18 whether
 * changed or not: read as no choice, so those viewers get the new default.
 */
const FORMER_BLOCKS_WIDTH = 328;
/** Centred on the border between the panel and the canvas. */
const EDGE = { left: 'eb:right-0 eb:translate-x-1/2', right: 'eb:left-0 eb:-translate-x-1/2' };
const KEY_STEP = 16;

/** @typedef {{width: number, collapsed: boolean}} PanelState */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** @returns {Record<keyof typeof SIDE_PANELS, PanelState>} */
function initialPanels() {
  const panels = {
    blocks: { width: SIDE_PANELS.blocks.width, collapsed: false },
    properties: { width: SIDE_PANELS.properties.width, collapsed: false },
  };
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) || 'null');
    for (const name of /** @type {(keyof typeof SIDE_PANELS)[]} */ (Object.keys(panels))) {
      const entry = saved?.[name];
      if (!entry) continue;
      const { min, max } = SIDE_PANELS[name];
      if (Number.isFinite(entry.width) && !(name === 'blocks' && entry.width === FORMER_BLOCKS_WIDTH)) panels[name].width = clamp(entry.width, min, max);
      panels[name].collapsed = entry.collapsed === true;
    }
  } catch {
    // No storage (private mode, server): the defaults.
  }
  return panels;
}

/**
 * The panels' widths and folds, and `moving`: the panels folding or unfolding
 * right now, for `FOLD_MS`.
 */
export function useSidePanels() {
  const [panels, setPanels] = useState(initialPanels);
  const [moving, setMoving] = useState(/** @type {Partial<Record<keyof typeof SIDE_PANELS, true>>} */ ({}));
  const timers = useRef(/** @type {Partial<Record<keyof typeof SIDE_PANELS, ReturnType<typeof setTimeout>>>} */ ({}));
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch {
      // Not remembered, still applied.
    }
  }, [panels]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);
  /** @type {(name: keyof typeof SIDE_PANELS, patch: Partial<PanelState>) => void} */
  const update = useCallback((name, patch) => {
    if (patch.collapsed !== undefined && !reducedMotion()) {
      clearTimeout(timers.current[name]);
      setMoving((current) => ({ ...current, [name]: true }));
      // A few frames after the columns stop, so the content does not reflow before.
      timers.current[name] = setTimeout(() => setMoving(({ [name]: _done, ...others }) => others), FOLD_MS + 50);
    }
    setPanels((current) => ({ ...current, [name]: { ...current[name], ...patch } }));
  }, []);
  return { panels, update, moving };
}

/**
 * The grid track of a panel. A rail is a `minmax` too, so the browser can
 * glide from one to the other.
 * @param {PanelState} state @param {keyof typeof SIDE_PANELS} name
 */
export function panelTrack(state, name) {
  return state.collapsed ? `minmax(${RAIL_WIDTH}px, ${RAIL_WIDTH}px)` : `minmax(${SIDE_PANELS[name].min}px, ${state.width}px)`;
}

/** On the builder's grid while a panel folds or unfolds. */
export const FOLD_TRANSITION = 'eb:transition-[grid-template-columns] eb:duration-[350ms] eb:ease-in-out';

/**
 * @param {{
 *   name: keyof typeof SIDE_PANELS,
 *   side: 'left'|'right',
 *   state: PanelState,
 *   moving?: boolean,
 *   onChange: (patch: Partial<PanelState>) => void,
 *   room: () => number,
 *   labels: {resize: string, hide: string, show: string},
 *   children: any,
 * }} props
 *   `moving`: folding or unfolding (see `useSidePanels`). `room()`: the
 *   widest the panel can be right now, the canvas keeping its minimum.
 */
export function SidePanel({ name, side, state, moving = false, onChange, room, labels, children }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const drag = useRef(/** @type {{x: number, width: number, max: number}|null} */ (null));
  const [dragging, setDragging] = useState(false);
  // The content's width while the panel moves: the panel's, folded or about to be.
  const [glide, setGlide] = useState(0);
  const { min, max } = SIDE_PANELS[name];
  // Dragging towards the canvas widens the panel.
  const sign = side === 'left' ? 1 : -1;
  const widest = () => clamp(room(), min, max);
  const rendered = () => Math.round(ref.current?.getBoundingClientRect().width || state.width);
  const open = !state.collapsed;
  const toggle = () => {
    const panel = ref.current;
    const border = panel ? panel.offsetWidth - panel.clientWidth : 0;
    setGlide(open ? panel?.clientWidth || 0 : Math.min(state.width, widest()) - border);
    onChange({ collapsed: open });
  };

  return (
    <div
      ref={ref}
      className={cn('eb:relative eb:min-h-0 eb:min-w-0 eb:border-border eb:bg-background', side === 'left' ? 'eb:border-r' : 'eb:border-l')}
      data-panel={name}
      data-collapsed={open ? 'false' : 'true'}
    >
      {(open || moving) && (
        // Held on the border with the canvas, the content slides out at the far edge.
        <div className={cn('eb:absolute eb:inset-0 eb:flex eb:overflow-hidden', side === 'left' && 'eb:justify-end')}>
          <div
            className={cn(
              'eb:flex eb:min-h-0 eb:min-w-0 eb:flex-1 eb:flex-col eb:transition-opacity eb:duration-[350ms] eb:ease-in-out eb:*:min-h-0 eb:*:flex-1',
              moving && 'eb:pointer-events-none eb:starting:opacity-0',
              !open && 'eb:opacity-0'
            )}
            style={moving && glide > 0 ? { flex: `0 0 ${glide}px` } : undefined}
          >
            {children}
          </div>
        </div>
      )}
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={labels.resize}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={state.width}
          tabIndex={0}
          data-dragging={dragging ? 'true' : undefined}
          className={cn('eb:group eb:absolute eb:inset-y-0 eb:z-20 eb:w-2 eb:cursor-col-resize eb:touch-none eb:outline-none', EDGE[side])}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, width: rendered(), max: widest() };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start) return;
            onChange({ width: clamp(Math.round(start.width + sign * (event.clientX - start.x)), min, start.max) });
          }}
          onPointerUp={() => {
            drag.current = null;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragging(false);
          }}
          onDoubleClick={() => onChange({ width: SIDE_PANELS[name].width })}
          onKeyDown={(event) => {
            const step = event.key === 'ArrowRight' ? KEY_STEP : event.key === 'ArrowLeft' ? -KEY_STEP : 0;
            if (!step) return;
            event.preventDefault();
            onChange({ width: clamp(rendered() + sign * step, min, widest()) });
          }}
        >
          <span
            className={cn(
              'eb:absolute eb:inset-y-0 eb:left-1/2 eb:w-0.5 eb:-translate-x-1/2 eb:bg-primary eb:opacity-0 eb:transition-opacity',
              'eb:group-hover:opacity-100 eb:group-focus-visible:opacity-100 eb:group-data-[dragging=true]:opacity-100'
            )}
            aria-hidden="true"
          />
        </div>
      )}
      <EdgeToggle side={side} collapsed={!open} label={open ? labels.hide : labels.show} onClick={toggle} />
    </div>
  );
}

/**
 * The round button on a panel's border, the same folded or not: its arrow
 * points the way the panel goes.
 * @param {{side: 'left'|'right', collapsed: boolean, label: string, onClick: () => void}} props
 */
function EdgeToggle({ side, collapsed, label, onClick }) {
  const Arrow = (side === 'left') === collapsed ? ChevronRight : ChevronLeft;
  return (
    <TooltipWrap label={label} side={side === 'left' ? 'right' : 'left'}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={!collapsed}
        onClick={onClick}
        className={cn(
          'eb:absolute eb:top-1/2 eb:z-30 eb:flex eb:size-5.5 eb:-translate-y-1/2 eb:cursor-pointer eb:items-center eb:justify-center eb:rounded-full eb:border eb:border-border eb:bg-background eb:text-foreground-lighter eb:shadow-xs eb:transition-colors eb:outline-none',
          'eb:hover:border-primary/50 eb:hover:text-foreground eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50',
          EDGE[side]
        )}
      >
        <Arrow className="eb:size-3.5" aria-hidden="true" />
      </button>
    </TooltipWrap>
  );
}
