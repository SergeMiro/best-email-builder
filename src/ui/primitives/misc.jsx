import { Separator as SeparatorPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from './cn.js';

export function Separator({ className, orientation = 'horizontal', decorative = true, ...props }) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'mb:shrink-0 mb:bg-border mb:data-[orientation=horizontal]:h-px mb:data-[orientation=horizontal]:w-full mb:data-[orientation=vertical]:h-full mb:data-[orientation=vertical]:w-px',
        className
      )}
      {...props}
    />
  );
}

export function Skeleton({ className, as: Comp = 'div', ...props }) {
  return <Comp data-slot="skeleton" className={cn('mb:animate-pulse mb:rounded-lg2 mb:bg-accent', className)} {...props} />;
}

/** Small uppercase heading of a panel section. */
export function SectionLabel({ className, ...props }) {
  return (
    <span
      data-slot="section-label"
      className={cn('mb:font-mono mb:text-[10px] mb:uppercase mb:tracking-[0.14em] mb:text-foreground-muted', className)}
      {...props}
    />
  );
}

/** One line of text, cut with an ellipsis when it overflows (full text on hover). */
export function TruncatedText({ children, className, as: Comp = 'span', ...props }) {
  return (
    <Comp
      className={cn('mb:block mb:truncate', className)}
      title={typeof children === 'string' ? children : undefined}
      {...props}
    >
      {children}
    </Comp>
  );
}

/* ── Tabs ─────────────────────────────────────────────────────────────── */

export function Tabs({ className, ...props }) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('mb:flex mb:flex-col mb:gap-2', className)} {...props} />;
}

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'mb:inline-flex mb:h-8 mb:w-fit mb:items-center mb:justify-center mb:rounded-lg2 mb:bg-muted mb:p-[3px] mb:text-muted-foreground',
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
        "mb:inline-flex mb:h-[calc(100%-1px)] mb:flex-1 mb:items-center mb:justify-center mb:gap-1.5 mb:rounded-lg2 mb:border mb:border-transparent mb:px-2 mb:py-1 mb:text-[13px] mb:font-medium mb:whitespace-nowrap mb:text-foreground/60 mb:transition-all mb:hover:text-foreground mb:focus-visible:border-ring mb:focus-visible:ring-[3px] mb:focus-visible:ring-ring/50 mb:focus-visible:outline-1 mb:disabled:pointer-events-none mb:disabled:opacity-50 mb:data-[state=active]:bg-background mb:data-[state=active]:text-foreground mb:data-[state=active]:shadow-sm mb:[&_svg]:pointer-events-none mb:[&_svg]:shrink-0 mb:[&_svg:not([class*='size-'])]:size-4",
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
          'mb-scope mb:z-50 mb:w-fit mb:origin-(--radix-tooltip-content-transform-origin) mb:animate-in mb:rounded-lg2 mb:border mb:border-border mb:bg-popover mb:px-3 mb:py-1.5 mb:text-xs mb:text-balance mb:text-popover-foreground mb:shadow-md mb:fade-in-0 mb:zoom-in-95 mb:data-[state=closed]:animate-out mb:data-[state=closed]:fade-out-0 mb:data-[state=closed]:zoom-out-95',
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
      <TooltipContent side={side} className="mb:px-2 mb:py-1 mb:text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
