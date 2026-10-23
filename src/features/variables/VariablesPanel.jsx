import { Fragment, useEffect, useState } from 'react';
import { FolderPlus, Link2, Pencil, Plus } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { CUSTOM_GROUP, VARIABLE_LIMITS, labelOf, tokenOf } from './catalog.js';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/primitives/overlays.jsx';
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
 * pencil too, the unsubscribe link included: their name, sample… change,
 * their tag does not, and the dialog restores the application's. The
 * unsubscribe link is inserted as a link (or becomes the URL of the selected
 * button), so it shows no typed preview.
 */
export default function VariablesPanel({ context }) {
  const { editor, ready, variables, storage, canManageVariables, reloadVariables } = context;
  const { t, notify } = useUi();
  const [dialog, setDialog] = useState(null); // { variable } | {}
  const [savedGroups, setSavedGroups] = useState([]);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState('');
  const [groupBusy, setGroupBusy] = useState(false);
  const canManageGroups = canManageVariables && typeof storage.saveVariableGroup === 'function';
  useEffect(() => {
    let live = true;
    storage.listVariableGroups?.().then((groups) => live && setSavedGroups(groups)).catch((error) => notify('error', error.message));
    return () => { live = false; };
  }, [storage, notify]);
  // Leaving the panel: no tag stays typed in the email.
  useEffect(() => () => editor.clearPreview(), [editor]);
  // Links last, as the unsubscribe link ends an email.
  const ordered = [...variables.filter((v) => v.kind !== 'link'), ...variables.filter((v) => v.kind === 'link')];
  const groups = [...new Set([...savedGroups, ...ordered.map((v) => v.group || CUSTOM_GROUP)])];
  const createGroup = async (event) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) return;
    if (groups.some((group) => group.toLowerCase() === name.toLowerCase())) {
      setGroupError(t('This group already exists.'));
      return;
    }
    setGroupBusy(true);
    try {
      const saved = await storage.saveVariableGroup(name);
      setSavedGroups((previous) => [...previous, saved]);
      setGroupOpen(false);
    } catch (error) {
      setGroupError(error.message);
    } finally { setGroupBusy(false); }
  };

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
        className={cn(BADGE, canManageVariables && 'eb:rounded-r-none eb:border-r-0 eb:pr-1.5')}
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
    if (!canManageVariables) return <Fragment key={variable.key}>{tip}</Fragment>;
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
      <div className="eb:mb-3 eb:flex eb:items-center eb:justify-between eb:border-b eb:border-border eb:pb-2">
        <span className="eb:text-[12px] eb:font-medium eb:text-foreground">{t('Group')}</span>
        {canManageGroups && <TooltipWrap label={t('New group')}>
          <Button variant="ghost" size="icon-xs" aria-label={t('New group')} disabled={!ready}
            className="eb:text-primary" onClick={() => { setGroupName(''); setGroupError(''); setGroupOpen(true); }}><FolderPlus /></Button>
        </TooltipWrap>}
      </div>
      <div
        role="group"
        aria-label={t('Email provider variables')}
        className="eb:space-y-3"
        // No mousedown: the text being edited keeps its caret.
        onMouseDown={(event) => event.preventDefault()}
      >
        {groups.map((group) => <section key={group} role="group" aria-label={t(group)} className="eb:space-y-1.5">
          <div className="eb:flex eb:items-center eb:justify-between eb:gap-2">
            <h4 className="eb:min-w-0 eb:truncate eb:text-[11px] eb:font-medium eb:text-foreground-muted">{t(group)}</h4>
            {canManageVariables && <button type="button" disabled={!ready} aria-label={t('New variable in {group}', { group })}
              onClick={() => setDialog({ group })} className="eb:rounded-md eb:p-1 eb:text-primary eb:hover:bg-primary/10"><Plus className="eb:size-3" /></button>}
          </div>
          <div className="eb:flex eb:flex-wrap eb:gap-1">{ordered.filter((v) => (v.group || CUSTOM_GROUP) === group).map(badge)}</div>
        </section>)}
        {!ordered.length && <span className="eb:text-[11px] eb:text-foreground-muted">{t('No variables yet.')}</span>}
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
      </div>
      {canManageVariables && (
        <VariableDialog
          open={Boolean(dialog)}
          onOpenChange={(next) => !next && setDialog(null)}
          variable={dialog?.variable || null}
          initialGroup={dialog?.group || ''}
          variableGroups={groups}
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
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="eb:sm:max-w-[360px]" onMouseDown={(event) => event.stopPropagation()} onCloseAutoFocus={(event) => event.preventDefault()}>
          <DialogHeader><DialogTitle>{t('New group')}</DialogTitle><DialogDescription>{t('Organize your variables into groups.')}</DialogDescription></DialogHeader>
          <form className="eb:space-y-3" onSubmit={createGroup}>
            <div className="eb:space-y-1.5"><Label htmlFor="eb-variable-group-name">{t('Name')}</Label>
              <Input dense autoFocus id="eb-variable-group-name" value={groupName} maxLength={VARIABLE_LIMITS.group} disabled={groupBusy}
                aria-invalid={Boolean(groupError)} onChange={(event) => { setGroupName(event.target.value); setGroupError(''); }} />
              {groupError && <p role="alert" className="eb:text-[12px] eb:text-destructive">{groupError}</p>}
            </div>
            <div className="eb:flex eb:justify-end eb:gap-2"><Button variant="outline" disabled={groupBusy} onClick={() => setGroupOpen(false)}>{t('Cancel')}</Button>
              <Button type="submit" disabled={groupBusy || !groupName.trim()}>{t('Create')}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
