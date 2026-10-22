import { Fragment, useEffect, useState } from 'react';
import { Link2, Pencil, Plus } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { isEditable, labelOf, tokenOf } from './catalog.js';
import VariableDialog from './VariableDialog.jsx';

const BADGE =
  'eb:inline-flex eb:h-5.5 eb:items-center eb:gap-1 eb:rounded-full eb:border eb:border-border eb:bg-surface-75 eb:px-2 eb:text-[11px] eb:font-medium eb:text-foreground eb:transition-colors eb:outline-none eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:hover:text-primary eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:opacity-50';

/**
 * EMAIL PROVIDER VARIABLES — the panel beside the canvas, opened by the
 * Variables button at the end of the ribbon: the one place to insert a
 * variable.
 *
 * The variables are badges; a badge's tooltip names its tag. A badge under
 * the pointer types its tag into the selected text or button, as it will
 * look, and wipes it out when the pointer leaves; a click inserts it for
 * good: at the caret of the text being edited, otherwise at the end of the
 * selected text or button. The editor replaces nothing: rendering does, per
 * recipient.
 *
 * There are none by default: when the storage supports it, users create
 * their own here (the + button) and edit or delete them with the pencil of
 * their badge; they are shared by every template. The application's get a
 * pencil too: their name, sample… change, their tag does not, and the dialog
 * restores the application's. The unsubscribe link is inserted as a link (or
 * becomes the URL of the selected button), so it shows no typed preview.
 */
export default function VariablesPanel({ context }) {
  const { editor, ready, variables, storage, canManageVariables, reloadVariables } = context;
  const { t, notify } = useUi();
  const [dialog, setDialog] = useState(null); // { variable } | {}
  // Leaving the panel: no tag stays typed in the email.
  useEffect(() => () => editor.clearPreview(), [editor]);
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
    const label = labelOf(variable, t);
    const editable = canManageVariables && isEditable(variable);
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
          aria-label={t('Edit “{name}”', { name: label })}
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
    <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:px-3 eb:pb-3" data-testid="eb-variables-panel">
      <p className="eb:pb-2 eb:text-[11px] eb:leading-snug eb:text-foreground-muted">{t('Point at one to see it in the text, click to insert it.')}</p>
      <div
        role="group"
        aria-label={t('Email provider variables')}
        className="eb:flex eb:flex-wrap eb:items-center eb:gap-1"
        // No mousedown: the text being edited keeps its caret.
        onMouseDown={(event) => event.preventDefault()}
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
        {links.length > 0 && <span className="eb:my-1 eb:block eb:h-px eb:basis-full eb:bg-border" aria-hidden="true" />}
        {links.map(badge)}
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
          onDeleted={async (_key, { restored = false } = {}) => {
            await reloadVariables();
            notify('success', restored ? t('Variable restored to its default.') : t('Variable deleted.'));
          }}
        />
      )}
    </div>
  );
}
