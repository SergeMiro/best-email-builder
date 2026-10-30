import { forwardRef } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from './cn.js';

/**
 * Every input and select of the builder: the height, border, background and
 * text of the toolbar's buttons (28 px), so that none stands out. `dense` (the
 * properties panel's) only makes a textarea and a colour swatch smaller.
 */
export const FIELD = 'eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:px-2.5 eb:text-[12px] eb:text-foreground eb:shadow-xs';

/** A number field without the browser's up/down arrows: the arrow keys still step it. */
export const NO_SPINNER =
  'eb:[appearance:textfield] eb:[&::-webkit-inner-spin-button]:appearance-none eb:[&::-webkit-outer-spin-button]:appearance-none';

// forwardRef: React 18 does not pass `ref` as a prop.
export const Input = forwardRef(function Input({ className, type, dense: _dense, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        FIELD,
        'eb:h-7 eb:w-full eb:min-w-0 eb:py-1 eb:transition-[color,box-shadow] eb:outline-none eb:placeholder:text-foreground-muted eb:selection:bg-primary eb:selection:text-primary-foreground eb:disabled:pointer-events-none eb:disabled:cursor-not-allowed eb:disabled:opacity-50',
        'eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
        'eb:aria-invalid:border-destructive eb:aria-invalid:ring-destructive/20',
        type === 'number' && NO_SPINNER,
        className
      )}
      {...props}
    />
  );
});

// Resized in height only: its width is the panel's, like the other fields.
export const Textarea = forwardRef(function Textarea({ className, dense = false, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        FIELD,
        'eb:flex eb:field-sizing-content eb:min-h-16 eb:w-full eb:resize-y eb:py-1.5 eb:transition-[color,box-shadow] eb:outline-none eb:placeholder:text-foreground-muted eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:aria-invalid:border-destructive eb:aria-invalid:ring-destructive/20 eb:disabled:cursor-not-allowed eb:disabled:opacity-50',
        dense && 'eb:min-h-12 eb:py-1 eb:leading-[18px]',
        className
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'eb:flex eb:items-center eb:gap-2 eb:text-[13px] eb:leading-none eb:font-medium eb:text-foreground eb:select-none eb:peer-disabled:cursor-not-allowed eb:peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
