import { forwardRef } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from './cn.js';

// forwardRef: React 18 does not pass `ref` as a prop.
export const Input = forwardRef(function Input({ className, type, ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'mb:h-8 mb:w-full mb:min-w-0 mb:rounded-lg2 mb:border mb:border-border-strong mb:bg-surface-75 mb:px-3 mb:py-1 mb:text-[13px] mb:text-foreground mb:shadow-xs mb:transition-[color,box-shadow] mb:outline-none mb:placeholder:text-foreground-muted mb:selection:bg-primary mb:selection:text-primary-foreground mb:disabled:pointer-events-none mb:disabled:cursor-not-allowed mb:disabled:opacity-50',
        'mb:focus-visible:border-ring mb:focus-visible:ring-[3px] mb:focus-visible:ring-ring/50',
        'mb:aria-invalid:border-destructive mb:aria-invalid:ring-destructive/20',
        className
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        'mb:flex mb:field-sizing-content mb:min-h-16 mb:w-full mb:rounded-lg2 mb:border mb:border-border-strong mb:bg-surface-75 mb:px-3 mb:py-2 mb:text-[13px] mb:text-foreground mb:shadow-xs mb:transition-[color,box-shadow] mb:outline-none mb:placeholder:text-foreground-muted mb:focus-visible:border-ring mb:focus-visible:ring-[3px] mb:focus-visible:ring-ring/50 mb:aria-invalid:border-destructive mb:aria-invalid:ring-destructive/20 mb:disabled:cursor-not-allowed mb:disabled:opacity-50',
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
        'mb:flex mb:items-center mb:gap-2 mb:text-[13px] mb:leading-none mb:font-medium mb:text-foreground mb:select-none mb:peer-disabled:cursor-not-allowed mb:peer-disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
