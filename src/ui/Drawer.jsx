import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from './primitives/button.jsx';
import { cn } from './primitives/cn.js';
import { useT } from './context.jsx';

/**
 * Side drawer of the compact layouts: the blocks or the properties slide over
 * the canvas instead of squeezing it.
 *
 * Rendered INSIDE the builder (not in a portal): it covers the editing area
 * only, the toolbar stays usable. A tap on the shaded canvas or Escape closes
 * it. `header={false}` when the content has its own header with a close
 * button (the properties panel). While closed it stays mounted but hidden (`hidden`), so a panel keeps
 * its scroll position and its fields their drafts.
 */
export default function Drawer({ open, side = 'left', title, onClose, children, testId, header = true }) {
  const t = useT();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={cn('eb:absolute eb:inset-0 eb:z-20', !open && 'eb:hidden')} data-testid={testId} data-open={open ? 'true' : 'false'}>
      <div className="eb:absolute eb:inset-0 eb:bg-black/30" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-label={title}
        className={cn(
          'eb:absolute eb:inset-y-0 eb:flex eb:w-[min(340px,88%)] eb:flex-col eb:bg-background eb:shadow-lg',
          side === 'left' ? 'eb:left-0 eb:border-r eb:border-border' : 'eb:right-0 eb:border-l eb:border-border'
        )}
      >
        {header && (
          <header className="eb:flex eb:h-10 eb:shrink-0 eb:items-center eb:justify-between eb:border-b eb:border-border eb:px-3">
            <h3 className="eb:text-[13px] eb:font-medium eb:text-foreground">{title}</h3>
            <Button variant="ghost" size="icon-sm-compact" onClick={onClose} aria-label={t('Close')}>
              <X />
            </Button>
          </header>
        )}
        <div className="eb:grid eb:min-h-0 eb:flex-1">{children}</div>
      </section>
    </div>
  );
}
