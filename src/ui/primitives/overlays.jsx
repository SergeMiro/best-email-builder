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

/*
 * Overlays render in a portal, outside the builder's root element: each one
 * carries the `mb-scope` class so the package's base styles reach it.
 */

const FADE_ZOOM =
  'mb:data-[state=open]:animate-in mb:data-[state=open]:fade-in-0 mb:data-[state=open]:zoom-in-95 mb:data-[state=closed]:animate-out mb:data-[state=closed]:fade-out-0 mb:data-[state=closed]:zoom-out-95';

/* ── Dialog ───────────────────────────────────────────────────────────── */

export function Dialog(props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogContent({ className, children, showCloseButton = true, ...props }) {
  const t = useT();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="mb-scope mb:fixed mb:inset-0 mb:z-50 mb:bg-black/50 mb:data-[state=open]:animate-in mb:data-[state=open]:fade-in-0 mb:data-[state=closed]:animate-out mb:data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'mb-scope mb:fixed mb:top-[50%] mb:left-[50%] mb:z-50 mb:grid mb:w-full mb:max-w-[calc(100%-2rem)] mb:translate-x-[-50%] mb:translate-y-[-50%] mb:gap-4 mb:rounded-lg2 mb:border mb:border-border mb:bg-background mb:p-6 mb:text-foreground mb:shadow-lg mb:duration-200 mb:outline-none mb:sm:max-w-lg',
          FADE_ZOOM,
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="mb:absolute mb:top-4 mb:right-4 mb:rounded-xs mb:opacity-70 mb:transition-opacity mb:hover:opacity-100 mb:focus:ring-2 mb:focus:ring-ring mb:focus:ring-offset-2 mb:focus:outline-hidden mb:disabled:pointer-events-none mb:[&_svg]:pointer-events-none mb:[&_svg]:shrink-0 mb:[&_svg:not([class*='size-'])]:size-4">
            <XIcon />
            <span className="mb:sr-only">{t('Close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }) {
  return <div className={cn('mb:flex mb:flex-col mb:gap-2 mb:text-left', className)} {...props} />;
}

export function DialogFooter({ className, ...props }) {
  return <div className={cn('mb:flex mb:flex-col-reverse mb:gap-2 mb:sm:flex-row mb:sm:justify-end', className)} {...props} />;
}

export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('mb:text-lg mb:leading-none mb:font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('mb:text-sm mb:text-muted-foreground', className)} {...props} />;
}

/* ── Alert dialog (confirmations) ─────────────────────────────────────── */

export function AlertDialog(props) {
  return <AlertDialogPrimitive.Root {...props} />;
}

export function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="mb-scope mb:fixed mb:inset-0 mb:z-50 mb:bg-black/50 mb:data-[state=open]:animate-in mb:data-[state=open]:fade-in-0 mb:data-[state=closed]:animate-out mb:data-[state=closed]:fade-out-0" />
      <AlertDialogPrimitive.Content
        className={cn(
          'mb-scope mb:fixed mb:top-[50%] mb:left-[50%] mb:z-50 mb:grid mb:w-full mb:max-w-[calc(100%-2rem)] mb:translate-x-[-50%] mb:translate-y-[-50%] mb:gap-4 mb:rounded-lg2 mb:border mb:border-border mb:bg-background mb:p-6 mb:text-foreground mb:shadow-lg mb:duration-200 mb:sm:max-w-lg',
          FADE_ZOOM,
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export const AlertDialogTitle = ({ className, ...props }) => (
  <AlertDialogPrimitive.Title className={cn('mb:text-lg mb:font-semibold', className)} {...props} />
);
export const AlertDialogDescription = ({ className, ...props }) => (
  <AlertDialogPrimitive.Description className={cn('mb:text-sm mb:text-muted-foreground', className)} {...props} />
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
          'mb-scope mb:z-50 mb:w-72 mb:origin-(--radix-popover-content-transform-origin) mb:rounded-lg2 mb:border mb:border-border mb:bg-popover mb:p-4 mb:text-popover-foreground mb:shadow-md mb:outline-hidden',
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
          'mb-scope mb:z-50 mb:max-h-(--radix-dropdown-menu-content-available-height) mb:min-w-[8rem] mb:origin-(--radix-dropdown-menu-content-transform-origin) mb:overflow-x-hidden mb:overflow-y-auto mb:rounded-lg2 mb:border mb:border-border mb:bg-popover mb:p-1 mb:text-popover-foreground mb:shadow-md',
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
        "mb:relative mb:flex mb:cursor-default mb:items-center mb:gap-2 mb:rounded-sm mb:px-2 mb:py-1.5 mb:text-[13px] mb:outline-hidden mb:select-none mb:focus:bg-accent mb:focus:text-accent-foreground mb:data-[disabled]:pointer-events-none mb:data-[disabled]:opacity-50 mb:[&_svg]:pointer-events-none mb:[&_svg]:shrink-0 mb:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }) {
  return <DropdownMenuPrimitive.Label className={cn('mb:px-2 mb:py-1.5 mb:text-[13px] mb:font-medium', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }) {
  return <DropdownMenuPrimitive.Separator className={cn('mb:-mx-1 mb:my-1 mb:h-px mb:bg-border', className)} {...props} />;
}

/* ── Select ───────────────────────────────────────────────────────────── */

export function Select(props) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

export function SelectValue(props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "mb:flex mb:h-8 mb:w-full mb:items-center mb:justify-between mb:gap-2 mb:rounded-lg2 mb:border mb:border-border-strong mb:bg-surface-75 mb:px-3 mb:py-1 mb:text-[13px] mb:whitespace-nowrap mb:text-foreground mb:shadow-xs mb:transition-[color,box-shadow] mb:outline-none mb:focus-visible:border-ring mb:focus-visible:ring-[3px] mb:focus-visible:ring-ring/50 mb:disabled:cursor-not-allowed mb:disabled:opacity-50 mb:data-[placeholder]:text-foreground-muted mb:*:data-[slot=select-value]:line-clamp-1 mb:*:data-[slot=select-value]:flex mb:*:data-[slot=select-value]:items-center mb:*:data-[slot=select-value]:gap-2 mb:[&_svg]:pointer-events-none mb:[&_svg]:shrink-0 mb:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="mb:size-4 mb:opacity-50" />
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
          'mb-scope mb:relative mb:z-50 mb:max-h-(--radix-select-content-available-height) mb:min-w-[8rem] mb:origin-(--radix-select-content-transform-origin) mb:overflow-x-hidden mb:overflow-y-auto mb:rounded-lg2 mb:border mb:border-border mb:bg-popover mb:text-popover-foreground mb:shadow-md',
          FADE_ZOOM,
          position === 'popper' && 'mb:data-[side=bottom]:translate-y-1 mb:data-[side=top]:-translate-y-1',
          className
        )}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            'mb:p-1',
            position === 'popper' &&
              'mb:h-[var(--radix-select-trigger-height)] mb:w-full mb:min-w-[var(--radix-select-trigger-width)] mb:scroll-my-1'
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
        'mb:relative mb:flex mb:w-full mb:cursor-default mb:items-center mb:gap-2 mb:rounded-sm mb:py-1.5 mb:pr-8 mb:pl-2 mb:text-[13px] mb:outline-hidden mb:select-none mb:focus:bg-accent mb:focus:text-accent-foreground mb:data-[disabled]:pointer-events-none mb:data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      <span className="mb:absolute mb:right-2 mb:flex mb:size-3.5 mb:items-center mb:justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="mb:size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}
