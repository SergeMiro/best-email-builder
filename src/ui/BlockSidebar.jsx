import { SectionLabel } from './primitives/misc.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import {
  Columns2,
  Columns3,
  Image as ImageIcon,
  MoveVertical,
  RectangleHorizontal,
  SeparatorHorizontal,
  Square,
  Type,
} from 'lucide-react';
import { cn } from './primitives/cn.js';
import { useT } from './context.jsx';

/**
 * Block sidebar, left of the canvas.
 *
 * Two gestures for the same block:
 *   - CLICK: the editor inserts it at the logical place (inside the selected
 *     column, after the selected element, otherwise at the end of the email);
 *   - DRAG onto the canvas: the engine follows the pointer and rejects the
 *     drop targets MJML does not allow.
 *
 * Blocks come from the registry (`editor.listBlocks()`): a block removed from
 * the registry disappears from here without touching this file. Only the icon
 * table is local (names come from the registry, components from here).
 */

const ICONS = {
  Type,
  Image: ImageIcon,
  RectangleHorizontal,
  SeparatorHorizontal,
  MoveVertical,
  Square,
  Columns2,
  Columns3,
};

const GROUPS = [
  { kind: 'content', title: 'Content' },
  { kind: 'layout', title: 'Layout' },
];

function BlockTile({ block, disabled, onAdd, onDragStart, onDragEnd }) {
  const t = useT();
  const Icon = ICONS[block.icon] || Square;
  return (
    <TooltipWrap label={block.description ? t(block.description) : block.description}>
      <button
        type="button"
        draggable={!disabled}
        disabled={disabled}
        onClick={() => onAdd(block.id)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'copy';
          e.dataTransfer.setData('text/plain', block.id);
          onDragStart(block.id, e.nativeEvent);
        }}
        onDragEnd={(e) => onDragEnd(e.dataTransfer?.dropEffect === 'none')}
        data-block-id={block.id}
        className={cn(
          'mb:flex mb:h-20 mb:cursor-grab mb:select-none mb:flex-col mb:items-center mb:justify-center mb:gap-1.5 mb:rounded-lg2 mb:border mb:border-border mb:bg-background mb:px-2 mb:text-center mb:transition-colors mb:active:cursor-grabbing',
          'mb:hover:border-primary/50 mb:hover:bg-primary/5 mb:focus-visible:outline-none mb:focus-visible:ring-2 mb:focus-visible:ring-ring/50',
          disabled && 'mb:cursor-not-allowed mb:opacity-50'
        )}
      >
        <Icon className="mb:h-5 mb:w-5 mb:text-foreground-lighter" aria-hidden="true" />
        <span className="mb:text-[12px] mb:text-foreground">{t(block.label)}</span>
      </button>
    </TooltipWrap>
  );
}

export default function BlockSidebar({ editor, disabled = false }) {
  const t = useT();
  const blocks = editor.listBlocks();

  return (
    <aside aria-label={t('Blocks')} className="mb:min-h-0 mb:space-y-5 mb:overflow-y-auto mb:border-r mb:border-border mb:p-3">
      {GROUPS.map((group) => {
        const items = blocks.filter((b) => b.kind === group.kind && b.mjml);
        if (!items.length) return null;
        return (
          <section key={group.kind} className="mb:space-y-2">
            <SectionLabel>{t(group.title)}</SectionLabel>
            <div className="mb:grid mb:grid-cols-2 mb:gap-2">
              {items.map((block) => (
                <BlockTile
                  key={block.id}
                  block={block}
                  disabled={disabled}
                  onAdd={(id) => editor.addBlock(id)}
                  onDragStart={(id, event) => editor.startBlockDrag(id, event)}
                  onDragEnd={(cancel) => editor.endBlockDrag(cancel)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
