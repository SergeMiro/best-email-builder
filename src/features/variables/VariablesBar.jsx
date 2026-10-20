import { Fragment, useId, useState } from 'react';
import { Braces, ChevronDown, Link2, Pencil, Plus } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { tokenOf } from './catalog.js';
import VariableDialog from './VariableDialog.jsx';

const BADGE =
  'eb:inline-flex eb:h-5.5 eb:items-center eb:gap-1 eb:rounded-full eb:border eb:border-border eb:bg-surface-75 eb:px-2 eb:text-[11px] eb:font-medium eb:text-foreground eb:transition-colors eb:outline-none eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:hover:text-primary eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:opacity-50';

/**
 * EMAIL PROVIDER VARIABLES — thin bar above the canvas, the one place to
 * insert a variable.
 *
 * Shows its title only. Under the pointer (or opened by a click: touch,
 * keyboard) it grows over the canvas and lists the variables as badges; a
 * badge's tooltip names its tag. A badge under the pointer types its tag into
 * the selected text or button, as it will look, and wipes it out when the
 * pointer leaves; a click inserts it for good: at the caret of the text being
 * edited, otherwise at the end of the selected text or button. The editor
 * replaces nothing: rendering does, per recipient.
 *
 * There are none by default: when the storage supports it, users create
 * their own here (the + button) and edit or delete them with the pencil of
 * their badge; they are shared by every template. The unsubscribe link is
 * inserted as a link (or becomes the URL of the selected button), so it
 * shows no typed preview.
 */
export default function VariablesBar({ context }) {
  const { editor, ready, variables, storage, canManageVariables, reloadVariables } = context;
  const { t, notify } = useUi();
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // { variable } | {}
  const listId = useId();
  if (!variables.length && !canManageVariables) return null;
  const expanded = hovered || open;
  const fields = variables.filter((v) => v.kind !== 'link');
  const links = variables.filter((v) => v.kind === 'link');

  const insert = (variable) => {
    const done =
      variable.kind === 'link'
        ? editor.insertLink(tokenOf(variable), t('Unsubscribe'))
        : editor.insertText(tokenOf(variable));
    if (!done) notify('info', t('Select a text or a button first.'));
  };

  const badge = (variable) => {
    const link = variable.kind === 'link';
    const label = variable.custom ? variable.label : t(variable.label);
    const editable = canManageVariables && variable.custom;
    const button = (
      <button
        type="button"
        disabled={!ready}
        data-variable={variable.key}
        onMouseEnter={link ? undefined : () => editor.previewText(tokenOf(variable))}
        onMouseLeave={link ? undefined : () => editor.clearPreview()}
        onFocus={link ? undefined : () => editor.previewText(tokenOf(variable))}
        onBlur={link ? undefined : () => editor.clearPreview()}
        onClick={() => insert(variable)}
        className={cn(BADGE, editable && 'eb:rounded-r-none eb:border-r-0 eb:pr-1.5')}
      >
        {link && <Link2 className="eb:size-3" aria-hidden="true" />}
        {label}
      </button>
    );
    const tip = (
      <TooltipWrap label={<code className="eb:font-mono">{tokenOf(variable)}</code>} delayDuration={100} hoverable={false}>
        {button}
      </TooltipWrap>
    );
    if (!editable) return <Fragment key={variable.key}>{tip}</Fragment>;
    return (
      <span key={variable.key} className="eb:inline-flex">
        {tip}
        <button
          type="button"
          aria-label={t('Edit “{name}”', { name: variable.label })}
          title={t('Edit')}
          onClick={() => setDialog({ variable })}
          className={cn(BADGE, 'eb:rounded-l-none eb:px-1.5 eb:text-foreground-muted')}
        >
          <Pencil className="eb:size-2.5" aria-hidden="true" />
        </button>
      </span>
    );
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
          {t('Email provider variables')}
          {fields.length > 0 && <span className="eb:text-foreground-muted">{fields.length}</span>}
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
              aria-label={t('Email provider variables')}
              className="eb:flex eb:max-h-24 eb:flex-wrap eb:items-center eb:gap-1 eb:overflow-y-auto eb:px-3 eb:pt-0.5 eb:pb-2"
            >
              {fields.map(badge)}
              {!fields.length && <span className="eb:text-[11px] eb:text-foreground-muted">{t('No variables yet.')}</span>}
              {canManageVariables && (
                <TooltipWrap label={t('New variable')} delayDuration={100} hoverable={false}>
                  <button
                    type="button"
                    disabled={!ready}
                    aria-label={t('New variable')}
                    onClick={() => setDialog({})}
                    className={cn(BADGE, 'eb:w-5.5 eb:justify-center eb:border-dashed eb:bg-transparent eb:px-0 eb:text-primary')}
                  >
                    <Plus className="eb:size-3.5" aria-hidden="true" />
                  </button>
                </TooltipWrap>
              )}
              {links.length > 0 && <span className="eb:mx-1 eb:h-3.5 eb:w-px eb:bg-border" aria-hidden="true" />}
              {links.map(badge)}
            </div>
          </div>
        </div>
      </div>
      {canManageVariables && (
        <VariableDialog
          open={Boolean(dialog)}
          onOpenChange={(next) => !next && setDialog(null)}
          variable={dialog?.variable || null}
          variables={variables}
          storage={storage}
          onSaved={async (variable, created) => {
            await reloadVariables();
            if (created) {
              // A text was being edited: the new variable goes at its caret.
              if (editor.insertText(tokenOf(variable))) {
                notify('success', t('Variable “{name}” created and inserted.', { name: variable.label }));
              } else {
                notify('success', t('Variable “{name}” created.', { name: variable.label }));
              }
            } else {
              notify('success', t('Variable “{name}” saved.', { name: variable.label }));
            }
          }}
          onDeleted={async () => {
            await reloadVariables();
            notify('success', t('Variable deleted.'));
          }}
        />
      )}
    </div>
  );
}
