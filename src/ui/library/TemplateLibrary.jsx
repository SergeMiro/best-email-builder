import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  Download,
  FilePlus2,
  LayoutTemplate,
  Loader2,
  Mail,
  PencilLine,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { TEMPLATE_GALLERY, buildGallery, withPlaceholderImages } from '../../features/templates/gallery.js';
import { EmailPreview } from '../../features/preview/PreviewButton.jsx';
import { createHttpStorage } from '../../storage/client.js';
import { NoticeArea, UiProvider, useUi } from '../context.jsx';
import { Button } from '../primitives/button.jsx';
import { cn } from '../primitives/cn.js';
import { SectionLabel, TruncatedText } from '../primitives/misc.jsx';
import { useLayoutWidth } from '../useLayoutWidth.js';

/**
 * TEMPLATE LIBRARY — the first screen: pick a template, see it, open it.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ ▣ Email template library                                      ×  │
 *   ├──────────────┬────────────────────────┬──────────────────────────┤
 *   │ + New        │ Name                   │ Desktop | Mobile         │
 *   │ 🔍 Search    │ subject, dates…        │ ┌──────────────────────┐ │
 *   │ MY TEMPLATES │                        │ │   rendered email     │ │
 *   │ BASES        │ [ Edit ]               │ └──────────────────────┘ │
 *   └──────────────┴────────────────────────┴──────────────────────────┘
 *
 * Standalone: it never mounts the editor. "Edit" and "New template" only call
 * `onEdit(template)` / `onCreate(start)`, and the host decides what opens —
 * `EmailBuilder` (see `EmailStudio`, which wires the two), its own screen, a
 * route. Likewise `EmailBuilder` works without the library.
 *
 *   My templates  `storage.list()`; preview through `storage.render()` when
 *                 the storage has it, else the HTML compiled at the last save.
 *   Bases         the gallery (`templates`, `[]` hides them): read-only, "Start
 *                 from this base" calls `onCreate({ mjml, meta, baseId })`.
 *
 * Layout follows the library's own width, like the builder: three columns,
 * then the preview under the details, then (phone) list and details as two
 * screens.
 */

const DATE_FORMAT = { day: '2-digit', month: '2-digit', year: 'numeric' };

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f || '').toLowerCase().includes(q));
};

function download(name, html) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${String(name || 'email').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'email'}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ListItem({ selected, onSelect, title, code, subtitle, date, badge, testId }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        data-testid={testId}
        className={cn(
          'eb:group eb:w-full eb:rounded-lg2 eb:border eb:px-3 eb:py-2.5 eb:text-left eb:transition-colors eb:outline-none',
          'eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
          selected
            ? 'eb:border-primary/40 eb:bg-primary/5 eb:shadow-xs'
            : 'eb:border-transparent eb:hover:border-border eb:hover:bg-surface-75'
        )}
      >
        <span className="eb:flex eb:items-start eb:gap-2">
          <TruncatedText className="eb:min-w-0 eb:flex-1 eb:text-[13px] eb:font-medium eb:text-foreground">{title}</TruncatedText>
          {badge}
        </span>
        <TruncatedText className="eb:mt-0.5 eb:font-mono eb:text-[11px] eb:text-foreground-muted">{code}</TruncatedText>
        <span className="eb:mt-1 eb:flex eb:items-center eb:gap-2 eb:text-[11px] eb:text-foreground-lighter">
          <TruncatedText className="eb:min-w-0 eb:flex-1">{subtitle}</TruncatedText>
          {date && <span className="eb:shrink-0 eb:tabular-nums">{date}</span>}
        </span>
      </button>
    </li>
  );
}

function Pill({ children }) {
  return (
    <span className="eb:shrink-0 eb:rounded-md eb:border eb:border-border eb:bg-background eb:px-1.5 eb:py-px eb:text-[10px] eb:font-medium eb:text-foreground-lighter">
      {children}
    </span>
  );
}

function MetaRow({ label, children }) {
  return (
    <div className="eb:grid eb:grid-cols-[110px_minmax(0,1fr)] eb:gap-3 eb:py-1.5 eb:text-[13px]">
      <dt className="eb:text-foreground-muted">{label}</dt>
      <dd className="eb:m-0 eb:break-words eb:text-foreground">{children}</dd>
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

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const layout = useLayoutWidth(rootRef);

  const [items, setItems] = useState({ status: 'loading', list: [], error: null });
  const [query, setQuery] = useState('');
  /** {kind: 'template'|'base', id} */
  const [selection, setSelection] = useState(selectedId != null ? { kind: 'template', id: selectedId } : null);
  /** Phone layout: the details screen is shown over the list. */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detail, setDetail] = useState({ status: 'idle', template: null, error: null });
  const [preview, setPreview] = useState({ html: '', loading: false, error: null });
  const [device, setDevice] = useState('desktop');
  const [busy, setBusy] = useState(null);

  const reload = useCallback(async () => {
    if (typeof storage.list !== 'function') {
      setItems({ status: 'ready', list: [], error: null });
      return [];
    }
    setItems((s) => ({ ...s, status: s.list.length ? 'ready' : 'loading', error: null }));
    try {
      const list = await storage.list();
      setItems({ status: 'ready', list, error: null });
      return list;
    } catch (error) {
      setItems({ status: 'error', list: [], error: error.message });
      return [];
    }
  }, [storage]);

  useEffect(() => {
    reload();
  }, [reload]);

  // First selection: the requested template, else the most recent one, else
  // the first base with something to show (a blank page previews as nothing).
  useEffect(() => {
    if (items.status !== 'ready' || selection) return;
    const shown = bases.find((b) => b.mjml.includes('<mj-section')) || bases[0];
    if (items.list.length) setSelection({ kind: 'template', id: items.list[0].id });
    else if (shown) setSelection({ kind: 'base', id: shown.id });
  }, [items, selection, bases]);

  // Ctrl/Cmd+K focuses the search, as in most pickers.
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

  const base = selection?.kind === 'base' ? bases.find((b) => b.id === selection.id) || null : null;
  const summary =
    selection?.kind === 'template' ? items.list.find((i) => String(i.id) === String(selection.id)) || null : null;

  // Details of a saved template (MJML and compiled HTML are not in the list).
  useEffect(() => {
    if (selection?.kind !== 'template') {
      setDetail({ status: 'idle', template: null, error: null });
      return undefined;
    }
    let live = true;
    setDetail((d) => ({ status: 'loading', template: String(d.template?.id) === String(selection.id) ? d.template : null, error: null }));
    storage.load(selection.id).then(
      (template) => live && setDetail({ status: 'ready', template, error: null }),
      (error) => live && setDetail({ status: 'error', template: null, error: error.message })
    );
    return () => {
      live = false;
    };
  }, [selection, storage]);

  // Preview: rendered by the storage (server) when it can, else the saved HTML.
  const source = base
    ? { mjml: base.mjml, subject: base.subject, preheader: base.preheader, html: '' }
    : detail.template
      ? { mjml: detail.template.mjml, subject: detail.template.subject, preheader: detail.template.preheader, html: detail.template.html || '' }
      : null;
  const sourceKey = base ? `base:${base.id}:${locale}` : detail.template ? `template:${detail.template.id}:${detail.template.revision}` : '';
  useEffect(() => {
    if (!source) {
      setPreview({ html: '', loading: selection?.kind === 'template' && detail.status === 'loading', error: null });
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

  const select = (next) => {
    setSelection(next);
    setDetailsOpen(true);
  };

  const remove = async (template) => {
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

  const duplicate = async (template) => {
    setBusy('duplicate');
    try {
      const { template: copy } = await storage.duplicate(template.id);
      await reload();
      setSelection({ kind: 'template', id: copy.id });
      notify('success', t('Template duplicated.'));
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(null);
    }
  };

  const copyHtml = async (html) => {
    try {
      await navigator.clipboard.writeText(html);
      notify('success', t('HTML copied.'));
    } catch {
      notify('error', t('The browser refused to copy.'));
    }
  };

  const mine = items.list.filter((i) => matches(query, i.name, i.subject, i.id));
  const shownBases = bases.filter((b) => matches(query, b.name, b.description, b.id));
  const canList = typeof storage.list === 'function';

  /* ── columns ─────────────────────────────────────────────────────────── */

  const listColumn = (
    <div key="list" className="eb:flex eb:min-h-0 eb:flex-col eb:bg-surface-75/40" data-testid="eb-library-list">
      <div className="eb:flex eb:shrink-0 eb:flex-col eb:gap-2 eb:border-b eb:border-border eb:p-3">
        {onCreate && (
          <Button className="eb:w-full" onClick={() => onCreate(null)}>
            <FilePlus2 />
            {t('New template')}
          </Button>
        )}
        <label className="eb:relative eb:block">
          <span className="eb:sr-only">{t('Search templates')}</span>
          <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search templates')}
            className="eb:h-8 eb:w-full eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:pr-14 eb:pl-8 eb:text-[13px] eb:text-foreground eb:outline-none eb:placeholder:text-foreground-muted eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50"
          />
          <kbd className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:right-2 eb:-translate-y-1/2 eb:rounded eb:border eb:border-border eb:bg-surface-75 eb:px-1 eb:font-mono eb:text-[10px] eb:text-foreground-muted">
            Ctrl K
          </kbd>
        </label>
      </div>
      <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:p-2">
        {canList && (
          <section aria-labelledby="eb-library-mine" className="eb:mb-4">
            <SectionLabel id="eb-library-mine" className="eb:block eb:px-2 eb:pt-2 eb:pb-1.5">
              {t('My templates')} ({items.list.length})
            </SectionLabel>
            {items.status === 'loading' ? (
              <p className="eb:flex eb:items-center eb:gap-2 eb:px-2 eb:py-3 eb:text-[12px] eb:text-foreground-muted">
                <Loader2 className="eb:size-3.5 eb:animate-spin" />
                {t('Loading…')}
              </p>
            ) : items.status === 'error' ? (
              <div className="eb:px-2 eb:py-2 eb:text-[12px] eb:text-destructive">
                <p className="eb:m-0">{t('Could not load the templates.')}</p>
                <p className="eb:m-0 eb:mt-0.5 eb:text-foreground-muted">{items.error}</p>
                <Button variant="outline" size="sm-compact" className="eb:mt-2" onClick={reload}>
                  <RefreshCw />
                  {t('Retry')}
                </Button>
              </div>
            ) : mine.length === 0 ? (
              <p className="eb:px-2 eb:py-2 eb:text-[12px] eb:text-foreground-muted">
                {query ? t('Nothing matches “{query}”.', { query }) : t('No template yet.')}
              </p>
            ) : (
              <ul className="eb:m-0 eb:flex eb:list-none eb:flex-col eb:gap-1 eb:p-0" data-testid="eb-library-templates">
                {mine.map((item) => (
                  <ListItem
                    key={item.id}
                    testId="eb-library-template"
                    selected={selection?.kind === 'template' && String(selection.id) === String(item.id)}
                    onSelect={() => select({ kind: 'template', id: item.id })}
                    title={item.name}
                    code={`#${item.id}`}
                    subtitle={item.subject || t('No subject')}
                    date={formatDate(item.updatedAt || item.createdAt)}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
        {bases.length > 0 && (
          <section aria-labelledby="eb-library-bases">
            <SectionLabel id="eb-library-bases" className="eb:block eb:px-2 eb:pt-2 eb:pb-1.5">
              {t('Bases')} ({bases.length})
            </SectionLabel>
            {shownBases.length === 0 ? (
              <p className="eb:px-2 eb:py-2 eb:text-[12px] eb:text-foreground-muted">{t('Nothing matches “{query}”.', { query })}</p>
            ) : (
              <ul className="eb:m-0 eb:flex eb:list-none eb:flex-col eb:gap-1 eb:p-0" data-testid="eb-library-bases">
                {shownBases.map((entry) => (
                  <ListItem
                    key={entry.id}
                    testId="eb-library-base"
                    selected={selection?.kind === 'base' && selection.id === entry.id}
                    onSelect={() => select({ kind: 'base', id: entry.id })}
                    title={entry.name}
                    code={`base_${entry.id}`}
                    subtitle={entry.description}
                    badge={<Pill>{t('Base')}</Pill>}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );

  const template = detail.template;
  const detailsBody = base ? (
    <>
      <h3 className="eb:m-0 eb:text-[17px] eb:font-semibold eb:text-foreground">{base.name}</h3>
      <p className="eb:m-0 eb:mt-1 eb:font-mono eb:text-[12px] eb:text-foreground-muted">base_{base.id}</p>
      <p className="eb:m-0 eb:mt-2 eb:text-[13px] eb:leading-relaxed eb:text-foreground-lighter">{base.description}</p>
      <dl className="eb:m-0 eb:mt-4">
        <MetaRow label={t('Type')}>{t('Base')}</MetaRow>
        <MetaRow label={t('Subject')}>{base.subject || '—'}</MetaRow>
        <MetaRow label={t('Preview text')}>{base.preheader || '—'}</MetaRow>
      </dl>
      <p className="eb:m-0 eb:mt-4 eb:rounded-lg2 eb:border eb:border-border eb:bg-surface-75 eb:px-3 eb:py-2.5 eb:text-[12px] eb:text-foreground-lighter">
        {t('Base — not editable: start from it to create your template.')}
      </p>
    </>
  ) : selection?.kind === 'template' ? (
    detail.status === 'error' ? (
      <p className="eb:m-0 eb:flex eb:items-start eb:gap-2 eb:text-[13px] eb:text-destructive">
        <AlertCircle className="eb:mt-0.5 eb:size-4 eb:shrink-0" />
        {detail.error}
      </p>
    ) : (
      <>
        <h3 className="eb:m-0 eb:text-[17px] eb:font-semibold eb:text-foreground">{template?.name ?? summary?.name ?? ''}</h3>
        <p className="eb:m-0 eb:mt-1 eb:font-mono eb:text-[12px] eb:text-foreground-muted">#{selection.id}</p>
        {(template?.description || summary?.description) && (
          <p className="eb:m-0 eb:mt-2 eb:text-[13px] eb:leading-relaxed eb:text-foreground-lighter">
            {template?.description || summary?.description}
          </p>
        )}
        <dl className="eb:m-0 eb:mt-4">
          <MetaRow label={t('Subject')}>{(template ?? summary)?.subject || '—'}</MetaRow>
          <MetaRow label={t('Preview text')}>{(template ?? summary)?.preheader || '—'}</MetaRow>
          <MetaRow label={t('Created')}>
            {formatDate((template ?? summary)?.createdAt) || '—'}
            {(template ?? summary)?.createdBy ? ` · ${(template ?? summary).createdBy}` : ''}
          </MetaRow>
          <MetaRow label={t('Updated')}>{formatDate((template ?? summary)?.updatedAt) || '—'}</MetaRow>
        </dl>
      </>
    )
  ) : (
    <div className="eb:flex eb:h-full eb:flex-col eb:items-center eb:justify-center eb:gap-3 eb:text-center eb:text-[13px] eb:text-foreground-muted">
      <span className="eb:grid eb:size-12 eb:place-items-center eb:rounded-xl eb:bg-accent eb:text-primary">
        <Mail className="eb:size-5" />
      </span>
      {t('Select a template to see its details.')}
    </div>
  );

  const actions = base ? (
    onCreate && (
      <Button
        className="eb:w-full"
        onClick={() =>
          onCreate({ baseId: base.id, mjml: base.mjml, meta: { subject: base.subject, preheader: base.preheader } })
        }
      >
        <FilePlus2 />
        {t('Start from this base')}
      </Button>
    )
  ) : template ? (
    <>
      {onEdit && (
        <Button className="eb:w-full" onClick={() => onEdit(template)}>
          <PencilLine />
          {t('Edit')}
        </Button>
      )}
      <div className="eb:flex eb:flex-wrap eb:gap-2">
        <Button variant="outline" className="eb:flex-1" disabled={!!busy} onClick={() => duplicate(template)}>
          {busy === 'duplicate' ? <Loader2 className="eb:animate-spin" /> : <Copy />}
          {t('Duplicate')}
        </Button>
        {template.html && (
          <>
            <Button variant="outline" className="eb:flex-1" onClick={() => copyHtml(template.html)}>
              <Copy />
              {t('Copy HTML')}
            </Button>
            <Button variant="outline" className="eb:flex-1" onClick={() => download(template.name, template.html)}>
              <Download />
              {t('Download')}
            </Button>
          </>
        )}
        {typeof storage.remove === 'function' && (
          <Button
            variant="ghost"
            size="icon"
            className="eb:text-foreground-muted eb:hover:bg-destructive/10 eb:hover:text-destructive"
            disabled={!!busy}
            onClick={() => remove(template)}
            aria-label={t('Delete')}
            title={t('Delete')}
          >
            {busy === 'delete' ? <Loader2 className="eb:animate-spin" /> : <Trash2 />}
          </Button>
        )}
      </div>
    </>
  ) : null;

  const previewPane = selection ? (
    <EmailPreview html={preview.html} loading={preview.loading} error={preview.error} device={device} onDeviceChange={setDevice} />
  ) : null;

  const detailsColumn = (
    <div key="details" className="eb:flex eb:min-h-0 eb:flex-col eb:border-border eb:bg-background" data-testid="eb-library-details">
      {layout === 'narrow' && (
        <div className="eb:shrink-0 eb:border-b eb:border-border eb:px-2 eb:py-1.5">
          <Button variant="ghost" size="sm-compact" onClick={() => setDetailsOpen(false)}>
            <ArrowLeft />
            {t('All templates')}
          </Button>
        </div>
      )}
      <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:p-4">
        {detailsBody}
        {layout !== 'wide' && previewPane && <div className="eb:mt-5 eb:h-[560px]">{previewPane}</div>}
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
      <header className="eb:flex eb:shrink-0 eb:items-center eb:gap-3 eb:border-b eb:border-border eb:px-4 eb:py-3">
        <span className="eb:grid eb:size-10 eb:shrink-0 eb:place-items-center eb:rounded-xl eb:bg-accent eb:text-primary">
          <LayoutTemplate className="eb:size-5" />
        </span>
        <div className="eb:min-w-0 eb:flex-1">
          <h2 className="eb:m-0 eb:truncate eb:text-[16px] eb:font-semibold eb:text-foreground">
            {title ?? t('Email template library')}
          </h2>
          <p className="eb:m-0 eb:truncate eb:text-[12.5px] eb:text-foreground-muted">
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
        <div className="eb:grid eb:min-h-0 eb:flex-1 eb:grid-cols-[minmax(0,1fr)]">{detailsOpen && selection ? detailsColumn : listColumn}</div>
      ) : (
        <div
          className={cn(
            'eb:grid eb:min-h-0 eb:flex-1 eb:divide-x eb:divide-border',
            layout === 'wide'
              ? 'eb:grid-cols-[300px_minmax(0,1fr)_minmax(0,1.2fr)]'
              : 'eb:grid-cols-[260px_minmax(0,1fr)]'
          )}
        >
          {listColumn}
          {detailsColumn}
          {layout === 'wide' && (
            <div className="eb:flex eb:min-h-0 eb:flex-col eb:bg-surface-75/40 eb:p-3" data-testid="eb-library-preview">
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
