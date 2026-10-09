import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Every utility class of the package carries the `mb:` prefix (see src/styles.css),
// so class merging has to know about it.
const twMerge = extendTailwindMerge({ prefix: 'mb' });

/** Joins class names and resolves conflicting utilities (the last one wins). */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
