import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

export const buttonVariants = cva(
  "eb:inline-flex eb:shrink-0 eb:items-center eb:justify-center eb:gap-2 eb:whitespace-nowrap eb:rounded-lg2 eb:text-sm eb:font-medium eb:transition-all eb:outline-none eb:disabled:pointer-events-none eb:disabled:opacity-50 eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:aria-invalid:border-destructive eb:aria-invalid:ring-destructive/20 eb:[&_svg]:pointer-events-none eb:[&_svg]:shrink-0 eb:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'eb:bg-primary eb:text-primary-foreground eb:hover:bg-primary/90',
        destructive: 'eb:bg-destructive eb:text-white eb:hover:bg-destructive/90 eb:focus-visible:ring-destructive/20',
        outline: 'eb:border eb:border-border eb:bg-background eb:text-foreground eb:shadow-xs eb:hover:bg-accent eb:hover:text-accent-foreground',
        secondary: 'eb:bg-secondary eb:text-secondary-foreground eb:hover:bg-secondary/80',
        ghost: 'eb:text-foreground eb:hover:bg-accent eb:hover:text-accent-foreground',
        link: 'eb:text-primary eb:underline-offset-4 eb:hover:underline',
      },
      size: {
        default: 'eb:h-8 eb:gap-1.5 eb:px-3 eb:text-[13px] eb:has-[>svg]:px-2.5',
        xs: "eb:h-6 eb:gap-1 eb:px-2 eb:text-xs eb:has-[>svg]:px-1.5 eb:[&_svg:not([class*='size-'])]:size-3",
        'sm-compact': "eb:h-7 eb:gap-1.5 eb:px-3 eb:text-xs eb:has-[>svg]:px-2.5 eb:[&_svg:not([class*='size-'])]:size-3",
        sm: 'eb:h-8 eb:gap-1.5 eb:px-3 eb:text-[13px] eb:has-[>svg]:px-2.5',
        lg: 'eb:h-10 eb:px-6 eb:has-[>svg]:px-4',
        icon: 'eb:size-8',
        'icon-xs': "eb:size-6 eb:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm-compact': "eb:size-7 eb:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'eb:size-8',
        // Beside a `dense` field.
        'icon-dense': "eb:size-6.5 eb:rounded-lg2 eb:[&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export function Button({ className, variant = 'default', size = 'default', asChild = false, type, ...props }) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      type={asChild ? type : type || 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
