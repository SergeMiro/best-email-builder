import { cn } from '../primitives/cn.js';

/**
 * A tag as the library shows it. One class list per color of `TAG_COLORS`
 * (features/tags/tags.js), written out so the stylesheet has them all, and
 * readable in the light and the dark theme.
 */
const TAG_STYLES = {
  gray: 'eb:border-gray-500/30 eb:bg-gray-500/10 eb:text-gray-700 eb:dark:text-gray-300',
  red: 'eb:border-red-500/30 eb:bg-red-500/10 eb:text-red-700 eb:dark:text-red-300',
  orange: 'eb:border-orange-500/30 eb:bg-orange-500/10 eb:text-orange-700 eb:dark:text-orange-300',
  amber: 'eb:border-amber-500/40 eb:bg-amber-500/15 eb:text-amber-800 eb:dark:text-amber-300',
  lime: 'eb:border-lime-600/40 eb:bg-lime-500/15 eb:text-lime-800 eb:dark:text-lime-300',
  green: 'eb:border-green-600/30 eb:bg-green-500/10 eb:text-green-700 eb:dark:text-green-300',
  teal: 'eb:border-teal-600/30 eb:bg-teal-500/10 eb:text-teal-700 eb:dark:text-teal-300',
  cyan: 'eb:border-cyan-600/30 eb:bg-cyan-500/10 eb:text-cyan-700 eb:dark:text-cyan-300',
  blue: 'eb:border-blue-500/30 eb:bg-blue-500/10 eb:text-blue-700 eb:dark:text-blue-300',
  violet: 'eb:border-violet-500/30 eb:bg-violet-500/10 eb:text-violet-700 eb:dark:text-violet-300',
  fuchsia: 'eb:border-fuchsia-500/30 eb:bg-fuchsia-500/10 eb:text-fuchsia-700 eb:dark:text-fuchsia-300',
  pink: 'eb:border-pink-500/30 eb:bg-pink-500/10 eb:text-pink-700 eb:dark:text-pink-300',
};

/** The color's swatch in the tags dialog. */
export const TAG_SWATCHES = {
  gray: 'eb:bg-gray-500',
  red: 'eb:bg-red-500',
  orange: 'eb:bg-orange-500',
  amber: 'eb:bg-amber-500',
  lime: 'eb:bg-lime-500',
  green: 'eb:bg-green-600',
  teal: 'eb:bg-teal-600',
  cyan: 'eb:bg-cyan-500',
  blue: 'eb:bg-blue-500',
  violet: 'eb:bg-violet-500',
  fuchsia: 'eb:bg-fuchsia-500',
  pink: 'eb:bg-pink-500',
};

/** @param {{tag: import('../../features/tags/tags.js').TemplateTag, className?: string}} props */
export function TagBadge({ tag, className }) {
  return (
    <span
      data-testid="eb-tag"
      data-color={tag.color}
      className={cn(
        'eb:inline-block eb:max-w-full eb:shrink-0 eb:truncate eb:rounded-md eb:border eb:px-1.5 eb:py-0 eb:text-[10px]',
        TAG_STYLES[tag.color] || TAG_STYLES.gray,
        className
      )}
    >
      {tag.label}
    </span>
  );
}
