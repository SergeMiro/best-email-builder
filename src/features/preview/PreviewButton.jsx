import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, Info, Loader2, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { EMAIL_MOBILE_WIDTH } from '../../core/constants.js';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { SectionLabel } from '../../ui/primitives/misc.jsx';
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
      <p className="mb:flex mb:items-center mb:gap-1.5 mb:text-[12px] mb:text-foreground-lighter">
        <CheckCircle2 className="mb:size-3.5 mb:text-success" aria-hidden="true" />
        {t('Nothing to fix.')}
      </p>
    );
  }
  return (
    <ul className="mb:space-y-1.5" aria-label={t('Points to check')}>
      {quality.map((issue) => {
        const Icon = LEVEL_ICON[issue.level] || Info;
        return (
          <li key={issue.code} className="mb:flex mb:items-start mb:gap-1.5 mb:text-[12px] mb:text-foreground">
            <Icon
              className={cn(
                'mb:mt-0.5 mb:size-3.5 mb:shrink-0',
                issue.level === 'warning' ? 'mb:text-warning' : 'mb:text-foreground-muted'
              )}
              aria-hidden="true"
            />
            {issue.message}
          </li>
        );
      })}
      {warnings.slice(0, 5).map((w, i) => (
        <li key={`mjml-${i}`} className="mb:flex mb:items-start mb:gap-1.5 mb:text-[12px] mb:text-foreground-lighter">
          <Info className="mb:mt-0.5 mb:size-3.5 mb:shrink-0 mb:text-foreground-muted" aria-hidden="true" />
          MJML: {w.message}
        </li>
      ))}
    </ul>
  );
}

/** Sandboxed preview frame, desktop or mobile width. */
export function EmailPreview({ html, loading = false, error = null, device = 'desktop', onDeviceChange, onRefresh }) {
  const { t } = useUi();
  const isMobile = device === 'mobile';
  // `srcDoc`, not a blob URL: nothing to revoke when the HTML changes.
  const srcDoc = useMemo(() => html || '', [html]);

  return (
    <div className="mb:flex mb:h-full mb:min-h-0 mb:flex-col">
      <div className="mb-2 mb:flex mb:shrink-0 mb:items-center mb:justify-between mb:gap-2">
        <div className="mb:inline-flex mb:rounded-lg2 mb:border mb:border-border-strong mb:bg-surface-75 mb:p-0.5">
          <Button
            variant={isMobile ? 'ghost' : 'secondary'}
            size="sm-compact"
            onClick={() => onDeviceChange?.('desktop')}
            aria-pressed={!isMobile}
          >
            <Monitor />
            {t('Desktop')}
          </Button>
          <Button
            variant={isMobile ? 'secondary' : 'ghost'}
            size="sm-compact"
            onClick={() => onDeviceChange?.('mobile')}
            aria-pressed={isMobile}
          >
            <Smartphone />
            {t('Mobile')}
          </Button>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm-compact" onClick={onRefresh} disabled={loading}>
            {loading ? <Loader2 className="mb:animate-spin" /> : <RefreshCw />}
            {t('Refresh')}
          </Button>
        )}
      </div>

      <div className="mb:min-h-0 mb:flex-1 mb:overflow-auto mb:rounded-lg2 mb:border mb:border-border mb:bg-surface-75 mb:p-3">
        {error ? (
          <div className="mb:flex mb:h-full mb:items-center mb:justify-center mb:p-6 mb:text-center mb:text-[13px] mb:text-destructive">{error}</div>
        ) : !srcDoc ? (
          <div className="mb:flex mb:h-full mb:items-center mb:justify-center mb:p-6 mb:text-center mb:text-[13px] mb:text-foreground-lighter">
            {loading ? t('Rendering…') : t('Nothing to show yet.')}
          </div>
        ) : (
          <div
            className={cn('mb:mx-auto mb:bg-white', isMobile && 'mb:shadow-sm')}
            style={isMobile ? { width: EMAIL_MOBILE_WIDTH } : undefined}
          >
            <iframe
              sandbox=""
              srcDoc={srcDoc}
              title={t('Email preview')}
              className="mb:block mb:w-full mb:border-0 mb:bg-white"
              style={{ height: isMobile ? 760 : 900 }}
            />
          </div>
        )}
      </div>

      <p className="mb:mt-2 mb:shrink-0 mb:text-[11px] mb:leading-relaxed mb:text-foreground-lighter">
        {t('Indicative preview — check it with “Send test”.')}
      </p>
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
        <DialogContent className="mb:flex mb:h-[85vh] mb:max-h-[85vh] mb:flex-col mb:gap-4 mb:sm:max-w-[67.2rem]">
          <DialogHeader>
            <div className="mb:flex mb:items-center mb:gap-3">
              <span className="mb:flex mb:size-10 mb:shrink-0 mb:items-center mb:justify-center mb:rounded-lg2 mb:bg-primary/10 mb:text-primary">
                <Eye className="mb:size-5" />
              </span>
              <div>
                <DialogTitle className="mb:text-base mb:font-normal">{t('Email preview')}</DialogTitle>
                <DialogDescription className="mb:text-[13px]">{t('Final rendering, variables filled with samples.')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mb:grid mb:min-h-0 mb:flex-1 mb:grid-cols-1 mb:gap-4 mb:md:grid-cols-[minmax(0,1fr)_260px]">
            <EmailPreview
              html={state.html}
              loading={state.loading}
              error={state.error}
              device={device}
              onDeviceChange={setDevice}
              onRefresh={refresh}
            />
            <aside className="mb:min-h-0 mb:space-y-5 mb:overflow-y-auto" aria-busy={state.loading}>
              <section className="mb:space-y-2">
                <SectionLabel>{t('Inbox')}</SectionLabel>
                <div className="mb:rounded-lg2 mb:border mb:border-border mb:bg-surface-75 mb:px-3 mb:py-2.5">
                  <p className="mb:text-[13px] mb:font-medium mb:text-foreground">{(state.subject ?? meta.subject) || t('No subject')}</p>
                  <p className="mb:text-[12px] mb:text-foreground-muted">{(state.preheader ?? meta.preheader) || t('No preview text')}</p>
                </div>
              </section>
              <section className="mb:space-y-2">
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
