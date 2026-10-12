import { SectionLabel } from './primitives/misc.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import {
  Columns2,
  Columns3,
  Columns4,
  GalleryHorizontal,
  Heading,
  Image as ImageIcon,
  LayoutPanelLeft,
  Menu,
  MoveVertical,
  RectangleHorizontal,
  SeparatorHorizontal,
  Share2,
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
  Heading,
  Type,
  Share2,
  Menu,
  Columns4,
  LayoutPanelLeft,
  GalleryHorizontal,
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
          'eb:flex eb:h-20 eb:cursor-grab eb:select-none eb:flex-col eb:items-center eb:justify-center eb:gap-1.5 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:px-2 eb:text-center eb:transition-colors eb:active:cursor-grabbing',
          'eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:focus-visible:outline-none eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50',
          disabled && 'eb:cursor-not-allowed eb:opacity-50'
        )}
      >
        <Icon className="eb:h-5 eb:w-5 eb:text-foreground-lighter" aria-hidden="true" />
        <span className="eb:text-[12px] eb:text-foreground">{t(block.label)}</span>
      </button>
    </TooltipWrap>
  );
}

export default function BlockSidebar({ editor, disabled = false }) {
  const t = useT();
  const blocks = editor.listBlocks();

  return (
    <aside aria-label={t('Blocks')} className="eb:min-h-0 eb:space-y-5 eb:overflow-y-auto eb:border-r eb:border-border eb:p-3">
      {GROUPS.map((group) => {
        const items = blocks.filter((b) => b.kind === group.kind && b.mjml);
        if (!items.length) return null;
        return (
          <section key={group.kind} className="eb:space-y-2">
            <SectionLabel>{t(group.title)}</SectionLabel>
            <div className="eb:grid eb:grid-cols-2 eb:gap-2">
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
