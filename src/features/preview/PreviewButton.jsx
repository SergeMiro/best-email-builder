import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Info, Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { EMAIL_MOBILE_WIDTH } from '../../core/constants.js';
import { FRAME_SCROLLBAR_CSS } from '../../core/scrollbars.js';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { SectionLabel, Tabs, TabsList, TabsTrigger } from '../../ui/primitives/misc.jsx';
import { cn } from '../../ui/primitives/cn.js';

/**
 * PREVIEW of the FINAL email — rendered by the server, as it will be stored.
 *
 * The canvas already compiles in the browser; the preview goes through the
 * server compilation (the only one that counts), with sample values for the
 * variables, and lists the quality checks (unsubscribe link, alt texts, links,
 * Gmail clipping size) and the MJML warnings.
 *
 * The HTML is shown in an iframe with an EMPTY sandbox: no script, form,
 * navigation, nor same origin. An email is a complete HTML document: injected
 * into the page it would inherit the application's styles and lie.
 */

const LEVEL_ICON = { warning: AlertTriangle, info: Info };

export function QualityList({ quality = [], warnings = [] }) {
  const { t } = useUi();
  if (!quality.length && !warnings.length) {
    return (
      <p className="eb:flex eb:items-center eb:gap-1.5 eb:text-[12px] eb:text-foreground-lighter">
        <CheckCircle2 className="eb:size-3.5 eb:text-success" aria-hidden="true" />
        {t('Nothing to fix.')}
      </p>
    );
  }
  return (
    <ul className="eb:space-y-1.5" aria-label={t('Points to check')}>
      {quality.map((issue) => {
        const Icon = LEVEL_ICON[issue.level] || Info;
        return (
          <li key={issue.code} className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-foreground">
            <Icon
              className={cn(
                'eb:mt-0.5 eb:size-3.5 eb:shrink-0',
                issue.level === 'warning' ? 'eb:text-warning' : 'eb:text-foreground-muted'
              )}
              aria-hidden="true"
            />
            {issue.message}
          </li>
        );
      })}
      {warnings.slice(0, 5).map((w, i) => (
        <li key={`mjml-${i}`} className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-foreground-lighter">
          <Info className="eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-foreground-muted" aria-hidden="true" />
          MJML: {w.message}
        </li>
      ))}
    </ul>
  );
}

/** The builder's thin scrollbars inside the frame (see `core/scrollbars.js`). */
const PREVIEW_SCROLLBAR_CSS = `<style data-preview-scrollbar>${FRAME_SCROLLBAR_CSS}</style>`;

const withPreviewScrollbars = (html) =>
  !html ? '' : /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${PREVIEW_SCROLLBAR_CSS}</head>`) : PREVIEW_SCROLLBAR_CSS + html;

/** Sandboxed preview frame, desktop or mobile width. */
export function EmailPreview({ html, loading = false, error = null, device = 'desktop', onDeviceChange, onRefresh, hint = true }) {
  const { t } = useUi();
  const isMobile = device === 'mobile';
  // `srcDoc`, not a blob URL: nothing to revoke when the HTML changes.
  const srcDoc = useMemo(() => withPreviewScrollbars(html), [html]);

  return (
    <div className="eb:flex eb:h-full eb:min-h-0 eb:flex-col">
      <div className="eb:mb-2 eb:flex eb:shrink-0 eb:items-center eb:justify-between eb:gap-2">
        {/* The same switch as the editor's toolbar. */}
        <Tabs value={device} onValueChange={(value) => onDeviceChange?.(value)}>
          <TabsList aria-label={t('Device')}>
            <TabsTrigger value="desktop">
              <Monitor />
              {t('Desktop')}
            </TabsTrigger>
            <TabsTrigger value="mobile">
              <Smartphone />
              {t('Mobile')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {onRefresh && (
          <Button variant="outline" size="sm-compact" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="eb:animate-spin" /> : <RefreshCw />}
            {t('Refresh')}
          </Button>
        )}
      </div>

      <div className="eb:min-h-0 eb:flex-1 eb:overflow-auto eb:rounded-lg2 eb:border eb:border-border eb:bg-surface-75 eb:p-3">
        {error ? (
          <div className="eb:flex eb:h-full eb:items-center eb:justify-center eb:p-6 eb:text-center eb:text-[13px] eb:text-destructive">{error}</div>
        ) : !srcDoc ? (
          <div className="eb:flex eb:h-full eb:items-center eb:justify-center eb:p-6 eb:text-center eb:text-[13px] eb:text-foreground-lighter">
            {loading ? t('Rendering…') : t('Nothing to show yet.')}
          </div>
        ) : (
          // Narrows and widens like the editor's canvas (width .35s ease).
          <div
            className={cn(
              'eb:mx-auto eb:max-w-full eb:bg-white eb:transition-[width,box-shadow] eb:duration-[350ms] eb:ease-in-out eb:motion-reduce:transition-none',
              isMobile && 'eb:shadow-sm'
            )}
            style={{ width: isMobile ? EMAIL_MOBILE_WIDTH : '100%' }}
            data-device={device}
          >
            <iframe
              sandbox=""
              srcDoc={srcDoc}
              title={t('Email preview')}
              className="eb:block eb:w-full eb:border-0 eb:bg-white eb:transition-[height] eb:duration-[350ms] eb:ease-in-out eb:motion-reduce:transition-none"
              style={{ height: isMobile ? 760 : 900 }}
            />
          </div>
        )}
      </div>

      {hint && (
        <p className="eb:mt-2 eb:shrink-0 eb:text-[11px] eb:leading-relaxed eb:text-foreground-lighter">
          {t('Indicative preview — check it with “Send test”.')}
        </p>
      )}
    </div>
  );
}

export default function PreviewButton({ context }) {
  const { editor, ready, meta, storage } = context;
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [state, setState] = useState({ loading: false, html: '', subject: null, preheader: null, warnings: [], quality: [], error: null });

  const refresh = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await storage.render({ mjml: editor.exportMjml(), subject: meta.subject, preheader: meta.preheader });
      setState({
        loading: false,
        html: data.html,
        // Subject and preview text with their variables filled, when the backend returns them.
        subject: data.subject ?? null,
        preheader: data.preheader ?? null,
        warnings: data.warnings || [],
        quality: data.quality || [],
        error: null,
      });
    } catch (error) {
      setState({ loading: false, html: '', subject: null, preheader: null, warnings: [], quality: [], error: error.message });
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm-compact"
        disabled={!ready}
        onClick={() => {
          setOpen(true);
          refresh();
        }}
      >
        <Eye />
        {t('Preview')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="eb:flex eb:h-[85vh] eb:max-h-[85vh] eb:flex-col eb:gap-4 eb:sm:max-w-[67.2rem]">
          <DialogHeader>
            <div className="eb:flex eb:items-center eb:gap-3">
              <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
                <Eye className="eb:size-5" />
              </span>
              <div>
                <DialogTitle className="eb:text-base eb:font-normal">{t('Email preview')}</DialogTitle>
                <DialogDescription className="eb:text-[13px]">{t('Final rendering, variables filled with samples.')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="eb:grid eb:min-h-0 eb:flex-1 eb:grid-cols-1 eb:gap-4 eb:md:grid-cols-[minmax(0,1fr)_260px]">
            <EmailPreview
              html={state.html}
              loading={state.loading}
              error={state.error}
              device={device}
              onDeviceChange={setDevice}
              onRefresh={refresh}
              // The reminder points to "Send test": only when it exists.
              hint={typeof storage.sendTest === 'function'}
            />
            <aside className="eb:min-h-0 eb:space-y-5 eb:overflow-y-auto" aria-busy={state.loading}>
              <section className="eb:space-y-2">
                <SectionLabel>{t('Inbox')}</SectionLabel>
                <div className="eb:rounded-lg2 eb:border eb:border-border eb:bg-surface-75 eb:px-3 eb:py-2.5">
                  <p className="eb:text-[13px] eb:font-medium eb:text-foreground">{(state.subject ?? meta.subject) || t('No subject')}</p>
                  <p className="eb:text-[12px] eb:text-foreground-muted">{(state.preheader ?? meta.preheader) || t('No preview text')}</p>
                </div>
              </section>
              <section className="eb:space-y-2">
                <SectionLabel>{t('To check')}</SectionLabel>
                {!state.loading && !state.error && <QualityList quality={state.quality} warnings={state.warnings} />}
              </section>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
