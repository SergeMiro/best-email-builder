'use client';

import { useEffect, useState } from 'react';

/**
 * Layout of the builder from the width of ITS OWN box, not of the window: the
 * builder is embedded in host pages (a side panel, a modal, a phone), and its
 * room is what counts.
 *
 *   wide    ≥ 1180 px  blocks, canvas and properties side by side;
 *   medium  ≥ 760 px   blocks beside the canvas, properties in a drawer;
 *   narrow  < 760 px   the canvas alone, blocks and properties in drawers.
 *
 * Before the first measure (server rendering, first paint) the layout is
 * `wide`, the desktop one.
 */

export const LAYOUT_BREAKPOINTS = { wide: 1180, medium: 760 };

/** @param {number} width @returns {'wide'|'medium'|'narrow'} */
export function layoutFor(width) {
  if (width >= LAYOUT_BREAKPOINTS.wide) return 'wide';
  if (width >= LAYOUT_BREAKPOINTS.medium) return 'medium';
  return 'narrow';
}

/** @param {{current: HTMLElement|null}} ref */
export function useLayoutWidth(ref) {
  const [layout, setLayout] = useState(/** @type {'wide'|'medium'|'narrow'} */ ('wide'));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setLayout(layoutFor(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return layout;
}
