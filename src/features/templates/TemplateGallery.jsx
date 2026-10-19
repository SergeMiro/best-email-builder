import { useEffect, useMemo, useState } from 'react';
import { LayoutTemplate, Search, X } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { Input } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { withThumbnailImages } from './gallery.js';

/**
 * TEMPLATE GALLERY — toolbar button and dialog.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Start from a template                      × │
 *   │ [🔍 Search templates                       ] │
 *   │ (All) (Basics) (Marketing) (News) (Events)   │
 *   │ ┌────────┐ ┌────────┐ ┌────────┐             │
 *   │ │ email  │ │ email  │ │ email  │  ← scrolls  │
 *   │ │ Name   │ │ Name   │ │ Name   │             │
 *   │ │ Descri…│ │ Descri…│ │ Descri…│             │
 *   │ └────────┘ └────────┘ └────────┘             │
 *   └──────────────────────────────────────────────┘
 *
 * Each card shows the template as it renders: its MJML compiled by the canvas
 * compiler (`editor.exportHtml(mjml)`), displayed in an iframe with an EMPTY
 * sandbox and scaled down. Picking one REPLACES the email in the editor —
 * after confirmation when there are unsaved changes — and fills the subject
 * and preview text only when they are empty: what the user typed stays.
 *
 * The search reads names, descriptions and tags. The tags under it are the
 * templates' own (`tags` of each entry): one or more of them show the
 * templates that carry any of them; *All* clears them.
 *
 * Every card has the same height: the name and the description hold on one
 * line and fade out at the card's edge.
 *
 * A saved template that gets a new content counts as modified: it is the
 * next save that keeps it.
 */

const THUMBNAIL_SCALE = 0.38;
const EMAIL_WIDTH = 600;

/** A line too long for the card fades out at its edge. */
const FADE_LINE = 'eb:block eb:overflow-hidden eb:whitespace-nowrap eb:[mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)]';

/** The thumbnail is a picture: the email's own scrollbar has no place in it. */
const NO_SCROLLBAR = '<style>html,body{overflow:hidden!important;scrollbar-width:none!important}</style>';
const withoutScrollbar = (html) =>
  !html ? html : /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${NO_SCROLLBAR}</head>`) : NO_SCROLLBAR + html;

/** Case and accents aside: `Événements` is found by `evenements`. */
const fold = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function Thumbnail({ html, title }) {
  return (
    <div
      className="eb:relative eb:h-[220px] eb:shrink-0 eb:overflow-hidden eb:rounded-md eb:border eb:border-border eb:bg-surface-75"
      aria-hidden="true"
    >
      <iframe
        title={title}
        sandbox=""
        srcDoc={withoutScrollbar(html)}
        tabIndex={-1}
        loading="lazy"
        className="eb:pointer-events-none eb:absolute eb:top-0 eb:left-1/2 eb:origin-top eb:border-0"
        style={{
          width: EMAIL_WIDTH,
          height: 220 / THUMBNAIL_SCALE,
          transform: `translateX(-50%) scale(${THUMBNAIL_SCALE})`,
        }}
      />
    </div>
  );
}

function Chip({ pressed, onClick, children }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'eb:inline-flex eb:h-7 eb:cursor-pointer eb:items-center eb:rounded-full eb:border eb:px-3 eb:text-[12px] eb:font-medium eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
        pressed
          ? 'eb:border-primary eb:bg-primary eb:text-primary-foreground eb:hover:bg-primary/90'
          : 'eb:border-border eb:bg-background eb:text-foreground eb:hover:border-primary/50 eb:hover:bg-primary/5'
      )}
    >
      {children}
    </button>
  );
}

export default function TemplateGalleryButton({ context }) {
  const { editor, ready, templates, isDirty, markDirty, template, setMeta } = context;
  const { t, confirm, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** The tags picked; none is *All*. */
  const [chosen, setChosen] = useState(() => new Set());

  // Thumbnails compiled when the dialog opens (MJML compiles asynchronously).
  const [rendered, setRendered] = useState({});
  useEffect(() => {
    if (!open || !ready) return undefined;
    let alive = true;
    Promise.all(
      templates.map(async (entry) => {
        try {
          return [entry.id, (await editor.exportHtml(withThumbnailImages(entry.mjml))).html];
        } catch {
          return [entry.id, ''];
        }
      })
    ).then((pairs) => {
      if (alive) setRendered(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [open, ready, templates, editor]);
  const cards = useMemo(
    () => (open ? templates.map((entry) => ({ ...entry, tags: entry.tags || [], html: rendered[entry.id] ?? '' })) : []),
    [open, templates, rendered]
  );
  /** Every tag of the gallery, in the order the templates bring them. */
  const tags = useMemo(() => [...new Set(templates.flatMap((entry) => entry.tags || []))], [templates]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return cards.filter(
      (card) =>
        (chosen.size === 0 || card.tags.some((tag) => chosen.has(tag))) &&
        (!q || [card.name, card.description, ...card.tags].some((field) => fold(field).includes(q)))
    );
  }, [cards, chosen, query]);

  const toggle = (tag) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  const apply = async (entry) => {
    if (isDirty()) {
      setOpen(false);
      const ok = await confirm({
        title: t('Replace the current email?'),
        description: t('Unsaved changes will be replaced.'),
        confirmLabel: t('Replace'),
        destructive: true,
      });
      if (!ok) return;
    }
    editor.loadMjml(entry.mjml);
    setMeta((meta) => ({
      ...meta,
      subject: meta.subject || entry.subject,
      preheader: meta.preheader || entry.preheader,
    }));
    if (template.id) markDirty();
    setOpen(false);
    notify('success', t('“{name}” template applied.', { name: entry.name }));
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm-compact"
        disabled={!ready}
        onClick={() => {
          setQuery('');
          setChosen(new Set());
          setOpen(true);
        }}
      >
        <LayoutTemplate />
        {t('Templates')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // One height whatever the filters keep: the dialog does not jump.
          className="eb:flex eb:h-[min(48rem,calc(100dvh-2rem))] eb:flex-col eb:sm:max-w-4xl"
          data-testid="eb-template-gallery"
          // Escape clears the search first, then closes.
          onEscapeKeyDown={(event) => {
            if (query) {
              event.preventDefault();
              setQuery('');
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('Start from a template')}</DialogTitle>
            <DialogDescription>{t('Picking a template replaces the email being edited.')}</DialogDescription>
          </DialogHeader>
          <div className="eb:flex eb:shrink-0 eb:flex-col eb:gap-3">
            <div className="eb:relative">
              <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search templates')}
                aria-label={t('Search templates')}
                className="eb:pr-8 eb:pl-8 eb:[&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('Clear the search')}
                  className="eb:absolute eb:top-1/2 eb:right-2.5 eb:-translate-y-1/2 eb:cursor-pointer"
                >
                  <X className="eb:size-3.5 eb:text-foreground-muted eb:hover:text-foreground" />
                </button>
              )}
            </div>
            {tags.length > 0 && (
              <div role="group" aria-label={t('Filter by tag')} className="eb:flex eb:flex-wrap eb:gap-1.5" data-testid="eb-gallery-tags">
                <Chip pressed={chosen.size === 0} onClick={() => setChosen(new Set())}>
                  {t('All')}
                </Chip>
                {tags.map((tag) => (
                  <Chip key={tag} pressed={chosen.has(tag)} onClick={() => toggle(tag)}>
                    {tag}
                  </Chip>
                ))}
              </div>
            )}
          </div>
          {/* Only the cards scroll; the padding keeps their focus ring visible. */}
          <div className="eb:-m-1 eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:p-1">
            {shown.length === 0 ? (
              <p className="eb:m-0 eb:py-10 eb:text-center eb:text-[13px] eb:text-foreground-muted">
                {t('Nothing matches “{query}”.', { query: query.trim() })}
              </p>
            ) : (
              <ul className="eb:m-0 eb:grid eb:list-none eb:grid-cols-1 eb:gap-3 eb:p-0 eb:sm:grid-cols-2 eb:md:grid-cols-3">
                {shown.map((card) => (
                  <li key={card.id} className="eb:min-w-0">
                    <button
                      type="button"
                      onClick={() => apply(card)}
                      data-template-id={card.id}
                      title={card.description}
                      className="eb:group eb:flex eb:h-full eb:w-full eb:flex-col eb:gap-2 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:p-2 eb:text-left eb:transition-colors eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:focus-visible:outline-none eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50"
                    >
                      <Thumbnail html={card.html} title={card.name} />
                      <span className="eb:block eb:min-w-0 eb:px-1">
                        <span className={cn(FADE_LINE, 'eb:text-[13px] eb:font-medium eb:text-foreground')}>{card.name}</span>
                        <span className={cn(FADE_LINE, 'eb:text-[12px] eb:text-foreground-muted')}>{card.description}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
