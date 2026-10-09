import { useEffect, useMemo, useState } from 'react';
import { Braces, Loader2, Trash2 } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { CUSTOM_GROUP, VARIABLE_LIMITS, keyFromLabel, validateCustomVariable } from './catalog.js';

/**
 * Create or edit a CUSTOM variable.
 *
 *   Name             what the menu shows ("Order number");
 *   Tag              proposed from the name, editable until the variable
 *                    exists — then frozen: templates contain it;
 *   Group            free text, existing groups suggested;
 *   Sample value     used by the preview and test sends;
 *   Value if empty   what a recipient without a value sees.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   variable?: import('./catalog.js').EmailVariable|null,   // null: creation
 *   initialLabel?: string,
 *   variables: import('./catalog.js').EmailVariable[],
 *   storage: import('../../storage/client.js').TemplateStorage,
 *   onSaved: (variable: import('./catalog.js').EmailVariable, created: boolean) => void,
 *   onDeleted?: (key: string) => void,
 * }} props
 */
export default function VariableDialog({ open, onOpenChange, variable = null, initialLabel = '', variables, storage, onSaved, onDeleted }) {
  const { t, notify, confirm } = useUi();
  const editing = Boolean(variable);
  const [form, setForm] = useState({ label: '', key: '', group: '', sample: '', fallback: '' });
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      variable
        ? {
            label: variable.label,
            key: variable.key,
            group: variable.group || '',
            sample: variable.sample || '',
            fallback: variable.fallback || '',
          }
        : { label: initialLabel, key: initialLabel ? keyFromLabel(initialLabel) : '', group: '', sample: '', fallback: '' }
    );
    setKeyTouched(false);
    setErrors({});
  }, [open, variable, initialLabel]);

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
    const check = validateCustomVariable(form, { existing, editing: editing ? variable.key : null, t });
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

  const field = (name, label, props = {}, hint = null) => (
    <div className="mb:space-y-1.5">
      <Label htmlFor={`mb-var-${name}`}>{label}</Label>
      <Input
        id={`mb-var-${name}`}
        value={form[name]}
        onChange={set(name)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] || hint ? `mb-var-${name}-hint` : undefined}
        {...props}
      />
      {(errors[name] || hint) && (
        <p id={`mb-var-${name}-hint`} className={errors[name] ? 'mb:text-[12px] mb:text-destructive' : 'mb:text-[11px] mb:text-foreground-muted'}>
          {errors[name] || hint}
        </p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="mb:sm:max-w-[440px]"
        // A text being edited in the canvas keeps its caret: a mousedown that
        // reaches the document would end the editing.
        onMouseDown={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb:flex mb:items-center mb:gap-3">
            <span className="mb:flex mb:size-10 mb:shrink-0 mb:items-center mb:justify-center mb:rounded-lg2 mb:bg-primary/10 mb:text-primary">
              <Braces className="mb:size-5" />
            </span>
            <div>
              <DialogTitle className="mb:text-base mb:font-normal">{editing ? t('Edit variable') : t('New variable')}</DialogTitle>
              <DialogDescription className="mb:text-[13px]">{t('Available in every template.')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="mb:space-y-3" noValidate>
          {field('label', t('Name'), { autoFocus: true, maxLength: VARIABLE_LIMITS.label, placeholder: t('Order number') })}
          {field(
            'key',
            t('Tag'),
            { disabled: editing, maxLength: VARIABLE_LIMITS.key, className: 'mb:font-mono mb:text-[12px]' },
            form.key ? `{{${form.key}}}` : null
          )}
          <div className="mb:space-y-1.5">
            <Label htmlFor="mb-var-group">{t('Group')}</Label>
            <Input
              id="mb-var-group"
              list="mb-var-groups"
              value={form.group}
              onChange={set('group')}
              maxLength={VARIABLE_LIMITS.group}
              placeholder={t(CUSTOM_GROUP)}
            />
            <datalist id="mb-var-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="mb:grid mb:grid-cols-2 mb:gap-3">
            {field('sample', t('Sample value'), { maxLength: VARIABLE_LIMITS.sample, placeholder: 'CMD-1042' }, t('Preview and tests'))}
            {field('fallback', t('Value if empty'), { maxLength: VARIABLE_LIMITS.fallback }, t('When a recipient has none'))}
          </div>
          <div className="mb:flex mb:items-center mb:gap-2 mb:pt-1">
            {editing && (
              <Button variant="ghost" className="mb:text-destructive mb:hover:text-destructive" onClick={remove} disabled={busy}>
                <Trash2 />
                {t('Delete')}
              </Button>
            )}
            <div className="mb:ml-auto mb:flex mb:gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                {t('Cancel')}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <Loader2 className="mb:animate-spin" />}
                {editing ? t('Save') : t('Create')}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
