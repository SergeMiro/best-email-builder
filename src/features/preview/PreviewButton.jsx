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

/** Sandboxed preview frame, desktop or mobile width. */
export function EmailPreview({ html, loading = false, error = null, device = 'desktop', onDeviceChange, onRefresh, hint = true }) {
  const { t } = useUi();
  const isMobile = device === 'mobile';
  // `srcDoc`, not a blob URL: nothing to revoke when the HTML changes.
  const srcDoc = useMemo(() => html || '', [html]);

  return (
    <div className="eb:flex eb:h-full eb:min-h-0 eb:flex-col">
      <div className="eb:mb-2 eb:flex eb:shrink-0 eb:items-center eb:justify-between eb:gap-2">
        <div className="eb:inline-flex eb:rounded-lg2 eb:border eb:border-border-strong eb:bg-surface-75 eb:p-0.5">
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
          <div
            className={cn('eb:mx-auto eb:bg-white', isMobile && 'eb:shadow-sm')}
            style={isMobile ? { width: EMAIL_MOBILE_WIDTH } : undefined}
          >
            <iframe
              sandbox=""
              srcDoc={srcDoc}
              title={t('Email preview')}
              className="eb:block eb:w-full eb:border-0 eb:bg-white"
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
