import { useEffect, useState } from 'react';
import { Check, Loader2, Pencil, Tags, Trash2 } from 'lucide-react';
import { MAX_TEMPLATE_TAGS, TAG_COLORS, TAG_LIMITS, sortTags, validateTag } from '../../features/tags/tags.js';
import { useUi } from '../context.jsx';
import { Button } from '../primitives/button.jsx';
import { cn } from '../primitives/cn.js';
import { Input, Label } from '../primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../primitives/overlays.jsx';
import { TAG_SWATCHES, TagBadge } from './TagBadge.jsx';

/** A new tag takes the next color, so tags made in a row differ. */
const colorAfter = (tags) => TAG_COLORS[(TAG_COLORS.indexOf('blue') + tags.length) % TAG_COLORS.length];

/**
 * TAGS — the tags of one template, and the workspace's list of tags.
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ ▣ Tags                                    × │
 *   │   Up to 3 tags on “October newsletter”.     │
 *   │ ☑ [Marketing]                         ✎  🗑 │
 *   │ ☐ [Events]                            ✎  🗑 │
 *   │                                     1 / 3   │
 *   │ New tag  [ Name                          ]  │
 *   │          ● ● ● ● ● ● ● ● ●       [ Create ] │
 *   │                                    [ Done ] │
 *   └─────────────────────────────────────────────┘
 *
 * Everything is saved as it is done: ticking a tag, creating one (ticked at
 * once while the template has room), renaming it, deleting it — from every
 * template. Errors show in the dialog: the library's notices are under it.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   template: {id: string|number, name: string, tags?: string[]},
 *   tags: import('../../features/tags/tags.js').TemplateTag[],
 *   storage: import('../../storage/client.js').TemplateStorage,
 *   onTagsChange: (tags: import('../../features/tags/tags.js').TemplateTag[], change?: {deleted?: string}) => void,
 *   onTemplateTags: (tagIds: string[]) => void,
 * }} props
 */
export default function TagsDialog({ open, onOpenChange, template, tags, storage, onTagsChange, onTemplateTags }) {
  const { t, confirm } = useUi();
  const chosen = (template.tags || []).map(String);
  const full = chosen.length >= MAX_TEMPLATE_TAGS;
  /** null: creating; else the id of the tag being edited. */
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ label: '', color: colorAfter(tags) });
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  /** What is being saved: `form`, `tick:<id>`, `delete:<id>`. */
  const [busy, setBusy] = useState(null);

  const colorName = {
    gray: t('Gray'),
    red: t('Red'),
    orange: t('Orange'),
    amber: t('Yellow'),
    green: t('Green'),
    teal: t('Teal'),
    blue: t('Blue'),
    violet: t('Violet'),
    pink: t('Pink'),
  };

  const reset = (list = tags) => {
    setEditing(null);
    setForm({ label: '', color: colorAfter(list) });
    setErrors({});
  };
  useEffect(() => {
    if (!open) return;
    reset();
    setFailure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** @param {string} what @param {() => Promise<void>} work */
  const run = async (what, work) => {
    setBusy(what);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(error.message);
    } finally {
      setBusy(null);
    }
  };

  const tick = (id) =>
    run(`tick:${id}`, async () => {
      const next = chosen.includes(id) ? chosen.filter((tagId) => tagId !== id) : [...chosen, id];
      onTemplateTags(await storage.setTemplateTags(template.id, next));
    });

  const submit = (event) => {
    event.preventDefault();
    const check = validateTag(form, { existing: tags, editing, t });
    if (check.errors) {
      setErrors(check.errors);
      return;
    }
    run('form', async () => {
      const saved = await storage.saveTag(editing ? { id: editing, ...check.tag } : check.tag, { create: !editing });
      const list = sortTags([...tags.filter((tag) => tag.id !== saved.id), saved]);
      onTagsChange(list);
      if (!editing && !full) onTemplateTags(await storage.setTemplateTags(template.id, [...chosen, saved.id]));
      reset(list);
    });
  };

  const remove = async (tag) => {
    const ok = await confirm({
      title: t('Delete the tag “{name}”?', { name: tag.label }),
      description: t('It is removed from every template.'),
      confirmLabel: t('Delete'),
      destructive: true,
    });
    if (!ok) return;
    run(`delete:${tag.id}`, async () => {
      await storage.deleteTag(tag.id);
      const list = tags.filter((other) => other.id !== tag.id);
      onTagsChange(list, { deleted: tag.id });
      if (editing === tag.id) reset(list);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="eb:sm:max-w-[460px]" data-testid="eb-tags-dialog">
        <DialogHeader>
          <div className="eb:flex eb:items-center eb:gap-3">
            <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
              <Tags className="eb:size-5" />
            </span>
            <div className="eb:min-w-0">
              <DialogTitle className="eb:text-base eb:font-normal">{t('Tags')}</DialogTitle>
              <DialogDescription className="eb:text-[13px]">
                {t('Up to {max} tags on “{name}”.', { max: MAX_TEMPLATE_TAGS, name: template.name })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="eb:flex eb:flex-col eb:gap-1">
          {tags.length === 0 ? (
            <p className="eb:m-0 eb:rounded-lg2 eb:border eb:border-dashed eb:border-border eb:p-3 eb:text-center eb:text-[12.5px] eb:text-foreground-lighter">
              {t('No tag yet: create the first one below.')}
            </p>
          ) : (
            <ul className="eb:flex eb:max-h-56 eb:flex-col eb:gap-0.5 eb:overflow-y-auto" aria-label={t('Tags')}>
              {tags.map((tag) => {
                const checked = chosen.includes(tag.id);
                const locked = !checked && full;
                return (
                  <li
                    key={tag.id}
                    data-testid="eb-tags-option"
                    className={cn('eb:flex eb:items-center eb:gap-2 eb:rounded-md eb:px-2 eb:py-1', editing === tag.id ? 'eb:bg-primary/5' : 'eb:hover:bg-surface-75')}
                  >
                    <label
                      className={cn('eb:flex eb:min-w-0 eb:flex-1 eb:items-center eb:gap-2.5', locked ? 'eb:cursor-not-allowed eb:opacity-50' : 'eb:cursor-pointer')}
                      title={locked ? t('{max} tags at most: untick one to choose another.', { max: MAX_TEMPLATE_TAGS }) : undefined}
                    >
                      <input
                        type="checkbox"
                        className="eb:size-4 eb:shrink-0 eb:accent-primary"
                        checked={checked}
                        disabled={locked || busy !== null}
                        onChange={() => tick(tag.id)}
                        aria-label={tag.label}
                      />
                      <TagBadge tag={tag} className="eb:text-[12px]" />
                      {busy === `tick:${tag.id}` && <Loader2 className="eb:size-3.5 eb:animate-spin eb:text-foreground-muted" />}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="eb:text-foreground-muted"
                      disabled={busy !== null}
                      onClick={() => {
                        setEditing(tag.id);
                        setForm({ label: tag.label, color: tag.color });
                        setErrors({});
                      }}
                      aria-label={t('Edit the tag “{name}”', { name: tag.label })}
                      title={t('Edit')}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="eb:text-foreground-muted eb:hover:text-destructive"
                      disabled={busy !== null}
                      onClick={() => remove(tag)}
                      aria-label={t('Delete the tag “{name}”', { name: tag.label })}
                      title={t('Delete')}
                    >
                      {busy === `delete:${tag.id}` ? <Loader2 className="eb:animate-spin" /> : <Trash2 />}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {tags.length > 0 && (
            <p className="eb:m-0 eb:px-2 eb:text-right eb:text-[11.5px] eb:text-foreground-muted" aria-live="polite" data-testid="eb-tags-count">
              {full ? t('{max} tags at most: untick one to choose another.', { max: MAX_TEMPLATE_TAGS }) : `${chosen.length} / ${MAX_TEMPLATE_TAGS}`}
            </p>
          )}
        </div>

        <form onSubmit={submit} className="eb:flex eb:flex-col eb:gap-2.5 eb:border-t eb:border-border eb:pt-4" noValidate data-testid="eb-tags-form">
          <Label htmlFor="eb-tag-label">{editing ? t('Edit tag') : t('New tag')}</Label>
          <Input
            id="eb-tag-label"
            value={form.label}
            maxLength={TAG_LIMITS.label}
            placeholder={t('Name')}
            onChange={(event) => {
              setForm((f) => ({ ...f, label: event.target.value }));
              setErrors((e) => ({ ...e, label: undefined }));
            }}
            aria-invalid={errors.label ? true : undefined}
            aria-describedby={errors.label ? 'eb-tag-label-error' : undefined}
          />
          {errors.label && (
            <p id="eb-tag-label-error" className="eb:m-0 eb:text-[12px] eb:text-destructive">
              {errors.label}
            </p>
          )}
          <div className="eb:flex eb:flex-wrap eb:items-center eb:gap-3">
            <div role="radiogroup" aria-label={t('Color')} className="eb:flex eb:flex-wrap eb:gap-1.5">
              {TAG_COLORS.map((color) => {
                const picked = form.color === color;
                return (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    aria-label={colorName[color]}
                    title={colorName[color]}
                    onClick={() => setForm((f) => ({ ...f, color }))}
                    className={cn(
                      'eb:flex eb:size-6 eb:items-center eb:justify-center eb:rounded-full eb:text-white eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
                      TAG_SWATCHES[color],
                      picked && 'eb:ring-2 eb:ring-foreground/60 eb:ring-offset-2 eb:ring-offset-background'
                    )}
                  >
                    {picked && <Check className="eb:size-3.5" />}
                  </button>
                );
              })}
            </div>
            <div className="eb:ml-auto eb:flex eb:gap-2">
              {editing && (
                <Button variant="outline" size="sm" onClick={() => reset()} disabled={busy !== null}>
                  {t('Cancel')}
                </Button>
              )}
              <Button type="submit" size="sm" variant={editing ? 'default' : 'outline'} disabled={busy !== null}>
                {busy === 'form' && <Loader2 className="eb:animate-spin" />}
                {editing ? t('Save') : t('Create')}
              </Button>
            </div>
          </div>
          {form.label.trim() && !errors.label && (
            <p className="eb:m-0 eb:flex eb:items-center eb:gap-2 eb:text-[11.5px] eb:text-foreground-muted">
              {t('Preview')}
              <TagBadge tag={{ id: 'preview', label: form.label.trim(), color: form.color }} className="eb:text-[12px]" />
            </p>
          )}
        </form>

        {failure && (
          <p role="alert" className="eb:m-0 eb:text-[12.5px] eb:text-destructive">
            {failure}
          </p>
        )}

        <div className="eb:flex eb:justify-end">
          <Button onClick={() => onOpenChange(false)}>{t('Done')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
