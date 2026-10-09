import { Button } from './primitives/button.jsx';
import { TooltipWrap } from './primitives/misc.jsx';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { useT } from './context.jsx';

/**
 * Actions on the selected element: move, duplicate, delete.
 *
 * Same gestures as the canvas toolbar (above the element) and the keyboard
 * (Del), but readable and keyboard-accessible from the panel. No confirmation
 * before deleting: "Undo" (Ctrl+Z) reverts it.
 *
 * A column moves left or right, everything else up or down.
 */
export default function ElementActions({ editor, selection }) {
  const t = useT();
  if (!selection || (!selection.canRemove && !selection.canDuplicate)) return null;
  const horizontal = selection.tagName === 'mj-column';
  const [Prev, Next] = horizontal ? [ArrowLeft, ArrowRight] : [ArrowUp, ArrowDown];
  const [prevLabel, nextLabel] = horizontal
    ? [t('Move left'), t('Move right')]
    : [t('Move up'), t('Move down')];

  return (
    <div className="mb:flex mb:items-center mb:gap-0.5 mb:border-b mb:border-border mb:px-3 mb:py-1.5" role="toolbar" aria-label={t('Element actions')}>
      <TooltipWrap label={prevLabel}>
        <Button
          variant="ghost"
          size="icon-sm-compact"
          aria-label={prevLabel}
          disabled={!selection.canMoveUp}
          onClick={() => editor.move(-1, selection.id)}
        >
          <Prev />
        </Button>
      </TooltipWrap>
      <TooltipWrap label={nextLabel}>
        <Button
          variant="ghost"
          size="icon-sm-compact"
          aria-label={nextLabel}
          disabled={!selection.canMoveDown}
          onClick={() => editor.move(1, selection.id)}
        >
          <Next />
        </Button>
      </TooltipWrap>
      <TooltipWrap label={t('Duplicate')}>
        <Button
          variant="ghost"
          size="icon-sm-compact"
          aria-label={t('Duplicate')}
          disabled={!selection.canDuplicate}
          onClick={() => editor.duplicate(selection.id)}
        >
          <Copy />
        </Button>
      </TooltipWrap>
      <TooltipWrap label={t('Delete (Del)')}>
        <Button
          variant="ghost"
          size="icon-sm-compact"
          aria-label={t('Delete')}
          disabled={!selection.canRemove}
          onClick={() => editor.remove(selection.id)}
          className="mb:ml-auto mb:text-foreground-muted mb:hover:bg-destructive/10 mb:hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </TooltipWrap>
    </div>
  );
}
