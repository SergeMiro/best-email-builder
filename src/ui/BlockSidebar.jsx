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
import { useRef } from 'react';
import { cn } from './primitives/cn.js';
import { useT } from './context.jsx';

/** Pixels the pointer travels before a press becomes a drag. */
const DRAG_THRESHOLD = 5;

/**
 * Block sidebar, left of the canvas.
 *
 * Two gestures for the same block:
 *   - CLICK (or Enter): the editor inserts it at the logical place (inside
 *     the selected column, after the selected element, otherwise at the end
 *     of the email);
 *   - DRAG onto the canvas (mouse or pen): past a few pixels the editor takes
 *     the pointer over — a line in the canvas shows where the block will land,
 *     Esc cancels. On touch screens a tap adds the block (a drag there scrolls
 *     the list).
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

function BlockTile({ block, disabled, onAdd, onDragStart }) {
  const t = useT();
  const Icon = ICONS[block.icon] || Square;
  /** Press in progress: where it started; `dragged` once it became a drag. */
  const press = useRef(null);
  return (
    <TooltipWrap label={block.description ? t(block.description) : block.description}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          // The click that ends a drag is not an "add".
          if (press.current?.dragged) {
            press.current = null;
            return;
          }
          press.current = null;
          onAdd(block.id);
        }}
        onPointerDown={(e) => {
          if (disabled || e.button !== 0 || e.pointerType === 'touch') return;
          press.current = { x: e.clientX, y: e.clientY, dragged: false };
        }}
        onPointerMove={(e) => {
          const start = press.current;
          if (!start || start.dragged) return;
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
          start.dragged = true;
          // The tile itself keeps the pointer (React's native event points at its root).
          onDragStart(block.id, {
            pointerId: e.pointerId,
            clientX: e.clientX,
            clientY: e.clientY,
            currentTarget: e.currentTarget,
            target: e.currentTarget,
          });
        }}
        onPointerUp={() => {
          if (press.current && !press.current.dragged) press.current = null;
        }}
        data-block-id={block.id}
        className={cn(
          'eb:flex eb:h-20 eb:cursor-grab eb:touch-pan-y eb:select-none eb:flex-col eb:items-center eb:justify-center eb:gap-1.5 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:px-2 eb:text-center eb:transition-colors eb:active:cursor-grabbing',
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

export default function BlockSidebar({ editor, disabled = false, onAdded }) {
  const t = useT();
  const blocks = editor.listBlocks();

  return (
    <aside aria-label={t('Blocks')} className="eb:min-h-0 eb:space-y-5 eb:overflow-y-auto eb:p-3">
      {GROUPS.map((group) => {
        const items = blocks.filter((b) => b.kind === group.kind && b.mjml);
        if (!items.length) return null;
        return (
          <section key={group.kind} className="eb:space-y-2">
            <SectionLabel>{t(group.title)}</SectionLabel>
            {/* As many in a row as the panel's width holds: three by default. */}
            <div className="eb:grid eb:grid-cols-[repeat(auto-fill,minmax(80px,1fr))] eb:gap-2">
              {items.map((block) => (
                <BlockTile
                  key={block.id}
                  block={block}
                  disabled={disabled}
                  onAdd={(id) => {
                    if (editor.addBlock(id)) onAdded?.(id);
                  }}
                  onDragStart={(id, event) => editor.startBlockDrag(id, event)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
