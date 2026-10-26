import { Fragment, useEffect, useRef, useState } from 'react';
import { FolderPlus, Link2, Pencil, Plus } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { TooltipWrap } from '../../ui/primitives/misc.jsx';
import { CUSTOM_GROUP, VARIABLE_LIMITS, labelOf, tokenOf, validateCustomVariable, validateVariableEdit } from './catalog.js';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/primitives/overlays.jsx';
import VariableDialog from './VariableDialog.jsx';

const BADGE =
  'eb:inline-flex eb:h-5.5 eb:items-center eb:gap-1 eb:rounded-full eb:border eb:border-border eb:bg-surface-75 eb:px-2 eb:text-[11px] eb:font-medium eb:text-foreground eb:transition-colors eb:outline-none eb:hover:border-primary/50 eb:hover:bg-primary/5 eb:hover:text-primary eb:focus-visible:ring-2 eb:focus-visible:ring-ring/50 eb:disabled:opacity-50';

/** Pixels the pointer travels before a press on a badge becomes a drag. */
const DRAG_THRESHOLD = 5;

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
 *
 * A badge dragged onto another group (mouse or pen: past a few pixels, the
 * press is a drag, not a click) moves its variable there, as its dialog
 * would: the other groups are outlined, the one under the pointer lit, Esc
 * cancels. On touch screens a drag scrolls the panel; the dialog moves it.
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
  // The badge being dragged: {key, label, link, from, over, x, y}.
  const [drag, setDrag] = useState(null);
  // A badge dropped on a group: shown there until the storage answers.
  const [moved, setMoved] = useState(null); // { key, group }
  /** Press in progress on a badge: where it started; `dragged` once it became a drag. */
  const press = useRef(null);
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
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
  const groupOf = (variable) => (moved?.key === variable.key ? moved.group : variable.group || CUSTOM_GROUP);
  const groups = [...new Set([...savedGroups, ...ordered.map(groupOf)])];
  // Esc drops nothing.
  const dragging = Boolean(drag);
  useEffect(() => {
    if (!dragging) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape' || !press.current) return;
      event.preventDefault();
      event.stopPropagation();
      press.current.cancelled = true;
      setDrag(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dragging]);
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

  /** Moves a variable to another group: saved as its dialog saves it. */
  const move = async (variable, group) => {
    setMoved({ key: variable.key, group });
    const form = {
      label: labelOf(variable, t),
      key: variable.key,
      group,
      sample: variable.sample || '',
      fallback: variable.fallback || '',
      description: variable.description || '',
    };
    const check = variable.custom ? validateCustomVariable(form, { editing: variable.key, t }) : validateVariableEdit(variable, form, { t });
    try {
      if (check.errors) throw new Error(Object.values(check.errors)[0]);
      await storage.saveVariable(check.variable);
      await reloadVariables();
    } catch (error) {
      notify('error', error.message);
    } finally {
      setMoved(null);
    }
  };

  /** The group under the pointer, in this panel. */
  const groupAt = (target, x, y) => {
    const hit = /** @type {Document|ShadowRoot} */ (target.getRootNode()).elementFromPoint(x, y);
    const section = hit && listRef.current?.contains(hit) ? hit.closest('[data-variable-group]') : null;
    return section ? section.getAttribute('data-variable-group') : null;
  };

  /** A badge's pointer handlers: past a few pixels, a press drags it onto a group. */
  const dragHandlers = (variable, label) => ({
    onPointerDown: (event) => {
      if (!ready || event.button !== 0 || event.pointerType === 'touch') return;
      press.current = { key: variable.key, x: event.clientX, y: event.clientY, dragged: false, cancelled: false, over: null };
      // The badge keeps the pointer, wherever it goes.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event) => {
      const start = press.current;
      if (!start || start.key !== variable.key || start.cancelled) return;
      if (!start.dragged) {
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD) return;
        start.dragged = true;
        editor.clearPreview();
      }
      const from = groupOf(variable);
      const over = groupAt(event.currentTarget, event.clientX, event.clientY);
      start.over = over !== from ? over : null;
      setDrag({ key: variable.key, label, link: variable.kind === 'link', from, over: start.over, x: event.clientX, y: event.clientY });
    },
    onPointerUp: () => {
      const start = press.current;
      if (!start?.dragged) {
        press.current = null;
        return;
      }
      setDrag(null);
      if (start.over && !start.cancelled) move(variable, start.over);
      // The click that ends a drag inserts nothing; the next one does.
      setTimeout(() => {
        if (press.current === start) press.current = null;
      });
    },
    onPointerCancel: () => {
      press.current = null;
      setDrag(null);
    },
  });

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
        onMouseEnter={link ? undefined : () => !drag && editor.previewText(tokenOf(variable))}
        onMouseLeave={link ? undefined : () => editor.clearPreview()}
        onFocus={link ? undefined : () => editor.previewText(tokenOf(variable))}
        onBlur={link ? undefined : () => editor.clearPreview()}
        onClick={() => {
          if (!press.current?.dragged) insert(variable);
        }}
        {...(canManageVariables ? dragHandlers(variable, label) : {})}
        className={cn(BADGE, canManageVariables && 'eb:cursor-grab eb:rounded-r-none eb:border-r-0 eb:pr-1.5 eb:active:cursor-grabbing')}
      >
        {link && <Link2 className="eb:size-3" aria-hidden="true" />}
        {label}
      </button>
    );
    const tip = (
      <TooltipWrap label={<code className="eb:font-mono">{tokenOf(variable)}</code>} delayDuration={100} hoverable={false} hidden={Boolean(drag)}>
        {button}
      </TooltipWrap>
    );
    if (!canManageVariables) return <Fragment key={variable.key}>{tip}</Fragment>;
    return (
      <span key={variable.key} className={cn('eb:inline-flex', drag?.key === variable.key && 'eb:opacity-50')}>
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
      <p className="eb:pb-2 eb:text-[11px] eb:leading-snug eb:text-foreground-muted">
        {canManageVariables
          ? t('Point at one to see it in the text, click to insert it, drag it onto a group to move it.')
          : t('Point at one to see it in the text, click to insert it.')}
      </p>
      <div className="eb:mb-3 eb:flex eb:items-center eb:justify-between eb:border-b eb:border-border eb:pb-2">
        <span className="eb:text-[12px] eb:font-medium eb:text-foreground">{t('Group')}</span>
        {canManageGroups && <TooltipWrap label={t('New group')}>
          <Button variant="ghost" size="icon-xs" aria-label={t('New group')} disabled={!ready}
            className="eb:text-primary" onClick={() => { setGroupName(''); setGroupError(''); setGroupOpen(true); }}><FolderPlus /></Button>
        </TooltipWrap>}
      </div>
      <div
        ref={listRef}
        role="group"
        aria-label={t('Email provider variables')}
        className="eb:space-y-3"
        // No mousedown: the text being edited keeps its caret.
        onMouseDown={(event) => event.preventDefault()}
      >
        {groups.map((group) => <section key={group} role="group" aria-label={t(group)} data-variable-group={group}
          className={cn(
            'eb:-mx-1 eb:space-y-1.5 eb:rounded-md eb:px-1 eb:py-0.5 eb:transition-colors',
            // Dragging: where it may go, and where it would.
            drag && group !== drag.from && 'eb:outline-1 eb:outline-dashed eb:outline-border',
            drag?.over === group && 'eb:bg-primary/5 eb:outline-primary/60'
          )}>
          <div className="eb:flex eb:items-center eb:justify-between eb:gap-2">
            <h4 className="eb:min-w-0 eb:truncate eb:text-[11px] eb:font-medium eb:text-foreground-muted">{t(group)}</h4>
            {canManageVariables && <button type="button" disabled={!ready} aria-label={t('New variable in {group}', { group })}
              onClick={() => setDialog({ group })} className="eb:rounded-md eb:p-1 eb:text-primary eb:hover:bg-primary/10"><Plus className="eb:size-3" /></button>}
          </div>
          <div className="eb:flex eb:flex-wrap eb:gap-1">{ordered.filter((v) => groupOf(v) === group).map(badge)}</div>
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
      {drag && (
        <span
          aria-hidden="true"
          className={cn(BADGE, 'eb:pointer-events-none eb:fixed eb:z-50 eb:border-primary/50 eb:text-primary eb:shadow-md')}
          style={{ left: drag.x + 10, top: drag.y + 10 }}
        >
          {drag.link && <Link2 className="eb:size-3" aria-hidden="true" />}
          {drag.label}
        </span>
      )}
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
