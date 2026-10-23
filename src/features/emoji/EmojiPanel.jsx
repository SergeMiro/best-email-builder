import { useEffect, useMemo, useRef, useState } from 'react';
import { Apple, Car, Clock, Flag, Hand, Heart, Lightbulb, Loader2, PawPrint, Search, Smile, Trophy } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { Input } from '../../ui/primitives/fields.jsx';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { EMOJI_GROUPS, loadEmojis, nameOf, searchEmojis } from './emojis.js';

/**
 * EMOJIS — the panel beside the canvas that inserts them.
 *
 * Every emoji, by group, named in the interface's language; the search finds
 * them by name or keyword ("coeur", "heart"). Under the pointer, an emoji is
 * typed into the selected text or button, as it will look, and wiped out
 * when the pointer leaves; a click inserts it for good: at the caret of the
 * text being edited, otherwise at the end of the selected text or button.
 * The last ones used come first the next time the panel opens, remembered
 * in the browser.
 */

const RECENT_KEY = 'best-email-builder:recent-emojis';
const RECENT_MAX = 24;

const GROUP_ICONS = {
  recent: Clock,
  smileys: Smile,
  people: Hand,
  nature: PawPrint,
  food: Apple,
  travel: Car,
  activities: Trophy,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

/** The color fonts first: no black-and-white glyph where a color one exists. */
const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'Segoe UI Symbol', sans-serif";

function readRecent() {
  try {
    const list = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((item) => typeof item === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function rememberRecent(list) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private browsing: nothing to remember */
  }
}

/** Keep only nearby rows mounted. Empty rows keep the scroll position and group links stable. */
function EmojiGrid({ entries, scrollRef, ready }) {
  const ref = useRef(null);
  const [columns, setColumns] = useState(6);
  const [cell, setCell] = useState(32);
  const [visible, setVisible] = useState(new Set());
  const chunkSize = columns * 6;
  const chunks = useMemo(() => Array.from({ length: Math.ceil(entries.length / chunkSize) }, (_, i) =>
    entries.slice(i * chunkSize, (i + 1) * chunkSize)), [entries, chunkSize]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      if (!width) return;
      const count = Math.max(1, Math.floor(width / 32));
      setColumns(count);
      setCell(width / count);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((changes) => {
      setVisible((previous) => {
        const next = new Set(previous);
        for (const entry of changes) {
          const index = Number(entry.target.getAttribute('data-emoji-chunk'));
          if (entry.isIntersecting) next.add(index);
          else if (!entry.target.contains(document.activeElement)) next.delete(index);
        }
        return next;
      });
    }, { root: scrollRef.current, rootMargin: '192px 0px' });
    for (const chunk of ref.current.children) observer.observe(chunk);
    return () => observer.disconnect();
  }, [chunks, scrollRef]);

  return (
    <div ref={ref} style={{ fontFamily: EMOJI_FONT }}>
      {chunks.map((chunk, index) => (
        <div key={index} data-emoji-chunk={index}
          style={{ height: Math.ceil(chunk.length / columns) * cell, display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {visible.has(index) && chunk.map(([emoji, search]) => {
            const name = search ? nameOf([emoji, search]) : emoji;
            return (
              <button key={emoji} type="button" disabled={!ready} data-emoji={emoji} title={name} aria-label={name}
                className="eb:grid eb:aspect-square eb:place-items-center eb:rounded-md eb:text-[20px] eb:leading-none eb:outline-none eb:transition-colors eb:hover:bg-surface-200 eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:opacity-50">
                {emoji}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function EmojiPanel({ context }) {
  const { editor, ready } = context;
  const { t, locale, notify } = useUi();
  const [groups, setGroups] = useState(/** @type {import('./emojis.js').EmojiGroup[]|null} */ (null));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  // Shown as they were when the panel opened: a click does not move the grid
  // under the pointer. Kept at once for the next time.
  const [recent] = useState(readRecent);
  const kept = useRef(recent);
  const [active, setActive] = useState('');
  const scrollRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const hovered = useRef('');

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadEmojis(locale).then(
      (loaded) => live && setGroups(loaded),
      () => live && setFailed(true)
    );
    return () => {
      live = false;
    };
  }, [locale, attempt]);

  // Leaving the panel: no emoji stays typed in the email.
  useEffect(() => () => editor.clearPreview(), [editor]);

  const names = useMemo(() => new Map((groups || []).flatMap((group) => group.emojis)), [groups]);
  const results = useMemo(() => (groups && query.trim() ? searchEmojis(groups, query) : null), [groups, query]);
  const sections = useMemo(() => {
    if (!groups) return [];
    const shown = recent.filter((emoji) => names.has(emoji));
    const own = shown.length ? [{ id: 'recent', emojis: shown.map((emoji) => [emoji, names.get(emoji) || '']) }] : [];
    return [...own, ...groups];
  }, [groups, recent, names]);

  const labelOf = (id) => (id === 'recent' ? t('Recently used') : t(EMOJI_GROUPS[id] || id));

  const insert = (emoji) => {
    if (!editor.insertText(emoji)) {
      notify('info', t('Select a text or a button first.'));
      return;
    }
    // Still under the pointer: not typed again as a preview.
    hovered.current = emoji;
    kept.current = [emoji, ...kept.current.filter((item) => item !== emoji)].slice(0, RECENT_MAX);
    rememberRecent(kept.current);
  };

  /** The emoji under the pointer or the focus, from the grid's events (one listener for ~1,900 buttons). */
  const emojiOf = (event) => /** @type {HTMLElement} */ (event.target).closest?.('[data-emoji]')?.getAttribute('data-emoji') || '';
  const preview = (event) => {
    const emoji = emojiOf(event);
    if (!emoji || emoji === hovered.current) return;
    hovered.current = emoji;
    editor.previewText(emoji);
  };
  const unpreview = () => {
    hovered.current = '';
    editor.clearPreview();
  };

  const goTo = (id) => {
    const container = scrollRef.current;
    const section = container?.querySelector(`[data-group="${id}"]`);
    if (!container || !(section instanceof HTMLElement)) return;
    setQuery('');
    container.scrollTo({ top: section.offsetTop, behavior: 'smooth' });
  };

  /** The group at the top of the list, lit in the row of groups. */
  const trackGroup = () => {
    if (hovered.current) unpreview();
    const container = scrollRef.current;
    if (!container || results) return;
    let current = '';
    for (const section of container.querySelectorAll('[data-group]')) {
      if (/** @type {HTMLElement} */ (section).offsetTop <= container.scrollTop + 8) current = section.getAttribute('data-group') || '';
    }
    setActive(current);
  };

  const grid = (entries) => <EmojiGrid entries={entries} scrollRef={scrollRef} ready={ready} />;

  return (
    // No mousedown outside the search: the text being edited keeps its caret.
    <div
      className="eb:flex eb:h-full eb:min-h-0 eb:flex-col"
      data-testid="eb-emoji-panel"
      onMouseDown={(event) => event.target instanceof HTMLInputElement || event.preventDefault()}
    >
      <div className="eb:space-y-2 eb:px-3 eb:pb-2">
        <p className="eb:text-[11px] eb:leading-snug eb:text-foreground-muted">{t('Point at one to see it in the text, click to insert it.')}</p>
        <div className="eb:relative">
          <Search className="eb:pointer-events-none eb:absolute eb:left-2.5 eb:top-1/2 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" aria-hidden="true" />
          <Input
            type="search"
            dense
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !query) return;
              event.stopPropagation();
              setQuery('');
            }}
            placeholder={t('Search emojis')}
            aria-label={t('Search emojis')}
            className="eb:pl-8"
          />
        </div>
        <div className="eb:flex eb:items-center eb:justify-between" role="group" aria-label={t('Emoji groups')}>
          {sections.map(({ id }) => {
            const Icon = GROUP_ICONS[id] || Smile;
            return (
              <TooltipWrap key={id} label={labelOf(id)} delayDuration={100} hoverable={false}>
                <button
                  type="button"
                  aria-label={labelOf(id)}
                  aria-current={!results && active === id ? 'true' : undefined}
                  onClick={() => goTo(id)}
                  className={cn(
                    'eb:grid eb:size-6 eb:place-items-center eb:rounded-md eb:text-foreground-muted eb:outline-none eb:transition-colors eb:hover:bg-surface-200 eb:hover:text-foreground eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50',
                    !results && active === id && 'eb:bg-primary/10 eb:text-primary'
                  )}
                >
                  <Icon className="eb:size-3.5" aria-hidden="true" />
                </button>
              </TooltipWrap>
            );
          })}
        </div>
      </div>
      <div
        ref={scrollRef}
        className="eb:relative eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:px-2 eb:pb-3"
        onScroll={trackGroup}
        onMouseOver={preview}
        onMouseLeave={unpreview}
        onFocus={preview}
        onBlur={unpreview}
        onClick={(event) => {
          const emoji = emojiOf(event);
          if (emoji) insert(emoji);
        }}
      >
        {!groups && !failed && (
          <p className="eb:flex eb:items-center eb:justify-center eb:gap-2 eb:py-8 eb:text-[12px] eb:text-foreground-muted" role="status">
            <Loader2 className="eb:size-3.5 eb:animate-spin" aria-hidden="true" />
            {t('Loading the emojis…')}
          </p>
        )}
        {failed && (
          <p className="eb:px-1 eb:py-6 eb:text-center eb:text-[12px] eb:text-foreground-muted" role="alert">
            {t('The emojis could not be loaded.')}{' '}
            <button type="button" className="eb:text-primary eb:underline-offset-4 eb:hover:underline" onClick={() => setAttempt((n) => n + 1)}>
              {t('Retry')}
            </button>
          </p>
        )}
        {results &&
          (results.length ? (
            <section aria-label={t('Search results')}>{grid(results)}</section>
          ) : (
            <p className="eb:px-1 eb:py-6 eb:text-center eb:text-[12px] eb:text-foreground-muted">{t('No emoji found.')}</p>
          ))}
        {!results &&
          sections.map((section) => (
            <section key={section.id} data-group={section.id} aria-label={labelOf(section.id)}>
              <h4 className="eb:sticky eb:top-0 eb:z-10 eb:bg-background eb:px-1 eb:pt-2 eb:pb-1 eb:text-[11px] eb:font-medium eb:text-foreground-muted">
                {labelOf(section.id)}
              </h4>
              {grid(section.emojis)}
            </section>
          ))}
      </div>
    </div>
  );
}
