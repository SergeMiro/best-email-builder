import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { cn } from './cn.js';

export const buttonVariants = cva(
  "mb:inline-flex mb:shrink-0 mb:items-center mb:justify-center mb:gap-2 mb:whitespace-nowrap mb:rounded-lg2 mb:text-sm mb:font-medium mb:transition-all mb:outline-none mb:disabled:pointer-events-none mb:disabled:opacity-50 mb:focus-visible:border-ring mb:focus-visible:ring-[3px] mb:focus-visible:ring-ring/50 mb:aria-invalid:border-destructive mb:aria-invalid:ring-destructive/20 mb:[&_svg]:pointer-events-none mb:[&_svg]:shrink-0 mb:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'mb:bg-primary mb:text-primary-foreground mb:hover:bg-primary/90',
        destructive: 'mb:bg-destructive mb:text-white mb:hover:bg-destructive/90 mb:focus-visible:ring-destructive/20',
        outline: 'mb:border mb:border-border mb:bg-background mb:text-foreground mb:shadow-xs mb:hover:bg-accent mb:hover:text-accent-foreground',
        secondary: 'mb:bg-secondary mb:text-secondary-foreground mb:hover:bg-secondary/80',
        ghost: 'mb:text-foreground mb:hover:bg-accent mb:hover:text-accent-foreground',
        link: 'mb:text-primary mb:underline-offset-4 mb:hover:underline',
      },
      size: {
        default: 'mb:h-8 mb:gap-1.5 mb:px-3 mb:text-[13px] mb:has-[>svg]:px-2.5',
        xs: "mb:h-6 mb:gap-1 mb:px-2 mb:text-xs mb:has-[>svg]:px-1.5 mb:[&_svg:not([class*='size-'])]:size-3",
        'sm-compact': "mb:h-7 mb:gap-1.5 mb:px-3 mb:text-xs mb:has-[>svg]:px-2.5 mb:[&_svg:not([class*='size-'])]:size-3",
        sm: 'mb:h-8 mb:gap-1.5 mb:px-3 mb:text-[13px] mb:has-[>svg]:px-2.5',
        lg: 'mb:h-10 mb:px-6 mb:has-[>svg]:px-4',
        icon: 'mb:size-8',
        'icon-xs': "mb:size-6 mb:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm-compact': "mb:size-7 mb:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'mb:size-8',
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
