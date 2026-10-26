import { cn } from '../ui/primitives/cn.js';

/**
 * A rounded badge button: the rewrite actions.
 * @param {boolean} [selected]
 */
export const chipClassName = (selected = false) =>
  cn(
    'eb:inline-flex eb:h-[22px] eb:items-center eb:gap-1 eb:rounded-md eb:border eb:px-2.5 eb:text-[12px] eb:font-medium eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:disabled:opacity-50',
    selected
      ? 'eb:border-primary eb:bg-primary eb:text-primary-foreground'
      : 'eb:border-border eb:bg-background eb:text-foreground eb:hover:border-primary/50 eb:hover:bg-primary/5'
  );
