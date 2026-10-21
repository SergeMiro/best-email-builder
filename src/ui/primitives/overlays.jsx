import {
  AlertDialog as AlertDialogPrimitive,
  Dialog as DialogPrimitive,
  DropdownMenu as DropdownMenuPrimitive,
  Popover as PopoverPrimitive,
  Select as SelectPrimitive,
} from 'radix-ui';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { useT } from '../context.jsx';
import { cn } from './cn.js';
import { DENSE_FIELD } from './fields.jsx';

/*
 * Overlays render in a portal, outside the builder's root element: each one
 * carries the `eb-scope` class so the package's base styles reach it.
 */

const FADE_ZOOM =
  'eb:data-[state=open]:animate-in eb:data-[state=open]:fade-in-0 eb:data-[state=open]:zoom-in-95 eb:data-[state=closed]:animate-out eb:data-[state=closed]:fade-out-0 eb:data-[state=closed]:zoom-out-95';

/* ── Dialog ───────────────────────────────────────────────────────────── */

export function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogContent({ className, children, showCloseButton = true, ...props }) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="eb-scope eb:fixed eb:inset-0 eb:z-50 eb:bg-black/50 eb:data-[state=open]:animate-in eb:data-[state=open]:fade-in-0 eb:data-[state=closed]:animate-out eb:data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'eb-scope eb:fixed eb:top-[50%] eb:left-[50%] eb:z-50 eb:grid eb:w-full eb:max-w-[calc(100%-2rem)] eb:translate-x-[-50%] eb:translate-y-[-50%] eb:gap-4 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:p-6 eb:text-foreground eb:shadow-lg eb:duration-200 eb:outline-none eb:sm:max-w-lg',
          FADE_ZOOM,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="eb:absolute eb:top-4 eb:right-4 eb:rounded-xs eb:opacity-70 eb:transition-opacity eb:hover:opacity-100 eb:focus:ring-2 eb:focus:ring-ring eb:focus:ring-offset-2 eb:focus:outline-hidden eb:disabled:pointer-events-none eb:[&_svg]:pointer-events-none eb:[&_svg]:shrink-0 eb:[&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="eb:sr-only">{t('Close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn('eb:flex eb:flex-col eb:gap-2 eb:text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('eb:flex eb:flex-col-reverse eb:gap-2 eb:sm:flex-row eb:sm:justify-end', className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('eb:text-lg eb:leading-none eb:font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('eb:text-sm eb:text-muted-foreground', className)} {...props} />;
}

/* ── Alert dialog (confirmations) ─────────────────────────────────────── */

export function AlertDialog(props) {
  return <AlertDialogPrimitive.Root {...props} />;
}

export function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="eb-scope eb:fixed eb:inset-0 eb:z-50 eb:bg-black/50 eb:data-[state=open]:animate-in eb:data-[state=open]:fade-in-0 eb:data-[state=closed]:animate-out eb:data-[state=closed]:fade-out-0" />
      <AlertDialogPrimitive.Content
        className={cn(
          'eb-scope eb:fixed eb:top-[50%] eb:left-[50%] eb:z-50 eb:grid eb:w-full eb:max-w-[calc(100%-2rem)] eb:translate-x-[-50%] eb:translate-y-[-50%] eb:gap-4 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:p-6 eb:text-foreground eb:shadow-lg eb:duration-200 eb:sm:max-w-lg',
          FADE_ZOOM,
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export const AlertDialogTitle = ({ className, ...props }) => (
  <AlertDialogPrimitive.Title className={cn('eb:text-lg eb:font-semibold', className)} {...props} />
);
export const AlertDialogDescription = ({ className, ...props }) => (
  <AlertDialogPrimitive.Description className={cn('eb:text-sm eb:text-muted-foreground', className)} {...props} />
);
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

/* ── Popover ──────────────────────────────────────────────────────────── */

export function Popover(props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({ className, align = 'center', sideOffset = 4, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'eb-scope eb:z-50 eb:w-72 eb:origin-(--radix-popover-content-transform-origin) eb:rounded-lg2 eb:border eb:border-border eb:bg-popover eb:p-4 eb:text-popover-foreground eb:shadow-md eb:outline-hidden',
          FADE_ZOOM,
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ── Dropdown menu ────────────────────────────────────────────────────── */

export function DropdownMenu(props) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

export function DropdownMenuTrigger(props) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

export function DropdownMenuContent({ className, sideOffset = 4, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'eb-scope eb:z-50 eb:max-h-(--radix-dropdown-menu-content-available-height) eb:min-w-[8rem] eb:origin-(--radix-dropdown-menu-content-transform-origin) eb:overflow-x-hidden eb:overflow-y-auto eb:rounded-lg2 eb:border eb:border-border eb:bg-popover eb:p-1 eb:text-popover-foreground eb:shadow-md',
          FADE_ZOOM,
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuGroup(props) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "eb:relative eb:flex eb:cursor-default eb:items-center eb:gap-2 eb:rounded-sm eb:px-2 eb:py-1.5 eb:text-[13px] eb:outline-hidden eb:select-none eb:focus:bg-accent eb:focus:text-accent-foreground eb:data-[disabled]:pointer-events-none eb:data-[disabled]:opacity-50 eb:[&_svg]:pointer-events-none eb:[&_svg]:shrink-0 eb:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }) {
  return <DropdownMenuPrimitive.Label className={cn('eb:px-2 eb:py-1.5 eb:text-[13px] eb:font-medium', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <DropdownMenuPrimitive.Separator className={cn('eb:-mx-1 eb:my-1 eb:h-px eb:bg-border', className)} {...props} />;
}

/* ── Select ───────────────────────────────────────────────────────────── */

export function Select(props) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

export function SelectValue(props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/** `dense`: see `DENSE_FIELD`. */
export function SelectTrigger({ className, children, dense = false, ...props }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "eb:flex eb:h-8 eb:w-full eb:items-center eb:justify-between eb:gap-2 eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:px-3 eb:py-1 eb:text-[13px] eb:whitespace-nowrap eb:text-foreground eb:shadow-xs eb:transition-[color,box-shadow] eb:outline-none eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:disabled:cursor-not-allowed eb:disabled:opacity-50 eb:data-[placeholder]:text-foreground-muted eb:*:data-[slot=select-value]:line-clamp-1 eb:*:data-[slot=select-value]:flex eb:*:data-[slot=select-value]:items-center eb:*:data-[slot=select-value]:gap-2 eb:[&_svg]:pointer-events-none eb:[&_svg]:shrink-0 eb:[&_svg:not([class*='size-'])]:size-4",
        dense && DENSE_FIELD,
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="eb:size-4 eb:opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        className={cn(
          'eb-scope eb:relative eb:z-50 eb:max-h-(--radix-select-content-available-height) eb:min-w-[8rem] eb:origin-(--radix-select-content-transform-origin) eb:overflow-x-hidden eb:overflow-y-auto eb:rounded-lg2 eb:border eb:border-border eb:bg-popover eb:text-popover-foreground eb:shadow-md',
          FADE_ZOOM,
          position === 'popper' && 'eb:data-[side=bottom]:translate-y-1 eb:data-[side=top]:-translate-y-1',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            'eb:p-1',
            position === 'popper' &&
              'eb:h-[var(--radix-select-trigger-height)] eb:w-full eb:min-w-[var(--radix-select-trigger-width)] eb:scroll-my-1'
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'eb:relative eb:flex eb:w-full eb:cursor-default eb:items-center eb:gap-2 eb:rounded-sm eb:py-1.5 eb:pr-8 eb:pl-2 eb:text-[13px] eb:outline-hidden eb:select-none eb:focus:bg-accent eb:focus:text-accent-foreground eb:data-[disabled]:pointer-events-none eb:data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="eb:absolute eb:right-2 eb:flex eb:size-3.5 eb:items-center eb:justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="eb:size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
