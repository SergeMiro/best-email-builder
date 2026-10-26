import { Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BLOCK_GROUPS, BLOCK_ICONS } from './BlockSidebar.jsx';
import { SectionLabel } from './primitives/misc.jsx';
import { Popover, PopoverAnchor, PopoverContent } from './primitives/overlays.jsx';
import { cn } from './primitives/cn.js';
import { useT } from './context.jsx';

const TILE = cn(
  'eb:flex eb:h-16 eb:min-w-0 eb:flex-col eb:items-center eb:justify-center eb:gap-1 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:px-1 eb:text-center eb:transition-colors',
  'eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:focus-visible:outline-none eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50'
);

const LABEL = 'eb:line-clamp-2 eb:w-full eb:text-[11px] eb:leading-tight eb:break-words eb:text-foreground';

/**
 * The menu of the canvas's "+" (the editor's `add-menu` event), opened
 * beside it:
 *   - under the selected element: the blocks, as in the sidebar; the one
 *     picked goes after the element (at the end of a column);
 *   - after the last item of a row: what the row's block offers (a social
 *     block's networks). A row with a single choice (a menu's link) gets it
 *     at once, without a menu.
 * A pick, Esc, a click beside it or another selection closes it.
 */
export default function CanvasAddMenu({ editor, onAdded }) {
  const t = useT();
  // {kind, id, anchor} of the "+" pressed, and a row's `items`; null: closed.
  const [menu, setMenu] = useState(null);
  const added = useRef(onAdded);
  added.current = onAdded;

  useEffect(() => {
    const offs = [
      editor.on('add-menu', (request) => {
        let items = null;
        if (request.kind === 'item') {
          const row = editor.getElement(request.id);
          items = (row?.blockId && editor.getBlock(row.blockId)?.items) || null;
          if (!items) return;
          if (items.choices.length < 2) {
            setMenu(null);
            if (editor.addItem(items.choices[0] || null, request.id)) added.current?.();
            return;
          }
        }
        // The same "+" again: closed.
        setMenu((current) => (current && current.kind === request.kind && current.id === request.id ? null : { ...request, items }));
      }),
      editor.on('selection', () => setMenu(null)),
      editor.on('change', () => setMenu(null)),
      editor.on('destroy', () => setMenu(null)),
    ];
    return () => offs.forEach((off) => off());
  }, [editor]);

  const close = () => setMenu(null);
  const label = menu?.kind === 'item' ? t(menu.items.label) : t('Add a block');

  return (
    <Popover open={Boolean(menu)} onOpenChange={(open) => !open && close()}>
      {menu && (
        <PopoverAnchor asChild>
          <span
            aria-hidden="true"
            className="eb:pointer-events-none eb:fixed"
            style={{ top: menu.anchor.top, left: menu.anchor.left, width: menu.anchor.width, height: menu.anchor.height }}
          />
        </PopoverAnchor>
      )}
      {menu && (
        <PopoverContent
          side="bottom"
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          data-testid="eb-add-menu"
          // The menu itself takes the focus (Tab reaches its choices, Esc
          // closes it), not its first choice: opened with the mouse, that
          // one would look picked.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
          }}
          className={cn('eb:space-y-3 eb:p-3', menu.kind === 'item' ? 'eb:w-72' : 'eb:w-[25rem]')}
        >
          {menu.kind === 'item' ? (
            <ItemChoices
              label={label}
              choices={menu.items.choices}
              onPick={(choice) => {
                close();
                if (editor.addItem(choice, menu.id)) added.current?.();
              }}
            />
          ) : (
            <BlockChoices
              blocks={editor.listBlocks()}
              onPick={(blockId) => {
                close();
                if (editor.addBlock(blockId, { targetId: menu.id })) added.current?.(blockId);
              }}
            />
          )}
        </PopoverContent>
      )}
    </Popover>
  );
}

/** The blocks of the sidebar, by group. */
function BlockChoices({ blocks, onPick }) {
  const t = useT();
  return BLOCK_GROUPS.map((group) => {
    const items = blocks.filter((b) => b.kind === group.kind && b.mjml);
    if (!items.length) return null;
    return (
      <section key={group.kind} className="eb:space-y-1.5">
        <SectionLabel>{t(group.title)}</SectionLabel>
        <div className="eb:grid eb:grid-cols-4 eb:gap-1.5">
          {items.map((block) => {
            const Icon = BLOCK_ICONS[block.icon] || Square;
            return (
              <button key={block.id} type="button" data-block-id={block.id} className={TILE} onClick={() => onPick(block.id)}>
                <Icon className="eb:size-4 eb:text-foreground-lighter" aria-hidden="true" />
                <span className={LABEL}>{t(block.label)}</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  });
}

/** What a row offers: a social block's networks, with MJML's icon for each. */
function ItemChoices({ label, choices, onPick }) {
  const t = useT();
  return (
    <section className="eb:space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <div className="eb:grid eb:grid-cols-3 eb:gap-1.5">
        {choices.map((choice) => (
          <button key={choice.label} type="button" data-choice={choice.label} className={TILE} onClick={() => onPick(choice)}>
            {choice.image ? (
              <img src={choice.image} alt="" width={24} height={24} className="eb:size-6 eb:rounded-full" style={{ background: choice.color }} />
            ) : (
              <Square className="eb:size-4 eb:text-foreground-lighter" aria-hidden="true" />
            )}
            <span className={LABEL}>{t(choice.label)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
