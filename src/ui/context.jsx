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
    <div className="eb:pointer-events-none eb:absolute eb:right-3 eb:bottom-3 eb:z-40 eb:flex eb:w-80 eb:max-w-[calc(100%-1.5rem)] eb:flex-col eb:gap-2">
      {notices.map((notice) => {
        const Icon = NOTICE_ICON[notice.level] || Info;
        return (
          <div
            key={notice.id}
            role={notice.level === 'error' ? 'alert' : 'status'}
            data-level={notice.level}
            className="eb:pointer-events-auto eb:flex eb:items-start eb:gap-2 eb:rounded-lg2 eb:border eb:border-border eb:bg-popover eb:px-3 eb:py-2.5 eb:text-[13px] eb:text-popover-foreground eb:shadow-lg"
          >
            <Icon
              aria-hidden="true"
              className={cn(
                'eb:mt-0.5 eb:size-4 eb:shrink-0',
                notice.level === 'error' && 'eb:text-destructive',
                notice.level === 'warning' && 'eb:text-warning',
                notice.level === 'success' && 'eb:text-success',
                notice.level === 'info' && 'eb:text-foreground-muted'
              )}
            />
            <p className="eb:min-w-0 eb:flex-1">{notice.message}</p>
            <button
              type="button"
              aria-label={t('Dismiss')}
              className="eb:shrink-0 eb:rounded-sm eb:text-foreground-muted eb:hover:text-foreground"
              onClick={() => onDismiss(notice.id)}
            >
              <X className="eb:size-3.5" />
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
      // The same message again replaces the one shown (three rewrites in a
      // row: one notice, not a pile). Clearing a timer twice is harmless.
      setNotices((list) => {
        const same = list.filter((n) => n.level === level && n.message === message);
        for (const notice of same) {
          clearTimeout(timers.current.get(notice.id));
          timers.current.delete(notice.id);
        }
        return [...list.filter((n) => !same.includes(n)).slice(-3), { id, level, message }];
      });
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
            <div className="eb:flex eb:items-center eb:gap-3">
              <span
                className={cn(
                  'eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2',
                  options.destructive ? 'eb:bg-destructive/10 eb:text-destructive' : 'eb:bg-primary/10 eb:text-primary'
                )}
              >
                <AlertCircle className="eb:size-5" />
              </span>
              <AlertDialogTitle className="eb:text-base">{options.title || t('Confirm')}</AlertDialogTitle>
            </div>
            {options.description && (
              <AlertDialogDescription className="eb:text-[13px] eb:leading-relaxed">{options.description}</AlertDialogDescription>
            )}
            <div className="eb:flex eb:flex-col-reverse eb:gap-2 eb:sm:flex-row eb:sm:justify-end">
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
