import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Download,
  LayoutTemplate,
  Loader2,
  PencilRuler,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { TEMPLATE_GALLERY, buildGallery, withPlaceholderImages } from '../../features/templates/gallery.js';
import { EmailPreview } from '../../features/preview/PreviewButton.jsx';
import { createHttpStorage } from '../../storage/client.js';
import { NoticeArea, UiProvider, useUi } from '../context.jsx';
import { Button } from '../primitives/button.jsx';
import { cn } from '../primitives/cn.js';
import { Input } from '../primitives/fields.jsx';
import { SectionLabel } from '../primitives/misc.jsx';
import { useLayoutWidth } from '../useLayoutWidth.js';

/**
 * TEMPLATE LIBRARY — the first screen: pick a template, see it, open it.
 * Same screen as the template bank of the Fimainfo extranet.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ ▣ Email template library                                      ×  │
 *   ├──────────────┬──────────────────────────┬────────────────────────┤
 *   │ New template │ Name                  ☆  │ Desktop | Mobile       │
 *   │ 🔍  Ctrl K   │ code                     │ ┌────────────────────┐ │
 *   │ FAVORITES    │ Origin, subject, dates…  │ │   rendered email   │ │
 *   │ TEMPLATES    │                          │ │                    │ │
 *   │ BASES        │ [ Edit ] [ Duplicate ]   │ └────────────────────┘ │
 *   └──────────────┴──────────────────────────┴────────────────────────┘
 *
 * Standalone: it never mounts the editor. "Edit", "New template" and "Start
 * from this base" only call `onEdit(template)` / `onCreate(start)`, and the
 * host decides what opens — `EmailBuilder` (see `EmailStudio`, which wires
 * the two), its own screen, a route. Likewise `EmailBuilder` works without it.
 *
 *   Templates   `storage.list()`; preview through `storage.render()` when the
 *               storage has it, else the HTML compiled at the last save.
 *   Bases       the gallery (`templates`, `[]` hides them): read-only, "Start
 *               from this base" calls `onCreate({ baseId, mjml, meta })`.
 *   Favorites   the star of the details. A favorite leaves its section for the
 *               one at the top. Kept in this browser (`favoritesKey`, `null`
 *               turns favorites off).
 *
 * Layout follows the library's own width, like the builder: three columns,
 * then the preview under the details, then (phone) list and details as two
 * screens.
 */

const DATE_FORMAT = { day: '2-digit', month: '2-digit', year: 'numeric' };
const DEFAULT_FAVORITES_KEY = 'best-email-builder:favorites';

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
};

/** `October newsletter` → `october_newsletter`: the code line under a name. */
const codeOf = (name, fallback) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || fallback;

/** Keys of the starred entries: `template:<id>` or `base:<id>`. */
function useFavorites(storageKey) {
  const [favorites, setFavorites] = useState(() => {
    if (!storageKey) return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  const toggle = useCallback(
    (key) =>
      setFavorites((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Private window, blocked storage: the star holds until the page closes.
        }
        return next;
      }),
    [storageKey]
  );
  return { enabled: Boolean(storageKey), favorites, toggle };
}

function download(name, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${codeOf(name, 'email')}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Badge({ children }) {
  return (
    <span className="eb:inline-flex eb:w-fit eb:shrink-0 eb:items-center eb:rounded-md eb:border eb:border-border eb:px-1.5 eb:py-0 eb:text-[10px] eb:whitespace-nowrap eb:text-foreground">
      {children}
    </span>
  );
}

function Row({ entry, selected, favorite, onSelect, testId }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      data-testid={testId}
      className={cn(
        'eb:w-full eb:rounded-lg2 eb:border eb:px-2.5 eb:py-2 eb:text-left eb:transition-colors eb:outline-none',
        'eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
        selected ? 'eb:border-primary/50 eb:bg-primary/5' : 'eb:border-transparent eb:hover:bg-surface-75'
      )}
    >
      <span className="eb:flex eb:items-center eb:gap-1.5">
        <span className="eb:min-w-0 eb:flex-1 eb:truncate eb:text-[13px] eb:text-foreground">{entry.name}</span>
        {favorite && <Star className="eb:size-3.5 eb:shrink-0 eb:fill-current eb:text-warning" aria-hidden="true" />}
      </span>
      <span className="eb:mt-0.5 eb:block eb:truncate eb:font-mono eb:text-[11px] eb:text-foreground-lighter">{entry.code}</span>
      <span className="eb:mt-1 eb:flex eb:flex-wrap eb:items-center eb:gap-1">
        <Badge>{entry.badge}</Badge>
        {entry.date && <span className="eb:ml-auto eb:text-[10.5px] eb:text-foreground-muted">{entry.date}</span>}
      </span>
    </button>
  );
}

function Section({ label, children, ...props }) {
  return (
    <div className="eb:flex eb:flex-col eb:gap-1.5" {...props}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

function Library({
  storage: injectedStorage,
  sender,
  templates: galleryProp,
  title,
  description,
  selectedId = null,
  favoritesKey = DEFAULT_FAVORITES_KEY,
  onEdit,
  onCreate,
  onClose,
  className,
}) {
  const { t, locale, notify, confirm } = useUi();
  const storage = useMemo(() => injectedStorage || createHttpStorage(), [injectedStorage]);
  const bases = useMemo(
    () => buildGallery({ templates: galleryProp ?? TEMPLATE_GALLERY, sender: sender || {}, t }),
    [galleryProp, sender, t]
  );
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT), [locale]);
  const formatDate = useCallback((at) => (at ? dateFormat.format(new Date(at)) : ''), [dateFormat]);
  const stars = useFavorites(favoritesKey);

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const layout = useLayoutWidth(rootRef);

  const [items, setItems] = useState({ status: 'loading', list: [], error: null });
  const [query, setQuery] = useState('');
  /** `template:<id>` or `base:<id>` */
  const [selection, setSelection] = useState(selectedId != null ? `template:${selectedId}` : null);
  /** Phone layout: the details screen is shown over the list. */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detail, setDetail] = useState({ status: 'idle', template: null, error: null });
  const [preview, setPreview] = useState({ html: '', loading: false, error: null });
  const [device, setDevice] = useState('desktop');
  const [busy, setBusy] = useState(null);

  // Only the LAST read counts: a slow answer arriving after a newer one
  // (opening, then a duplicate) would show a stale list.
  const lastRead = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++lastRead.current;
    if (typeof storage.list !== 'function') {
      setItems({ status: 'ready', list: [], error: null });
      return;
    }
    setItems((s) => ({ ...s, status: s.list.length ? 'ready' : 'loading', error: null }));
    try {
      const list = await storage.list();
      if (ticket === lastRead.current) setItems({ status: 'ready', list, error: null });
    } catch (error) {
      if (ticket === lastRead.current) setItems({ status: 'error', list: [], error: error.message });
    }
  }, [storage]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ── entries: one shape for templates and bases ────────────────────────── */

  const templateEntries = useMemo(
    () =>
      items.list.map((item) => ({
        key: `template:${item.id}`,
        kind: 'template',
        id: item.id,
        name: item.name,
        code: codeOf(item.name, `#${item.id}`),
        badge: t('Builder'),
        date: formatDate(item.updatedAt || item.createdAt),
        subject: item.subject,
        item,
      })),
    [items.list, t, formatDate]
  );
  const baseEntries = useMemo(
    () =>
      bases.map((base) => ({
        key: `base:${base.id}`,
        kind: 'base',
        id: base.id,
        name: base.name,
        code: `base_${base.id}`,
        badge: t('Base'),
        date: '',
        subject: base.subject,
        base,
      })),
    [bases, t]
  );
  const shown = (entries) => entries.filter((e) => matches(query, e.name, e.code, e.subject, e.base?.description));
  const favoriteEntries = shown([...templateEntries, ...baseEntries]).filter((e) => stars.favorites.has(e.key));
  const otherTemplates = shown(templateEntries).filter((e) => !stars.favorites.has(e.key));
  const otherBases = shown(baseEntries).filter((e) => !stars.favorites.has(e.key));

  // First selection: the requested template, else the most recent one, else
  // the first base with something to show (a blank page previews as nothing).
  useEffect(() => {
    if (items.status !== 'ready' || selection) return;
    const base = bases.find((b) => b.mjml.includes('<mj-section')) || bases[0];
    if (items.list.length) setSelection(`template:${items.list[0].id}`);
    else if (base) setSelection(`base:${base.id}`);
  }, [items, selection, bases]);

  // Ctrl/Cmd+K focuses the search, as in the extranet.
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && rootRef.current?.isConnected) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const selected =
    templateEntries.find((e) => e.key === selection) || baseEntries.find((e) => e.key === selection) || null;
  const base = selected?.kind === 'base' ? selected.base : null;
  const templateId = selection?.startsWith('template:') ? selection.slice('template:'.length) : null;

  // Details of a saved template (MJML and compiled HTML are not in the list).
  useEffect(() => {
    if (templateId == null) {
      setDetail({ status: 'idle', template: null, error: null });
      return undefined;
    }
    let live = true;
    setDetail((d) => ({ status: 'loading', template: String(d.template?.id) === templateId ? d.template : null, error: null }));
    storage.load(templateId).then(
      (template) => live && setDetail({ status: 'ready', template, error: null }),
      (error) => live && setDetail({ status: 'error', template: null, error: error.message })
    );
    return () => {
      live = false;
    };
  }, [templateId, storage]);

  // Preview: rendered by the storage (server) when it can, else the saved HTML.
  const template = detail.template;
  const source = base
    ? { mjml: base.mjml, subject: base.subject, preheader: base.preheader, html: '' }
    : template
      ? { mjml: template.mjml, subject: template.subject, preheader: template.preheader, html: template.html || '' }
      : null;
  const sourceKey = base ? `base:${base.id}:${locale}` : template ? `template:${template.id}:${template.revision}` : '';
  useEffect(() => {
    if (!source) {
      setPreview({ html: '', loading: templateId != null && detail.status === 'loading', error: null });
      return undefined;
    }
    if (typeof storage.render !== 'function' || !source.mjml) {
      setPreview({ html: source.html, loading: false, error: source.html ? null : t('No preview: this storage cannot render emails.') });
      return undefined;
    }
    let live = true;
    setPreview((p) => ({ ...p, loading: true, error: null }));
    storage.render({ mjml: source.mjml, subject: source.subject, preheader: source.preheader }).then(
      (result) => live && setPreview({ html: withPlaceholderImages(result.html), loading: false, error: null }),
      (error) => live && setPreview({ html: source.html, loading: false, error: source.html ? null : error.message })
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, storage]);

  /* ── actions ───────────────────────────────────────────────────────────── */

  const select = (key) => {
    setSelection(key);
    setDetailsOpen(true);
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('Delete “{name}”?', { name: template.name }),
      description: t('The template and its versions will be deleted.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await storage.remove(template.id);
      setSelection(null);
      setDetailsOpen(false);
      await reload();
      notify('success', t('Template deleted.'));
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async () => {
    setBusy('duplicate');
    try {
      const { template: copy } = await storage.duplicate(template.id);
      await reload();
      setSelection(`template:${copy.id}`);
      notify('success', t('Template duplicated.'));
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(null);
    }
  };

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(template.html);
      notify('success', t('HTML copied.'));
    } catch {
      notify('error', t('The browser refused to copy.'));
    }
  };

  const canList = typeof storage.list === 'function';
  const rowProps = (entry) => ({
    entry,
    testId: entry.kind === 'base' ? 'eb-library-base' : 'eb-library-template',
    selected: entry.key === selection,
    favorite: stars.favorites.has(entry.key),
    onSelect: () => select(entry.key),
  });

  /* ── left column ───────────────────────────────────────────────────────── */

  const listColumn = (
    <div key="list" className="eb:flex eb:min-h-0 eb:min-w-0 eb:flex-col" data-testid="eb-library-list">
      <div className="eb:flex eb:shrink-0 eb:flex-col eb:gap-2 eb:border-b eb:border-border eb:p-3">
        {onCreate && (
          <Button className="eb:w-full" onClick={() => onCreate(null)}>
            <PencilRuler />
            {t('New template')}
          </Button>
        )}
        <div className="eb:relative">
          <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              }
            }}
            placeholder={t('Search templates')}
            aria-label={t('Search templates')}
            aria-keyshortcuts="Control+K"
            className="eb:pr-16 eb:pl-8 eb:[&::-webkit-search-cancel-button]:hidden"
          />
          <div className="eb:absolute eb:top-1/2 eb:right-2 eb:flex eb:-translate-y-1/2 eb:items-center eb:gap-1">
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('Clear the search')} className="eb:cursor-pointer">
                <X className="eb:size-3.5 eb:text-foreground-muted eb:hover:text-foreground" />
              </button>
            )}
            <kbd
              className="eb:inline-flex eb:h-5 eb:items-center eb:rounded eb:border eb:border-border eb:bg-surface-100 eb:px-1.5 eb:font-mono eb:text-[10px] eb:text-foreground-muted"
              aria-hidden="true"
            >
              {query ? 'Esc' : 'Ctrl K'}
            </kbd>
          </div>
        </div>
      </div>

      <div className="eb:flex eb:min-h-0 eb:flex-1 eb:flex-col eb:gap-4 eb:overflow-y-auto eb:p-3">
        {stars.enabled && favoriteEntries.length > 0 && (
          <Section label={t('Favorites')} role="group" aria-label={t('Favorites')} data-testid="eb-library-favorites">
            {favoriteEntries.map((entry) => (
              <Row key={entry.key} {...rowProps(entry)} />
            ))}
          </Section>
        )}
        {canList && (
          <Section label={`${t('Templates')} (${otherTemplates.length})`} data-testid="eb-library-templates">
            {items.status === 'loading' ? (
              <p className="eb:m-0 eb:flex eb:items-center eb:gap-2 eb:px-1 eb:text-[12px] eb:text-foreground-lighter">
                <Loader2 className="eb:size-3.5 eb:animate-spin" />
                {t('Loading…')}
              </p>
            ) : items.status === 'error' ? (
              <div className="eb:px-1 eb:text-[12px] eb:text-destructive">
                <p className="eb:m-0">{t('Could not load the templates.')}</p>
                <p className="eb:m-0 eb:mt-0.5 eb:text-foreground-muted">{items.error}</p>
                <Button variant="outline" size="sm-compact" className="eb:mt-2" onClick={reload}>
                  <RefreshCw />
                  {t('Retry')}
                </Button>
              </div>
            ) : otherTemplates.length === 0 ? (
              <p className="eb:m-0 eb:px-1 eb:text-[12px] eb:leading-relaxed eb:text-foreground-lighter">
                {query
                  ? t('Nothing matches “{query}”.', { query })
                  : templateEntries.length
                    ? t('All your templates are in the favorites.')
                    : t('No template yet. Start from a base, or create a new one.')}
              </p>
            ) : (
              otherTemplates.map((entry) => <Row key={entry.key} {...rowProps(entry)} />)
            )}
          </Section>
        )}
        {otherBases.length > 0 && (
          <Section label={`${t('Bases')} (${otherBases.length})`} data-testid="eb-library-bases">
            {otherBases.map((entry) => (
              <Row key={entry.key} {...rowProps(entry)} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );

  /* ── details ───────────────────────────────────────────────────────────── */

  const meta = base
    ? { name: base.name, code: `base_${base.id}`, description: base.description, origin: t('Base'), subject: base.subject, preheader: base.preheader }
    : selected || template
      ? {
          name: template?.name ?? selected.name,
          code: selected?.code ?? codeOf(template?.name, `#${templateId}`),
          description: template?.description ?? selected?.item?.description,
          origin: t('Builder'),
          subject: (template ?? selected?.item)?.subject,
          preheader: (template ?? selected?.item)?.preheader,
          createdAt: (template ?? selected?.item)?.createdAt,
          createdBy: (template ?? selected?.item)?.createdBy,
          updatedAt: (template ?? selected?.item)?.updatedAt,
          updatedBy: (template ?? selected?.item)?.updatedBy,
        }
      : null;
  const favorite = selection ? stars.favorites.has(selection) : false;

  const detailsBody =
    templateId != null && detail.status === 'error' ? (
      <p className="eb:m-0 eb:flex eb:items-start eb:gap-2 eb:text-[13px] eb:text-destructive">
        <AlertCircle className="eb:mt-0.5 eb:size-4 eb:shrink-0" />
        {detail.error}
      </p>
    ) : meta ? (
      <>
        <div className="eb:flex eb:flex-col eb:gap-1">
          <div className="eb:flex eb:items-center eb:gap-2">
            <h3 className="eb:m-0 eb:min-w-0 eb:flex-1 eb:text-[15px] eb:font-medium eb:text-foreground">{meta.name}</h3>
            {stars.enabled && (
              <Button
                variant="ghost"
                size="icon-sm-compact"
                className={cn('eb:shrink-0', favorite ? 'eb:text-warning' : 'eb:text-foreground-muted eb:hover:text-warning')}
                onClick={() => stars.toggle(selection)}
                aria-pressed={favorite}
                aria-label={favorite ? t('Remove from favorites') : t('Add to favorites')}
                title={favorite ? t('Remove from favorites') : t('Add to favorites')}
              >
                <Star className={cn('eb:size-4', favorite && 'eb:fill-current')} />
              </Button>
            )}
          </div>
          <p className="eb:m-0 eb:font-mono eb:text-[11.5px] eb:text-foreground-lighter">{meta.code}</p>
          {meta.description && (
            <p className="eb:m-0 eb:text-[12.5px] eb:leading-relaxed eb:text-foreground-lighter">{meta.description}</p>
          )}
        </div>

        <dl className="eb:m-0 eb:grid eb:grid-cols-[110px_minmax(0,1fr)] eb:gap-x-3 eb:gap-y-1.5 eb:text-[12px]">
          <dt className="eb:text-foreground-muted">{t('Origin')}</dt>
          <dd className="eb:m-0 eb:text-foreground">{meta.origin}</dd>
          <dt className="eb:text-foreground-muted">{t('Subject')}</dt>
          <dd className="eb:m-0 eb:break-words eb:text-foreground">{meta.subject || '—'}</dd>
          <dt className="eb:text-foreground-muted">{t('Preview text')}</dt>
          <dd className="eb:m-0 eb:break-words eb:text-foreground-lighter">{meta.preheader || '—'}</dd>
          {!base && (
            <>
              <dt className="eb:text-foreground-muted">{t('Created')}</dt>
              <dd className="eb:m-0 eb:text-foreground">
                {formatDate(meta.createdAt) || '—'}
                {meta.createdBy ? ` ${t('by {name}', { name: meta.createdBy })}` : ''}
              </dd>
              {meta.updatedAt && (
                <>
                  <dt className="eb:text-foreground-muted">{t('Updated')}</dt>
                  <dd className="eb:m-0 eb:text-foreground">
                    {formatDate(meta.updatedAt)}
                    {meta.updatedBy ? ` ${t('by {name}', { name: meta.updatedBy })}` : ''}
                  </dd>
                </>
              )}
            </>
          )}
        </dl>

        {base && (
          <p className="eb:m-0 eb:rounded-lg2 eb:border eb:border-border eb:bg-surface-75 eb:p-2.5 eb:text-[12px] eb:leading-relaxed eb:text-foreground-lighter">
            {t('Base — not editable: start from it to create your template.')}
          </p>
        )}
      </>
    ) : (
      <div className="eb:flex eb:flex-1 eb:items-center eb:justify-center">
        <div className="eb:flex eb:w-full eb:flex-col eb:items-center eb:justify-center eb:gap-2 eb:rounded-lg2 eb:border eb:border-border eb:bg-surface-75 eb:px-6 eb:py-12 eb:text-center">
          <span className="eb:flex eb:size-12 eb:items-center eb:justify-center eb:rounded-full eb:bg-surface-200 eb:text-foreground-muted">
            <LayoutTemplate className="eb:size-6" />
          </span>
          <p className="eb:m-0 eb:text-[13px] eb:font-medium eb:text-foreground">{t('Choose a template')}</p>
          <p className="eb:m-0 eb:max-w-sm eb:text-[13px] eb:leading-relaxed eb:text-foreground-muted">
            {t('Select a template on the left.')}
          </p>
        </div>
      </div>
    );

  const actions = base ? (
    onCreate && (
      <Button
        className="eb:w-full"
        onClick={() => onCreate({ baseId: base.id, mjml: base.mjml, meta: { subject: base.subject, preheader: base.preheader } })}
      >
        <Plus />
        {t('Start from this base')}
      </Button>
    )
  ) : template ? (
    <>
      <div className="eb:flex eb:gap-2">
        {onEdit && (
          <Button className="eb:flex-1" onClick={() => onEdit(template)}>
            <PencilRuler />
            {t('Edit')}
          </Button>
        )}
        <Button variant="outline" className="eb:flex-1" disabled={!!busy} onClick={duplicate}>
          {busy === 'duplicate' ? <Loader2 className="eb:animate-spin" /> : <Copy />}
          {t('Duplicate')}
        </Button>
      </div>
      {(template.html || typeof storage.remove === 'function') && (
        <div className="eb:flex eb:gap-2">
          {template.html && (
            <>
              <Button variant="outline" size="sm-compact" className="eb:flex-1" onClick={copyHtml}>
                <Copy />
                {t('Copy HTML')}
              </Button>
              <Button variant="outline" size="sm-compact" className="eb:flex-1" onClick={() => download(template.name, template.html)}>
                <Download />
                {t('Download')}
              </Button>
            </>
          )}
          {typeof storage.remove === 'function' && (
            <Button
              variant="outline"
              size="sm-compact"
              className={cn('eb:text-destructive', !template.html && 'eb:ml-auto')}
              disabled={!!busy}
              onClick={remove}
              aria-label={t('Delete')}
              title={t('Delete')}
            >
              {busy === 'delete' ? <Loader2 className="eb:animate-spin" /> : <Trash2 />}
              {!template.html && t('Delete')}
            </Button>
          )}
        </div>
      )}
    </>
  ) : null;

  const previewPane =
    preview.html || preview.loading || preview.error ? (
      <EmailPreview html={preview.html} loading={preview.loading} error={preview.error} device={device} onDeviceChange={setDevice} />
    ) : (
      <div className="eb:flex eb:h-full eb:min-h-40 eb:items-center eb:justify-center eb:rounded-lg2 eb:border eb:border-dashed eb:border-border eb:p-6 eb:text-center eb:text-[13px] eb:text-foreground-lighter">
        {t('The template preview appears here.')}
      </div>
    );

  const detailsColumn = (
    <div key="details" className="eb:flex eb:min-h-0 eb:min-w-0 eb:flex-col" data-testid="eb-library-details">
      {layout === 'narrow' && (
        <div className="eb:shrink-0 eb:border-b eb:border-border eb:px-2 eb:py-1.5">
          <Button variant="ghost" size="sm-compact" onClick={() => setDetailsOpen(false)}>
            <ArrowLeft />
            {t('All templates')}
          </Button>
        </div>
      )}
      <div className="eb:flex eb:min-h-0 eb:flex-1 eb:flex-col eb:gap-4 eb:overflow-y-auto eb:p-4">
        {detailsBody}
        {layout !== 'wide' && meta && <div className="eb:h-[560px] eb:shrink-0">{previewPane}</div>}
      </div>
      {actions && <div className="eb:flex eb:shrink-0 eb:flex-col eb:gap-2 eb:border-t eb:border-border eb:p-3">{actions}</div>}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={cn('eb-root eb:relative eb:flex eb:h-full eb:min-h-0 eb:flex-col eb:bg-background eb:text-foreground', className)}
      data-testid="template-library"
      data-layout={layout}
    >
      <header className="eb:flex eb:shrink-0 eb:items-center eb:gap-3 eb:border-b eb:border-border eb:px-5 eb:py-3.5">
        <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
          <LayoutTemplate className="eb:size-5" />
        </span>
        <div className="eb:min-w-0 eb:flex-1">
          <h2 className="eb:m-0 eb:truncate eb:text-base eb:font-normal eb:text-foreground">{title ?? t('Email template library')}</h2>
          <p className="eb:m-0 eb:truncate eb:text-[13px] eb:text-foreground-muted">
            {description ?? t('Ready-made templates to copy into your campaigns.')}
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('Close')}>
            <X />
          </Button>
        )}
      </header>

      {layout === 'narrow' ? (
        <div className="eb:grid eb:min-h-0 eb:flex-1 eb:grid-cols-[minmax(0,1fr)]">
          {detailsOpen && selection ? detailsColumn : listColumn}
        </div>
      ) : (
        <div
          className={cn(
            'eb:grid eb:min-h-0 eb:flex-1 eb:grid-rows-1 eb:divide-x eb:divide-border eb:overflow-hidden',
            layout === 'wide' ? 'eb:grid-cols-[290px_minmax(0,1fr)_minmax(0,1fr)]' : 'eb:grid-cols-[260px_minmax(0,1fr)]'
          )}
        >
          {listColumn}
          {detailsColumn}
          {layout === 'wide' && (
            <div className="eb:min-h-0 eb:min-w-0 eb:p-3" data-testid="eb-library-preview">
              {previewPane}
            </div>
          )}
        </div>
      )}
      <NoticeArea />
    </div>
  );
}

/**
 * @param {{
 *   storage?: import('../../storage/client.js').TemplateStorage,
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   onNotify?: (level: 'success'|'info'|'warning'|'error', message: string) => void,
 *   sender?: import('../../features/templates/starter.js').StarterSender,
 *   templates?: import('../../features/templates/gallery.js').GalleryTemplate[],
 *   title?: string,
 *   description?: string,
 *   selectedId?: string|number|null,
 *   favoritesKey?: string|null,
 *   onEdit?: (template: import('../../storage/client.js').StoredTemplate) => void,
 *   onCreate?: (start: null | {baseId: string, mjml: string, meta: {subject?: string, preheader?: string}}) => void,
 *   onClose?: () => void,
 *   className?: string,
 * }} props
 */
export default function TemplateLibrary({ locale = 'en', messages, onNotify, ...props }) {
  return (
    <UiProvider locale={locale} messages={messages} onNotify={onNotify}>
      <Library {...props} />
    </UiProvider>
  );
}
