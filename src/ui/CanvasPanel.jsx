import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useUi } from './context.jsx';
import { cn } from './primitives/cn.js';
import { Button } from './primitives/button.jsx';

/**
 * The panel of a feature beside the canvas (emojis, variables), opened by its
 * button at the end of the ribbon: between the email and the properties. It
 * slides open and shut; in the compact layouts, it covers the right of the
 * canvas instead of narrowing it.
 *
 * @param {{
 *   feature: import('../core/EmailEditor.js').EmailBuilderFeature|null,
 *   context: any,
 *   compact: boolean,
 *   onClose: () => void,
 * }} props
 */
export default function CanvasPanel({ feature, context, compact, onClose }) {
  const { t } = useUi();
  const open = Boolean(feature);
  // What it shows while it slides shut.
  const [last, setLast] = useState(feature);
  if (feature && feature !== last) setLast(feature);
  // Opened at zero width, then widened: the width slides.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!open) {
      setWide(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setWide(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  // Shut, nothing in it takes the focus (set by hand: React 18 and 19 disagree on `inert`).
  const ref = useRef(/** @type {HTMLDivElement|null} */ (null));
  useEffect(() => {
    ref.current?.toggleAttribute('inert', !open);
  });

  const shown = feature || last;
  if (!shown?.drawer) return null;
  // Named as its button: its title is the button's tooltip.
  const { icon: Icon, label, panel: Panel } = shown.drawer;
  const name = t(label);

  return (
    <div
      ref={ref}
      className={cn(
        'eb:h-full eb:shrink-0 eb:overflow-hidden eb:transition-[width] eb:duration-200 eb:ease-out eb:motion-reduce:transition-none',
        open && wide ? 'eb:w-64' : 'eb:w-0',
        compact && 'eb:absolute eb:inset-y-0 eb:right-0 eb:z-20 eb:shadow-lg'
      )}
      onTransitionEnd={(event) => event.target === event.currentTarget && !open && setLast(null)}
    >
      <aside
        id={`eb-drawer-${shown.id}`}
        aria-label={name}
        data-testid={`eb-panel-${shown.id}`}
        className="eb:flex eb:h-full eb:w-64 eb:flex-col eb:border-l eb:border-border eb:bg-background"
      >
        <header className="eb:flex eb:h-10 eb:shrink-0 eb:items-center eb:gap-2 eb:pr-1.5 eb:pl-3">
          {Icon && <Icon className="eb:size-3.5 eb:shrink-0 eb:text-foreground-muted" aria-hidden="true" />}
          <h3 className="eb:min-w-0 eb:flex-1 eb:truncate eb:text-[12px] eb:font-medium eb:text-foreground">{name}</h3>
          <Button variant="ghost" size="icon-sm-compact" onClick={onClose} aria-label={t('Close the panel')}>
            <X />
          </Button>
        </header>
        <Panel context={context} />
      </aside>
    </div>
  );
}
