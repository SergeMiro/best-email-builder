import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { identity, translatorFor } from '../i18n/index.js';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './primitives/overlays.jsx';
import { buttonVariants } from './primitives/button.jsx';
import { TooltipProvider } from './primitives/misc.jsx';
import { cn } from './primitives/cn.js';

/**
 * Interface services shared by every component of the builder:
 *
 *   t        translation (see src/i18n) ;
 *   locale   BCP 47 tag used for dates and times ;
 *   notify   short messages (`success`, `info`, `warning`, `error`) — shown by
 *            the builder itself, or handed to the host's own toaster through
 *            the `onNotify` prop ;
 *   confirm  asynchronous confirmation dialog → Promise<boolean>.
 */

/**
 * @typedef {'success'|'info'|'warning'|'error'} NotifyLevel
 * @typedef {{title?: string, description?: string, confirmLabel?: string,
 *            cancelLabel?: string, destructive?: boolean}} ConfirmOptions
 */

const NoticeContext = createContext({ notices: [], dismiss: () => {} });

const UiContext = createContext({
  t: identity,
  locale: 'en',
  /** @type {(level: NotifyLevel, message: string) => void} */
  notify: () => {},
  /** @type {(options: ConfirmOptions) => Promise<boolean>} */
  confirm: async () => false,
});

export const useUi = () => useContext(UiContext);
export const useT = () => useContext(UiContext).t;

const NOTICE_ICON = { success: CheckCircle2, info: Info, warning: TriangleAlert, error: AlertCircle };
const NOTICE_TTL = { success: 3500, info: 4000, warning: 6000, error: 7000 };

/** Where the builder's own notices appear (bottom-right of its root element). */
export function NoticeArea() {
  const t = useT();
  const { notices, dismiss: onDismiss } = useContext(NoticeContext);
  return (
    <div className="mb:pointer-events-none mb:absolute mb:right-3 mb:bottom-3 mb:z-40 mb:flex mb:w-80 mb:max-w-[calc(100%-1.5rem)] mb:flex-col mb:gap-2">
      {notices.map((notice) => {
        const Icon = NOTICE_ICON[notice.level] || Info;
        return (
          <div
            key={notice.id}
            role={notice.level === 'error' ? 'alert' : 'status'}
            data-level={notice.level}
            className="mb:pointer-events-auto mb:flex mb:items-start mb:gap-2 mb:rounded-lg2 mb:border mb:border-border mb:bg-popover mb:px-3 mb:py-2.5 mb:text-[13px] mb:text-popover-foreground mb:shadow-lg"
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'mb:mt-0.5 mb:size-4 mb:shrink-0',
                notice.level === 'error' && 'mb:text-destructive',
                notice.level === 'warning' && 'mb:text-warning',
                notice.level === 'success' && 'mb:text-success',
                notice.level === 'info' && 'mb:text-foreground-muted'
              )}
            />
            <p className="mb:min-w-0 mb:flex-1">{notice.message}</p>
            <button
              type="button"
              aria-label={t('Dismiss')}
              className="mb:shrink-0 mb:rounded-sm mb:text-foreground-muted mb:hover:text-foreground"
              onClick={() => onDismiss(notice.id)}
            >
              <X className="mb:size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @param {{
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   onNotify?: (level: NotifyLevel, message: string) => void,
 *   children: import('react').ReactNode,
 * }} props
 */
export function UiProvider({ locale = 'en', messages, onNotify, children }) {
  const t = useMemo(() => translatorFor(locale, messages), [locale, messages]);

  /* ── Notices ── */
  const [notices, setNotices] = useState([]);
  const timers = useRef(new Map());
  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setNotices((list) => list.filter((n) => n.id !== id));
  }, []);
  const hostNotify = useRef(onNotify);
  hostNotify.current = onNotify;
  const nextId = useRef(0);
  const notify = useCallback(
    (level, message) => {
      if (hostNotify.current) {
        hostNotify.current(level, message);
        return;
      }
      const id = (nextId.current += 1);
      setNotices((list) => [...list.slice(-3), { id, level, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), NOTICE_TTL[level] || 4000)
      );
    },
    [dismiss]
  );
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  /* ── Confirmation ── */
  const [request, setRequest] = useState(null);
  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        setRequest((current) => {
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    []
  );
  const settle = (result) => {
    request?.resolve(result);
    setRequest(null);
  };

  const value = useMemo(() => ({ t, locale, notify, confirm }), [t, locale, notify, confirm]);
  const noticeValue = useMemo(() => ({ notices, dismiss }), [notices, dismiss]);
  const options = request?.options || {};

  return (
    <UiContext.Provider value={value}>
      <TooltipProvider delayDuration={300}>
        <NoticeContext.Provider value={noticeValue}>{children}</NoticeContext.Provider>
        <AlertDialog open={Boolean(request)} onOpenChange={(open) => !open && settle(false)}>
          <AlertDialogContent>
            <div className="mb:flex mb:items-center mb:gap-3">
              <span
                className={cn(
                  'mb:flex mb:size-10 mb:shrink-0 mb:items-center mb:justify-center mb:rounded-lg2',
                  options.destructive ? 'mb:bg-destructive/10 mb:text-destructive' : 'mb:bg-primary/10 mb:text-primary'
                )}
              >
                <AlertCircle className="mb:size-5" />
              </span>
              <AlertDialogTitle className="mb:text-base">{options.title || t('Confirm')}</AlertDialogTitle>
            </div>
            {options.description && (
              <AlertDialogDescription className="mb:text-[13px] mb:leading-relaxed">{options.description}</AlertDialogDescription>
            )}
            <div className="mb:flex mb:flex-col-reverse mb:gap-2 mb:sm:flex-row mb:sm:justify-end">
              <AlertDialogCancel className={buttonVariants({ variant: 'outline' })} onClick={() => settle(false)}>
                {options.cancelLabel || t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: options.destructive ? 'destructive' : 'default' })}
                onClick={() => settle(true)}
              >
                {options.confirmLabel || t('Confirm')}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </UiContext.Provider>
  );
}
