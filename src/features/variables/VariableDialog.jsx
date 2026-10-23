import { useEffect, useMemo, useState } from 'react';
import { Braces, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { CUSTOM_GROUP, VARIABLE_LIMITS, keyFromLabel, labelOf, tokenOf, validateCustomVariable, validateVariableEdit } from './catalog.js';

/**
 * Create or edit a CUSTOM variable, or edit a SYSTEM one (the application's):
 * its tag is frozen, and the dialog restores the application's values rather
 * than deleting it.
 *
 *   Name             what the menu shows ("Order number");
 *   Tag              proposed from the name, editable until the variable
 *                    exists — then frozen: templates contain it;
 *   Group            free text, existing groups suggested;
 *   Sample value     used by the preview and test sends;
 *   Value if empty   what a recipient without a value sees.
 *
 * For the unsubscribe link, both are links: the sample is the preview's, the
 * value if empty is used when the sending gives none — typically the email
 * provider's own tag (`*|UNSUB|*`).
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   variable?: import('./catalog.js').EmailVariable|null,   // null: creation
 *   initialLabel?: string,
 *   variables: import('./catalog.js').EmailVariable[],
 *   storage: import('../../storage/client.js').TemplateStorage,
 *   onSaved: (variable: import('./catalog.js').EmailVariable, created: boolean) => void,
 *   onDeleted?: (key: string, info?: {restored?: boolean}) => void,
 * }} props
 */
export default function VariableDialog({ open, onOpenChange, variable = null, initialLabel = '', variables, storage, onSaved, onDeleted }) {
  const { t, notify, confirm } = useUi();
  const editing = Boolean(variable);
  const system = editing && !variable.custom;
  const link = variable?.kind === 'link';
  const [form, setForm] = useState({ label: '', key: '', group: '', sample: '', fallback: '' });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      variable
        ? {
            label: labelOf(variable, t),
            key: variable.key,
            group: (system ? t(variable.group) : variable.group) || '',
            sample: variable.sample || '',
            fallback: variable.fallback || '',
          }
        : { label: initialLabel, key: initialLabel ? keyFromLabel(initialLabel) : '', group: '', sample: '', fallback: '' }
    );
    setKeyTouched(false);
    setErrors({});
  }, [open, variable, initialLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(
    () => [...new Set([CUSTOM_GROUP, ...variables.filter((v) => v.custom).map((v) => v.group)])].filter(Boolean),
    [variables]
  );

  const set = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      // The tag follows the name until the user types one.
      if (field === 'label' && !editing && !keyTouched) next.key = value.trim() ? keyFromLabel(value) : '';
      return next;
    });
    if (field === 'key') setKeyTouched(true);
    setErrors((errs) => ({ ...errs, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const existing = variables.filter((v) => !editing || v.key !== variable.key);
    const check = system
      ? validateVariableEdit(variable, form, { t })
      : validateCustomVariable(form, { existing, editing: editing ? variable.key : null, t });
    if (check.errors) {
      setErrors(check.errors);
      return;
    }
    setBusy(true);
    try {
      const saved = await storage.saveVariable(check.variable, { create: !editing });
      onSaved(saved, !editing);
      onOpenChange(false);
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t('Delete the variable “{name}”?', { name: variable.label }),
      description: t('Templates that use it will show its “value if empty”.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await storage.deleteVariable(variable.key);
      onDeleted?.(variable.key);
      onOpenChange(false);
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  };

  /** A system variable: its edit is deleted, the application's values are back. */
  const restore = async () => {
    setBusy(true);
    try {
      await storage.deleteVariable(variable.key);
      onDeleted?.(variable.key, { restored: true });
      onOpenChange(false);
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (name, label, props = {}, hint = null) => (
    <div className="eb:space-y-1.5">
      <Label htmlFor={`eb-var-${name}`}>{label}</Label>
      <Input
        dense
        id={`eb-var-${name}`}
        value={form[name]}
        onChange={set(name)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] || hint ? `eb-var-${name}-hint` : undefined}
        {...props}
      />
      {(errors[name] || hint) && (
        <p id={`eb-var-${name}-hint`} className={errors[name] ? 'eb:text-[12px] eb:text-destructive' : 'eb:text-[11px] eb:text-foreground-muted'}>
          {errors[name] || hint}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="eb:sm:max-w-[440px]"
        // A text being edited in the canvas keeps its caret: a mousedown that
        // reaches the document would end the editing.
        onMouseDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="eb:flex eb:items-center eb:gap-3">
            <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
              <Braces className="eb:size-5" />
            </span>
            <div>
              <DialogTitle className="eb:text-base eb:font-normal">{editing ? t('Edit variable') : t('New variable')}</DialogTitle>
              <DialogDescription className="eb:text-[13px]">{t('Available in every template.')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="eb:space-y-3" noValidate>
          {field('label', t('Name'), { autoFocus: true, maxLength: VARIABLE_LIMITS.label, placeholder: t('Order number') })}
          {field(
            'key',
            t('Tag'),
            { disabled: editing, maxLength: VARIABLE_LIMITS.key, className: 'eb:font-mono eb:text-[12px]' },
            variable ? tokenOf(variable) : form.key ? `{{${form.key}}}` : null
          )}
          <div className="eb:space-y-1.5">
            <Label htmlFor="eb-var-group">{t('Group')}</Label>
            <Input
              dense
              id="eb-var-group"
              list="eb-var-groups"
              value={form.group}
              onChange={set('group')}
              maxLength={VARIABLE_LIMITS.group}
              placeholder={t(system ? variable.group : CUSTOM_GROUP)}
            />
            <datalist id="eb-var-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="eb:grid eb:grid-cols-2 eb:gap-3">
            {field('sample', t('Sample value'), { maxLength: VARIABLE_LIMITS.sample, placeholder: link ? 'https://…' : 'CMD-1042' }, t('Preview and tests'))}
            {field(
              'fallback',
              t('Value if empty'),
              { maxLength: VARIABLE_LIMITS.fallback, placeholder: link ? '*|UNSUB|*' : undefined },
              link ? t('When the sending gives no link') : t('When a recipient has none')
            )}
          </div>
          <div className="eb:flex eb:items-center eb:gap-2 eb:pt-1">
            {system && variable.edited && (
              <Button variant="ghost" onClick={restore} disabled={busy}>
                <RotateCcw />
                {t('Restore the default')}
              </Button>
            )}
            {editing && !system && (
              <Button variant="ghost" className="eb:text-destructive eb:hover:text-destructive" onClick={remove} disabled={busy}>
                <Trash2 />
                {t('Delete')}
              </Button>
            )}
            <div className="eb:ml-auto eb:flex eb:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {t('Cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="eb:animate-spin" />}
                {editing ? t('Save') : t('Create')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
