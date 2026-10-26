import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Download,
  LayoutTemplate,
  Loader2,
  PencilRuler,
  RefreshCw,
  Search,
  Star,
  Tags,
  Trash2,
  X,
} from 'lucide-react';
import { withPlaceholderImages } from '../../features/templates/thumbnails.js';
import { EmailPreview } from '../../features/preview/PreviewButton.jsx';
import { createHttpStorage } from '../../storage/client.js';
import { NoticeArea, UiProvider, useUi } from '../context.jsx';
import { Button } from '../primitives/button.jsx';
import { cn } from '../primitives/cn.js';
import { Input } from '../primitives/fields.jsx';
import { FilterChip, FilterReset, SectionLabel } from '../primitives/misc.jsx';
import { SEARCH_KEYS, SearchKeyHint, useSearchShortcut } from '../primitives/searchShortcut.jsx';
import { useLayoutWidth } from '../useLayoutWidth.js';
import { TAG_SWATCHES, TagBadge } from './TagBadge.jsx';
import TagsDialog from './TagsDialog.jsx';

/**
 * TEMPLATE LIBRARY — the first screen: pick a template, see it, open it.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ ▣ Email template library                                      ×  │
 *   ├──────────────┬──────────────────────────┬────────────────────────┤
 *   │ New template │ Name                  ☆  │ Desktop | Mobile       │
 *   │ 🔍  Ctrl K   │ code                     │ ┌────────────────────┐ │
 *   │ (All)(●Promo)│ Origin, subject, dates…  │ │   rendered email   │ │
 *   │ FAVORITES    │                          │ │                    │ │
 *   │ TEMPLATES    │ Tags  [Promo] [Events] ✎ │ │                    │ │
 *   │              │ [ Edit ] [ Duplicate ]   │ │                    │ │
 *   │              │ [Copy HTML] [Download] 🗑 │ └────────────────────┘ │
 *   └──────────────┴──────────────────────────┴────────────────────────┘
 *
 * Standalone: it never mounts the editor. "Edit" and "New template" only
 * call `onEdit(template)` / `onCreate()`, and the host decides what opens —
 * `EmailBuilder` (see `EmailStudio`, which wires the two), its own screen, a
 * route. Likewise `EmailBuilder` works without it; a new template starts
 * from a base there, with its *Templates* button.
 *
 *   Templates   `storage.list()`; preview through `storage.render()` when the
 *               storage has it, else the HTML compiled at the last save.
 *               *Copy HTML* and *Download* take that HTML (`load()`).
 *   Favorites   the star of the details. A favorite leaves its section for the
 *               one at the top. Kept in this browser (`favoritesKey`, `null`
 *               turns favorites off).
 *   Tags        up to three colored tags on a template, chosen and created in
 *               the tags dialog, when the storage has them (`listTags`…).
 *               The search finds them too, and the tags under it filter
 *               the list: one or several (a template with any of them), or
 *               *All*. Only the tags some template carries are offered.
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

/** Keys of the starred entries: `template:<id>`. */
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

function Row({ entry, selected, favorite, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      data-testid="eb-library-template"
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
      {/* One line whatever the tags: too many fade out before the date, and
          every row keeps the same height. */}
      <span className="eb:mt-1 eb:flex eb:min-h-[18px] eb:items-center eb:gap-2">
        <span className="eb:flex eb:min-w-0 eb:flex-1 eb:gap-1 eb:overflow-hidden eb:[mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)]">
          {entry.tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} className="eb:max-w-[7.5rem]" />
          ))}
        </span>
        {entry.date && <span className="eb:shrink-0 eb:text-[10.5px] eb:text-foreground-muted">{entry.date}</span>}
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
  title,
  description,
  selectedId = null,
  favoritesKey = DEFAULT_FAVORITES_KEY,
  deleteDisabled = null,
  onEdit,
  onCreate,
  onClose,
  className,
}) {
  const { t, locale, notify, confirm } = useUi();
  const storage = useMemo(() => injectedStorage || createHttpStorage(), [injectedStorage]);
  const canTag = typeof storage.listTags === 'function' && typeof storage.setTemplateTags === 'function';
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, DATE_FORMAT), [locale]);
  const formatDate = useCallback((at) => (at ? dateFormat.format(new Date(at)) : ''), [dateFormat]);
  const stars = useFavorites(favoritesKey);

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const layout = useLayoutWidth(rootRef);

  const [items, setItems] = useState({ status: 'loading', list: [], error: null });
  /** The workspace's tags, by name. */
  const [tags, setTags] = useState([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** The tags picked under the search (ids); none is *All*. */
  const [picked, setPicked] = useState(() => new Set());
  /** `template:<id>` */
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
      // Tags that cannot be read leave the templates readable, untagged.
      const [list, tagList] = await Promise.all([storage.list(), canTag ? storage.listTags().catch(() => []) : []]);
      if (ticket === lastRead.current) {
        setItems({ status: 'ready', list, error: null });
        setTags(tagList);
      }
    } catch (error) {
      if (ticket === lastRead.current) setItems({ status: 'error', list: [], error: error.message });
    }
  }, [storage, canTag]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* ── entries ───────────────────────────────────────────────────────────── */

  const templateEntries = useMemo(() => {
    const byId = new Map(tags.map((tag) => [String(tag.id), tag]));
    return items.list.map((item) => ({
      key: `template:${item.id}`,
      id: item.id,
      name: item.name,
      code: codeOf(item.name, `#${item.id}`),
      tags: (item.tags || []).map((id) => byId.get(String(id))).filter(Boolean),
      date: formatDate(item.updatedAt || item.createdAt),
      subject: item.subject,
      item,
    }));
  }, [items.list, tags, formatDate]);
  /** The filters: the tags some template carries, by name. */
  const usedTags = useMemo(() => {
    const used = new Set(items.list.flatMap((item) => (item.tags || []).map(String)));
    return tags.filter((tag) => used.has(String(tag.id)));
  }, [items.list, tags]);
  // A picked tag deleted or left by every template no longer filters.
  const active = new Set(usedTags.map((tag) => String(tag.id)).filter((id) => picked.has(id)));
  const togglePicked = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const shown = templateEntries.filter(
    (e) =>
      (active.size === 0 || e.tags.some((tag) => active.has(String(tag.id)))) &&
      matches(query, e.name, e.code, e.subject, ...e.tags.map((tag) => tag.label))
  );
  const favoriteEntries = shown.filter((e) => stars.favorites.has(e.key));
  const otherTemplates = shown.filter((e) => !stars.favorites.has(e.key));

  // First selection: the requested template, else the most recent one.
  useEffect(() => {
    if (items.status !== 'ready' || selection) return;
    if (items.list.length) setSelection(`template:${items.list[0].id}`);
  }, [items, selection]);

  // Ctrl/Cmd+K focuses the search.
  useSearchShortcut(searchRef);

  const selected = templateEntries.find((e) => e.key === selection) || null;
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
  const source = template
    ? { mjml: template.mjml, subject: template.subject, preheader: template.preheader, html: template.html || '' }
    : null;
  const sourceKey = template ? `template:${template.id}:${template.revision}` : '';
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
    if (deleteDisabled) {
      notify('info', deleteDisabled);
      return;
    }
    const ok = await confirm({
      title: t('Delete “{name}”?', { name: template.name }),
      description: t('The template and its versions will be deleted.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    // The next template of the list takes its place (the previous one at the end).
    const visible = [...favoriteEntries, ...otherTemplates];
    const at = visible.findIndex((e) => e.key === selection);
    const next = at === -1 ? null : visible[at + 1] || visible[at - 1] || null;
    setBusy('delete');
    try {
      await storage.remove(template.id);
      // Out of the list at once: the first selection must not pick it again before the reload.
      setItems((s) => ({ ...s, list: s.list.filter((item) => String(item.id) !== String(template.id)) }));
      setSelection(next?.key ?? null);
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

  /** The selected template's tags, as the dialog sets them. @param {string[]} ids */
  const setTemplateTags = (ids) =>
    setItems((s) => ({ ...s, list: s.list.map((item) => (String(item.id) === templateId ? { ...item, tags: ids } : item)) }));
  /** The list of tags after a change; a deleted tag leaves every template. */
  const changeTags = (list, { deleted } = {}) => {
    setTags(list);
    if (deleted == null) return;
    setItems((s) => ({
      ...s,
      list: s.list.map((item) => (item.tags?.includes(deleted) ? { ...item, tags: item.tags.filter((id) => id !== deleted) } : item)),
    }));
  };

  const canList = typeof storage.list === 'function';
  const rowProps = (entry) => ({
    entry,
    selected: entry.key === selection,
    favorite: stars.favorites.has(entry.key),
    onSelect: () => select(entry.key),
  });

  /* ── left column ───────────────────────────────────────────────────────── */

  const listColumn = (
    <div key="list" className="eb:flex eb:min-h-0 eb:min-w-0 eb:flex-col" data-testid="eb-library-list">
      <div className="eb:flex eb:shrink-0 eb:flex-col eb:gap-2 eb:border-b eb:border-border eb:p-3">
        {onCreate && (
          <Button className="eb:w-full" onClick={() => onCreate()}>
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
            aria-keyshortcuts={SEARCH_KEYS}
            className="eb:pr-16 eb:pl-8 eb:[&::-webkit-search-cancel-button]:hidden"
          />
          <div className="eb:absolute eb:top-1/2 eb:right-2 eb:flex eb:-translate-y-1/2 eb:items-center eb:gap-1">
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label={t('Clear the search')} className="eb:cursor-pointer">
                <X className="eb:size-3.5 eb:text-foreground-muted eb:hover:text-foreground" />
              </button>
            )}
            <SearchKeyHint>{query ? 'Esc' : null}</SearchKeyHint>
          </div>
        </div>
        {usedTags.length > 0 && (
          <div className="eb:flex eb:items-start eb:gap-2.5">
            {/* No tag picked: every template. */}
            <div
              role="group"
              aria-label={t('Filter by tag')}
              className="eb:-m-1 eb:flex eb:max-h-[4.75rem] eb:min-w-0 eb:flex-1 eb:flex-wrap eb:gap-1 eb:overflow-y-auto eb:p-1"
              data-testid="eb-library-tag-filter"
            >
              {usedTags.map((tag) => (
                <FilterChip
                  key={tag.id}
                  pressed={active.has(String(tag.id))}
                  onClick={() => togglePicked(String(tag.id))}
                  className="eb:h-6 eb:max-w-full eb:px-2.5 eb:text-[11.5px]"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'eb:size-2 eb:shrink-0 eb:rounded-full',
                      TAG_SWATCHES[tag.color] || TAG_SWATCHES.gray,
                      active.has(String(tag.id)) && 'eb:ring-1 eb:ring-primary-foreground'
                    )}
                  />
                  <span className="eb:truncate">{tag.label}</span>
                </FilterChip>
              ))}
            </div>
            <FilterReset
              label={t('Clear the tag filters')}
              active={active.size > 0}
              onClick={() => setPicked(new Set())}
              className="eb:size-6"
              data-testid="eb-library-tag-reset"
            />
          </div>
        )}
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
                    : t('No template yet: create the first one.')}
              </p>
            ) : (
              otherTemplates.map((entry) => <Row key={entry.key} {...rowProps(entry)} />)
            )}
          </Section>
        )}
      </div>
    </div>
  );

  /* ── details ───────────────────────────────────────────────────────────── */

  const meta =
    selected || template
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
          {canTag && selected && (
            <>
              <dt className="eb:flex eb:h-6 eb:items-center eb:text-foreground-muted">{t('Tags')}</dt>
              <dd className="eb:m-0 eb:flex eb:min-w-0 eb:flex-wrap eb:items-center eb:gap-1" data-testid="eb-library-tags">
                {selected.tags.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} className="eb:text-[11.5px]" />
                ))}
                <Button
                  variant="ghost"
                  size="xs"
                  className="eb:text-foreground-lighter"
                  onClick={() => setTagsOpen(true)}
                  data-testid="eb-library-tags-button"
                >
                  <Tags />
                  {selected.tags.length ? t('Edit tags') : t('Add tags')}
                </Button>
              </dd>
            </>
          )}
        </dl>
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

  const actions = template ? (
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
              className={cn('eb:text-destructive', !template.html && 'eb:ml-auto', deleteDisabled && 'eb:opacity-50 eb:hover:bg-background eb:hover:text-destructive')}
              disabled={!!busy}
              onClick={remove}
              aria-disabled={deleteDisabled ? true : undefined}
              aria-label={t('Delete')}
              title={deleteDisabled || t('Delete')}
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

      {canTag && selected && (
        <TagsDialog
          open={tagsOpen}
          onOpenChange={setTagsOpen}
          template={selected.item}
          tags={tags}
          storage={storage}
          onTagsChange={changeTags}
          onTemplateTags={setTemplateTags}
        />
      )}

      {layout === 'narrow' ? (
        <div className="eb:grid eb:min-h-0 eb:flex-1 eb:grid-cols-[minmax(0,1fr)]">
          {detailsOpen && selection ? detailsColumn : listColumn}
        </div>
      ) : (
        <div
          className={cn(
            'eb:grid eb:min-h-0 eb:flex-1 eb:grid-rows-1 eb:divide-x eb:divide-border eb:overflow-hidden',
            // Wide: the list a fifth of the width (never under 260 px), the
            // template and its preview the same width.
            layout === 'wide' ? 'eb:grid-cols-[minmax(260px,20%)_minmax(0,1fr)_minmax(0,1fr)]' : 'eb:grid-cols-[260px_minmax(0,1fr)]'
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
 *   title?: string,
 *   description?: string,
 *   selectedId?: string|number|null,
 *   favoritesKey?: string|null,
 *   deleteDisabled?: string|null,
 *   onEdit?: (template: import('../../storage/client.js').StoredTemplate) => void,
 *   onCreate?: () => void,
 *   onClose?: () => void,
 *   className?: string,
 * }} props  `deleteDisabled`: *Delete* stays in its place but deletes
 *   nothing — a click shows this text (a demo, a user without the right).
 */
export default function TemplateLibrary({ locale = 'en', messages, onNotify, ...props }) {
  return (
    <UiProvider locale={locale} messages={messages} onNotify={onNotify}>
      <Library {...props} />
    </UiProvider>
  );
}
