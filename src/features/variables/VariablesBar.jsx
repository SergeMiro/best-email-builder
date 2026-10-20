import { useId, useState } from 'react';
import { Braces, ChevronDown } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { tokenOf } from './catalog.js';

/**
 * PERSONALIZATION FIELDS — thin bar above the canvas.
 *
 * Shows its title only. Under the pointer (or opened by a click: touch,
 * keyboard) it grows over the canvas and lists the variables as badges; a
 * badge's tooltip names its tag. A badge under the pointer types its tag into
 * the selected text or button, as it will look, and wipes it out when the
 * pointer leaves; a click inserts it for good (where the Variables menu
 * would).
 *
 * Links (the unsubscribe link) stay in the Variables menu: they are not
 * fields of a recipient.
 */
export default function VariablesBar({ context }) {
  const { editor, ready, variables } = context;
  const { t, notify } = useUi();
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const fields = variables.filter((v) => v.kind !== 'link');
  if (!fields.length) return null;
  const expanded = hovered || open;

  const insert = (variable) => {
    if (!editor.insertText(tokenOf(variable))) notify('info', t('Select a text or a button first.'));
  };

  return (
    <div className="eb:relative eb:z-10 eb:h-6 eb:shrink-0" data-testid="eb-variables-bar">
      <div
        className={cn(
          'eb:absolute eb:inset-x-0 eb:top-0 eb:border-b eb:border-border eb:bg-background eb:transition-shadow',
          expanded && 'eb:shadow-md'
        )}
        data-expanded={expanded}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onKeyDown={(e) => e.key === 'Escape' && open && setOpen(false)}
        // No mousedown: the text being edited keeps its caret.
        onMouseDown={(e) => e.preventDefault()}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setOpen((value) => !value)}
          className="eb:flex eb:h-6 eb:w-full eb:items-center eb:gap-1.5 eb:px-3 eb:text-[11px] eb:font-medium eb:text-foreground-lighter eb:outline-none eb:hover:text-foreground eb:focus-visible:ring-2 eb:focus-visible:ring-ring/40 eb:focus-visible:ring-inset"
        >
          <Braces className="eb:size-3" aria-hidden="true" />
          {t('Personalization fields')}
          <span className="eb:text-foreground-muted">{fields.length}</span>
          <ChevronDown className={cn('eb:ml-auto eb:size-3.5 eb:transition-transform', expanded && 'eb:rotate-180')} aria-hidden="true" />
        </button>
        {/* Rows 0fr → 1fr: it grows to its content. Hidden once shrunk, so a closed bar takes no Tab. */}
        <div
          id={listId}
          className={cn(
            'eb:grid eb:transition-[grid-template-rows,visibility] eb:duration-200 eb:ease-out',
            expanded ? 'eb:visible eb:grid-rows-[1fr]' : 'eb:invisible eb:grid-rows-[0fr]'
          )}
        >
          <div className="eb:min-h-0 eb:overflow-hidden">
            <div
              role="group"
              aria-label={t('Personalization fields')}
              className="eb:flex eb:max-h-24 eb:flex-wrap eb:gap-1 eb:overflow-y-auto eb:px-3 eb:pt-0.5 eb:pb-2"
            >
              {fields.map((variable) => (
                <TooltipWrap
                  key={variable.key}
                  label={<code className="eb:font-mono">{tokenOf(variable)}</code>}
                  delayDuration={100}
                  hoverable={false}
                >
                  <button
                    type="button"
                    disabled={!ready}
                    data-variable={variable.key}
                    onMouseEnter={() => editor.previewText(tokenOf(variable))}
                    onMouseLeave={() => editor.clearPreview()}
                    onFocus={() => editor.previewText(tokenOf(variable))}
                    onBlur={() => editor.clearPreview()}
                    onClick={() => insert(variable)}
                    className="eb:inline-flex eb:h-5.5 eb:items-center eb:rounded-full eb:border eb:border-border eb:bg-surface-75 eb:px-2 eb:text-[11px] eb:font-medium eb:text-foreground eb:transition-colors eb:outline-none eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:hover:text-primary eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:opacity-50"
                  >
                    {variable.custom ? variable.label : t(variable.label)}
                  </button>
                </TooltipWrap>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
