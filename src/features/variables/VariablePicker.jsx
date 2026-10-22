import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { useT } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { SEARCH_KEYS, SearchKeyHint, useSearchShortcut } from '../../ui/primitives/searchShortcut.jsx';
import { labelOf, tokenOf } from './catalog.js';

/**
 * List of variables with a search field — opened by the buttons next to the
 * subject and preview text fields.
 *
 * Keyboard: type to filter, ↑/↓ to move, Enter to insert, Ctrl+K (⌘K) back
 * to the search. A search with no result offers to create the variable under
 * that name.
 *
 * @param {{
 *   variables: import('./catalog.js').EmailVariable[],
 *   onPick: (variable: import('./catalog.js').EmailVariable) => void,
 *   onCreate?: ((label: string) => void) | null,
 *   onEdit?: ((variable: import('./catalog.js').EmailVariable) => void) | null,
 *   filter?: (variable: import('./catalog.js').EmailVariable) => boolean,
 * }} props
 */
export default function VariablePicker({ variables, onPick, onCreate = null, onEdit = null, filter }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const searchRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  useSearchShortcut(searchRef);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variables
      .filter((v) => (filter ? filter(v) : true))
      .filter(
        (v) =>
          !q ||
          labelOf(v, t).toLowerCase().includes(q) ||
          v.key.toLowerCase().includes(q) ||
          t(v.group).toLowerCase().includes(q)
      );
  }, [variables, query, filter, t]);
  const groups = useMemo(() => [...new Set(matches.map((v) => v.group))], [matches]);
  // Display order (grouped) = keyboard order.
  const ordered = useMemo(() => groups.flatMap((g) => matches.filter((v) => v.group === g)), [groups, matches]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, ordered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (ordered[active]) onPick(ordered[active]);
      else if (onCreate && query.trim()) onCreate(query.trim());
    }
  };

  return (
    <div className="eb:flex eb:max-h-[min(440px,70vh)] eb:flex-col" data-testid="variable-picker">
      <div className="eb:relative eb:border-b eb:border-border eb:p-2">
        <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-4 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" />
        <input
          ref={searchRef}
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Search variables…')}
          aria-label={t('Search variables…')}
          aria-keyshortcuts={SEARCH_KEYS}
          className="eb:h-8 eb:w-full eb:rounded-md eb:bg-surface-75 eb:pr-14 eb:pl-7 eb:text-[13px] eb:text-foreground eb:outline-none eb:placeholder:text-foreground-muted eb:focus-visible:ring-2 eb:focus-visible:ring-ring/40"
        />
        <SearchKeyHint className="eb:absolute eb:top-1/2 eb:right-4 eb:-translate-y-1/2" />
      </div>
      <div ref={listRef} role="listbox" aria-label={t('Variables')} className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:p-1">
        {ordered.length === 0 && (
          <div className="eb:px-2 eb:py-3 eb:text-center eb:text-[12px] eb:text-foreground-muted">
            <p>{t('No variable found.')}</p>
            {onCreate && query.trim() && (
              <button
                type="button"
                onClick={() => onCreate(query.trim())}
                className="eb:mt-2 eb:inline-flex eb:items-center eb:gap-1 eb:rounded-md eb:px-2 eb:py-1 eb:text-[12px] eb:font-medium eb:text-primary eb:hover:bg-accent"
              >
                <Plus className="eb:size-3.5" />
                {t('Create “{name}”', { name: query.trim() })}
              </button>
            )}
          </div>
        )}
        {groups.map((group) => (
          <div key={group} role="group" aria-label={t(group)}>
            <p className="eb:px-2 eb:pt-2 eb:pb-1 eb:text-[11px] eb:text-foreground-muted">{t(group)}</p>
            {ordered
              .filter((v) => v.group === group)
              .map((variable) => {
                const index = ordered.indexOf(variable);
                return (
                  <div
                    key={variable.key}
                    data-active={index === active}
                    className={cn(
                      'eb:group/var eb:flex eb:items-center eb:gap-1 eb:rounded-md',
                      index === active ? 'eb:bg-accent eb:text-accent-foreground' : 'eb:hover:bg-accent/60'
                    )}
                    onMouseEnter={() => setActive(index)}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-variable={variable.key}
                      onClick={() => onPick(variable)}
                      className="eb:flex eb:min-w-0 eb:flex-1 eb:items-center eb:gap-2 eb:px-2 eb:py-1.5 eb:text-left eb:text-[13px]"
                      title={variable.description || undefined}
                    >
                      <span className="eb:min-w-0 eb:flex-1 eb:truncate">{labelOf(variable, t)}</span>
                      <code className="eb:shrink-0 eb:font-mono eb:text-[10.5px] eb:text-foreground-muted">{tokenOf(variable)}</code>
                    </button>
                    {onEdit && (
                      <button
                        type="button"
                        aria-label={t('Edit “{name}”', { name: labelOf(variable, t) })}
                        title={t('Edit')}
                        onClick={() => onEdit(variable)}
                        className="eb:mr-1 eb:flex eb:size-6 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-md eb:text-foreground-muted eb:opacity-0 eb:group-hover/var:opacity-100 eb:hover:bg-background eb:hover:text-foreground eb:focus-visible:opacity-100"
                      >
                        <Pencil className="eb:size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {onCreate && (
        <div className="eb:border-t eb:border-border eb:p-1">
          <button
            type="button"
            onClick={() => onCreate(query.trim())}
            className="eb:flex eb:w-full eb:items-center eb:gap-2 eb:rounded-md eb:px-2 eb:py-1.5 eb:text-left eb:text-[13px] eb:font-medium eb:text-primary eb:hover:bg-accent"
          >
            <Plus className="eb:size-4" />
            {t('New variable')}
          </button>
        </div>
      )}
    </div>
  );
}
