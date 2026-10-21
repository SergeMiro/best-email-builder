import { forwardRef } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from './cn.js';

/**
 * `dense`: the height of the properties panel's fields (26 px, not 32), the
 * same for an input, a select and a colour, so that more fits in the panel.
 */
export const DENSE_FIELD = 'eb:h-6.5 eb:px-2.5 eb:text-[12.5px]';

// forwardRef: React 18 does not pass `ref` as a prop.
export const Input = forwardRef(function Input({ className, type, dense = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'eb:h-8 eb:w-full eb:min-w-0 eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:px-3 eb:py-1 eb:text-[13px] eb:text-foreground eb:shadow-xs eb:transition-[color,box-shadow] eb:outline-none eb:placeholder:text-foreground-muted eb:selection:bg-primary eb:selection:text-primary-foreground eb:disabled:pointer-events-none eb:disabled:cursor-not-allowed eb:disabled:opacity-50',
        'eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
        'eb:aria-invalid:border-destructive eb:aria-invalid:ring-destructive/20',
        dense && DENSE_FIELD,
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
        'eb:flex eb:field-sizing-content eb:min-h-16 eb:w-full eb:resize-y eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:px-3 eb:py-2 eb:text-[13px] eb:text-foreground eb:shadow-xs eb:transition-[color,box-shadow] eb:outline-none eb:placeholder:text-foreground-muted eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:aria-invalid:border-destructive eb:aria-invalid:ring-destructive/20 eb:disabled:cursor-not-allowed eb:disabled:opacity-50',
        dense && 'eb:min-h-12 eb:px-2.5 eb:py-1 eb:text-[12.5px] eb:leading-[18px]',
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
