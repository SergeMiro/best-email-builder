import { useEffect } from 'react';
import { cn } from './cn.js';

/** ⌘ on Apple keyboards, Ctrl elsewhere. */
const apple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

/** What a search field announces to assistive technologies. */
export const SEARCH_KEYS = 'Control+K Meta+K';

/**
 * Ctrl+K (⌘K) puts the cursor in this search field, its words selected, for
 * as long as the field is on screen — the library's search, the one of the
 * variables next to the subject.
 * @param {{current: HTMLInputElement|null}} inputRef
 */
export function useSearchShortcut(inputRef) {
  useEffect(() => {
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      const input = inputRef.current;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return;
      if (!input?.isConnected || input.disabled) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputRef]);
}

/** The key hint at the end of a search field: Ctrl K (⌘K), or `children` instead. */
export function SearchKeyHint({ className, children = null }) {
  return (
    <kbd
      className={cn(
        'eb:pointer-events-none eb:inline-flex eb:h-5 eb:items-center eb:rounded eb:border eb:border-border eb:bg-surface-100 eb:px-1.5 eb:font-mono eb:text-[10px] eb:text-foreground-muted',
        className
      )}
      aria-hidden="true"
      data-testid="eb-search-keys"
    >
      {children ?? (apple() ? '⌘K' : 'Ctrl K')}
    </kbd>
  );
}
