import { useEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Search } from 'lucide-react';
import { useT } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { tokenOf } from './catalog.js';

/**
 * List of variables with a search field — shared by the toolbar menu and the
 * buttons next to the subject and preview text fields.
 *
 * Keyboard: type to filter, ↑/↓ to move, Enter to insert. A search with no
 * result offers to create the variable under that name.
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

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return variables
      .filter((v) => (filter ? filter(v) : true))
      .filter(
        (v) =>
          !q ||
          t(v.label).toLowerCase().includes(q) ||
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
    <div className="mb:flex mb:max-h-[min(440px,70vh)] mb:flex-col" data-testid="variable-picker">
      <div className="mb:relative mb:border-b mb:border-border mb:p-2">
        <Search className="mb:pointer-events-none mb:absolute mb:top-1/2 mb:left-4 mb:size-3.5 mb:-translate-y-1/2 mb:text-foreground-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('Search variables…')}
          aria-label={t('Search variables…')}
          className="mb:h-8 mb:w-full mb:rounded-md mb:bg-surface-75 mb:pr-2 mb:pl-7 mb:text-[13px] mb:text-foreground mb:outline-none mb:placeholder:text-foreground-muted mb:focus-visible:ring-2 mb:focus-visible:ring-ring/40"
        />
      </div>
      <div ref={listRef} role="listbox" aria-label={t('Variables')} className="mb:min-h-0 mb:flex-1 mb:overflow-y-auto mb:p-1">
        {ordered.length === 0 && (
          <div className="mb:px-2 mb:py-3 mb:text-center mb:text-[12px] mb:text-foreground-muted">
            <p>{t('No variable found.')}</p>
            {onCreate && query.trim() && (
              <button
                type="button"
                onClick={() => onCreate(query.trim())}
                className="mb:mt-2 mb:inline-flex mb:items-center mb:gap-1 mb:rounded-md mb:px-2 mb:py-1 mb:text-[12px] mb:font-medium mb:text-primary mb:hover:bg-accent"
              >
                <Plus className="mb:size-3.5" />
                {t('Create “{name}”', { name: query.trim() })}
              </button>
            )}
          </div>
        )}
        {groups.map((group) => (
          <div key={group} role="group" aria-label={t(group)}>
            <p className="mb:px-2 mb:pt-2 mb:pb-1 mb:text-[11px] mb:text-foreground-muted">{t(group)}</p>
            {ordered
              .filter((v) => v.group === group)
              .map((variable) => {
                const index = ordered.indexOf(variable);
                return (
                  <div
                    key={variable.key}
                    data-active={index === active}
                    className={cn(
                      'mb:group/var mb:flex mb:items-center mb:gap-1 mb:rounded-md',
                      index === active ? 'mb:bg-accent mb:text-accent-foreground' : 'mb:hover:bg-accent/60'
                    )}
                    onMouseEnter={() => setActive(index)}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      data-variable={variable.key}
                      onClick={() => onPick(variable)}
                      className="mb:flex mb:min-w-0 mb:flex-1 mb:items-center mb:gap-2 mb:px-2 mb:py-1.5 mb:text-left mb:text-[13px]"
                      title={variable.description || undefined}
                    >
                      <span className="mb:min-w-0 mb:flex-1 mb:truncate">{variable.custom ? variable.label : t(variable.label)}</span>
                      <code className="mb:shrink-0 mb:font-mono mb:text-[10.5px] mb:text-foreground-muted">{tokenOf(variable)}</code>
                    </button>
                    {onEdit && variable.custom && (
                      <button
                        type="button"
                        aria-label={t('Edit “{name}”', { name: variable.label })}
                        title={t('Edit')}
                        onClick={() => onEdit(variable)}
                        className="mb:mr-1 mb:flex mb:size-6 mb:shrink-0 mb:items-center mb:justify-center mb:rounded-md mb:text-foreground-muted mb:opacity-0 mb:group-hover/var:opacity-100 mb:hover:bg-background mb:hover:text-foreground mb:focus-visible:opacity-100"
                      >
                        <Pencil className="mb:size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {onCreate && (
        <div className="mb:border-t mb:border-border mb:p-1">
          <button
            type="button"
            onClick={() => onCreate(query.trim())}
            className="mb:flex mb:w-full mb:items-center mb:gap-2 mb:rounded-md mb:px-2 mb:py-1.5 mb:text-left mb:text-[13px] mb:font-medium mb:text-primary mb:hover:bg-accent"
          >
            <Plus className="mb:size-4" />
            {t('New variable')}
          </button>
        </div>
      )}
    </div>
  );
}
