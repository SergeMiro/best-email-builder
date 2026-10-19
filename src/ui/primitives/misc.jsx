import { Separator as SeparatorPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from './cn.js';

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'eb:shrink-0 eb:bg-border eb:data-[orientation=horizontal]:h-px eb:data-[orientation=horizontal]:w-full eb:data-[orientation=vertical]:h-full eb:data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, as: Comp = 'div', ...props }) {
  return <Comp data-slot="skeleton" className={cn('eb:animate-pulse eb:rounded-lg2 eb:bg-accent', className)} {...props} />;
}

/**
 * A filter that is on or off (`aria-pressed`): the tags under a search. A
 * row of them starts with *All*, pressed while no other one is.
 */
export function FilterChip({ pressed, className, ...props }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        'eb:inline-flex eb:h-7 eb:shrink-0 eb:cursor-pointer eb:items-center eb:gap-1.5 eb:rounded-full eb:border eb:px-3 eb:text-[12px] eb:font-medium eb:whitespace-nowrap eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
        pressed
          ? 'eb:border-primary eb:bg-primary eb:text-primary-foreground eb:hover:bg-primary/90'
          : 'eb:border-border eb:bg-background eb:text-foreground eb:hover:border-primary/50 eb:hover:bg-primary/5',
        className
      )}
      {...props}
    />
  );
}

/** Small uppercase heading of a panel section. */
export function SectionLabel({ className, ...props }) {
  return (
    <span
      data-slot="section-label"
      className={cn('eb:font-mono eb:text-[10px] eb:uppercase eb:tracking-[0.14em] eb:text-foreground-muted', className)}
      {...props}
    />
  );
}

/** One line of text, cut with an ellipsis when it overflows (full text on hover). */
export function TruncatedText({ children, className, as: Comp = 'span', ...props }) {
  return (
    <Comp
      className={cn('eb:block eb:truncate', className)}
      title={typeof children === 'string' ? children : undefined}
      {...props}
    >
      {children}
    </Comp>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

export function Tabs({ className, ...props }) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('eb:flex eb:flex-col eb:gap-2', className)} {...props} />;
}

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'eb:inline-flex eb:h-8 eb:w-fit eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-muted eb:p-[3px] eb:text-muted-foreground',
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "eb:inline-flex eb:h-[calc(100%-1px)] eb:flex-1 eb:items-center eb:justify-center eb:gap-1.5 eb:rounded-lg2 eb:border eb:border-transparent eb:px-2 eb:py-1 eb:text-[13px] eb:font-medium eb:whitespace-nowrap eb:text-foreground/60 eb:transition-all eb:hover:text-foreground eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:focus-visible:outline-1 eb:disabled:pointer-events-none eb:disabled:opacity-50 eb:data-[state=active]:bg-background eb:data-[state=active]:text-foreground eb:data-[state=active]:shadow-sm eb:[&_svg]:pointer-events-none eb:[&_svg]:shrink-0 eb:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

/* ── Tooltip ──────────────────────────────────────────────────────────── */

export function TooltipProvider({ delayDuration = 0, ...props }) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props) {
  return <TooltipPrimitive.Root {...props} />;
}

export function TooltipTrigger(props) {
  return <TooltipPrimitive.Trigger {...props} />;
}

export function TooltipContent({ className, sideOffset = 4, children, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'eb-scope eb:z-50 eb:w-fit eb:origin-(--radix-tooltip-content-transform-origin) eb:animate-in eb:rounded-lg2 eb:border eb:border-border eb:bg-popover eb:px-3 eb:py-1.5 eb:text-xs eb:text-balance eb:text-popover-foreground eb:shadow-md eb:fade-in-0 eb:zoom-in-95 eb:data-[state=closed]:animate-out eb:data-[state=closed]:fade-out-0 eb:data-[state=closed]:zoom-out-95',
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Wraps a control with a tooltip; without a label, renders the control alone. */
export function TooltipWrap({ label, side = 'top', children, asChild = true, delayDuration }) {
  if (!label) return children;
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
      <TooltipContent side={side} className="eb:px-2 eb:py-1 eb:text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
