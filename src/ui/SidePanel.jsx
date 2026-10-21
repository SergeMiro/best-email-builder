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
 * The widths are wishes: the canvas keeps `CANVAS_MIN`, the panels give way
 * down to their `min` when the builder is narrower than all of them.
 */

export const SIDE_PANELS = {
  // Three blocks in a row.
  blocks: { width: 328, min: 200, max: 480 },
  properties: { width: 416, min: 296, max: 640 },
};

/** Width of a folded panel. */
export const RAIL_WIDTH = 40;

/** Room the canvas keeps beside the panels: the email (600 px) and its margins. */
export const CANVAS_MIN = { wide: 640, medium: 480 };

const STORAGE_KEY = 'best-email-builder:side-panels';
/** Centred on the border between the panel and the canvas. */
const EDGE = { left: 'eb:right-0 eb:translate-x-1/2', right: 'eb:left-0 eb:-translate-x-1/2' };
const KEY_STEP = 16;

/** @typedef {{width: number, collapsed: boolean}} PanelState */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
      if (Number.isFinite(entry.width)) panels[name].width = clamp(entry.width, min, max);
      panels[name].collapsed = entry.collapsed === true;
    }
  } catch {
    // No storage (private mode, server): the defaults.
  }
  return panels;
}

export function useSidePanels() {
  const [panels, setPanels] = useState(initialPanels);
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(panels));
    } catch {
      // Not remembered, still applied.
    }
  }, [panels]);
  /** @type {(name: keyof typeof SIDE_PANELS, patch: Partial<PanelState>) => void} */
  const update = useCallback((name, patch) => setPanels((current) => ({ ...current, [name]: { ...current[name], ...patch } })), []);
  return { panels, update };
}

/** The grid track of a panel. @param {PanelState} state @param {keyof typeof SIDE_PANELS} name */
export function panelTrack(state, name) {
  return state.collapsed ? `${RAIL_WIDTH}px` : `minmax(${SIDE_PANELS[name].min}px, ${state.width}px)`;
}

/**
 * @param {{
 *   name: keyof typeof SIDE_PANELS,
 *   side: 'left'|'right',
 *   state: PanelState,
 *   onChange: (patch: Partial<PanelState>) => void,
 *   room: () => number,
 *   labels: {resize: string, hide: string, show: string},
 *   children: any,
 * }} props
 *   `room()`: the widest the panel can be right now, the canvas keeping its
 *   minimum.
 */
export function SidePanel({ name, side, state, onChange, room, labels, children }) {
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  const drag = useRef(/** @type {{x: number, width: number, max: number}|null} */ (null));
  const [dragging, setDragging] = useState(false);
  const { min, max } = SIDE_PANELS[name];
  // Dragging towards the canvas widens the panel.
  const sign = side === 'left' ? 1 : -1;
  const widest = () => clamp(room(), min, max);
  const rendered = () => Math.round(ref.current?.getBoundingClientRect().width || state.width);

  if (state.collapsed) {
    return (
      <div
        className={cn('eb:relative eb:min-h-0 eb:border-border eb:bg-background', side === 'left' ? 'eb:border-r' : 'eb:border-l')}
        data-panel={name}
        data-collapsed="true"
      >
        <EdgeToggle side={side} collapsed label={labels.show} onClick={() => onChange({ collapsed: false })} />
      </div>
    );
  }

  return (
    <div ref={ref} className="eb:relative eb:flex eb:min-h-0 eb:min-w-0 eb:flex-col eb:*:min-h-0 eb:*:flex-1" data-panel={name} data-collapsed="false">
      {children}
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
      <EdgeToggle side={side} collapsed={false} label={labels.hide} onClick={() => onChange({ collapsed: true })} />
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
