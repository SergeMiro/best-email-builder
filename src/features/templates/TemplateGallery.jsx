import { useEffect, useMemo, useState } from 'react';
import { LayoutTemplate } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { withThumbnailImages } from './gallery.js';

/**
 * TEMPLATE GALLERY — toolbar button and dialog.
 *
 * Each card shows the template as it renders: its MJML compiled by the canvas
 * compiler (`editor.exportHtml(mjml)`), displayed in an iframe with an EMPTY
 * sandbox and scaled down. Picking one REPLACES the email in the editor —
 * after confirmation when there are unsaved changes — and fills the subject
 * and preview text only when they are empty: what the user typed stays.
 *
 * A saved template that gets a new content counts as modified: it is the
 * next save that keeps it.
 */

const THUMBNAIL_SCALE = 0.38;
const EMAIL_WIDTH = 600;

function Thumbnail({ html, title }) {
  return (
    <div
      className="eb:relative eb:h-[220px] eb:overflow-hidden eb:rounded-md eb:border eb:border-border eb:bg-surface-75"
      aria-hidden="true"
    >
      <iframe
        title={title}
        sandbox=""
        srcDoc={html}
        tabIndex={-1}
        loading="lazy"
        className="eb:pointer-events-none eb:absolute eb:top-0 eb:left-1/2 eb:origin-top eb:border-0"
        style={{
          width: EMAIL_WIDTH,
          height: 220 / THUMBNAIL_SCALE,
          transform: `translateX(-50%) scale(${THUMBNAIL_SCALE})`,
        }}
      />
    </div>
  );
}

export default function TemplateGalleryButton({ context }) {
  const { editor, ready, templates, isDirty, markDirty, template, setMeta } = context;
  const { t, confirm, notify } = useUi();
  const [open, setOpen] = useState(false);

  // Thumbnails compiled when the dialog opens (MJML compiles asynchronously).
  const [rendered, setRendered] = useState({});
  useEffect(() => {
    if (!open || !ready) return undefined;
    let alive = true;
    Promise.all(
      templates.map(async (entry) => {
        try {
          return [entry.id, (await editor.exportHtml(withThumbnailImages(entry.mjml))).html];
        } catch {
          return [entry.id, ''];
        }
      })
    ).then((pairs) => {
      if (alive) setRendered(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [open, ready, templates, editor]);
  const cards = useMemo(
    () => (open ? templates.map((entry) => ({ ...entry, html: rendered[entry.id] ?? '' })) : []),
    [open, templates, rendered]
  );

  const apply = async (entry) => {
    if (isDirty()) {
      setOpen(false);
      const ok = await confirm({
        title: t('Replace the current email?'),
        description: t('Unsaved changes will be replaced.'),
        confirmLabel: t('Replace'),
        destructive: true,
      });
      if (!ok) return;
    }
    editor.loadMjml(entry.mjml);
    setMeta((meta) => ({
      ...meta,
      subject: meta.subject || entry.subject,
      preheader: meta.preheader || entry.preheader,
    }));
    if (template.id) markDirty();
    setOpen(false);
    notify('success', t('“{name}” template applied.', { name: entry.name }));
  };

  return (
    <>
      <Button variant="outline" size="sm-compact" disabled={!ready} onClick={() => setOpen(true)}>
        <LayoutTemplate />
        {t('Templates')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="eb:max-h-[calc(100dvh-2rem)] eb:overflow-y-auto eb:sm:max-w-4xl" data-testid="eb-template-gallery">
          <DialogHeader>
            <DialogTitle>{t('Start from a template')}</DialogTitle>
            <DialogDescription>{t('Picking a template replaces the email being edited.')}</DialogDescription>
          </DialogHeader>
          <ul className="eb:grid eb:grid-cols-1 eb:gap-3 eb:sm:grid-cols-2 eb:md:grid-cols-3">
            {cards.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  onClick={() => apply(card)}
                  data-template-id={card.id}
                  className="eb:group eb:flex eb:w-full eb:flex-col eb:gap-2 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:p-2 eb:text-left eb:transition-colors eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:focus-visible:outline-none eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50"
                >
                  <Thumbnail html={card.html} title={card.name} />
                  <span className="eb:px-1">
                    <span className="eb:block eb:text-[13px] eb:font-medium eb:text-foreground">{card.name}</span>
                    <span className="eb:block eb:text-[12px] eb:text-foreground-muted">{card.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
