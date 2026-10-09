import { useState } from 'react';
import { History } from 'lucide-react';
import { Button } from '../../ui/primitives/button.jsx';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/primitives/overlays.jsx';
import { Skeleton } from '../../ui/primitives/misc.jsx';
import { useUi } from '../../ui/context.jsx';

/**
 * VERSIONS of a template — toolbar button.
 *
 * Every explicit "Save" creates a version (autosave never does). Restoring
 * RELOADS the version into the editor without writing anything: the next save
 * makes it current, by creating one more version. History is never rewritten.
 */

function formatWhen(value, locale) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function VersionsMenu({ context }) {
  const { editor, storage, template, isDirty, markDirty, ready } = context;
  const { t, confirm, notify, locale } = useUi();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(null);

  const load = async () => {
    setVersions(null);
    setError(null);
    try {
      setVersions(await storage.listVersions(template.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const restore = async (version) => {
    if (isDirty()) {
      const ok = await confirm({
        title: t('Restore version {n}?', { n: version.versionNumber }),
        description: t('Unsaved changes will be replaced.'),
        confirmLabel: t('Restore'),
        destructive: true,
      });
      if (!ok) return;
    }
    setRestoring(version.id);
    try {
      const full = await storage.getVersion(template.id, version.id);
      editor.loadDocument(full.document);
      markDirty();
      setOpen(false);
      notify('success', t('Version {n} restored — save to keep it.', { n: version.versionNumber }));
    } catch (e) {
      notify('error', e.message);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm-compact"
          disabled={!ready || !template.id}
          title={!template.id ? t('Save the template first') : undefined}
        >
          <History />
          {t('Versions')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="mb:w-80 mb:p-0">
        <div className="mb:border-b mb:border-border mb:px-3 mb:py-2.5 mb:text-[13px] mb:font-medium mb:text-foreground">
          {t('Versions')}
        </div>
        <div className="mb:max-h-[320px] mb:overflow-y-auto mb:p-1" aria-busy={versions === null && !error}>
          {error ? (
            <p role="alert" className="mb:px-2 mb:py-1.5 mb:text-[12px] mb:text-destructive">
              {error}
            </p>
          ) : versions === null ? (
            <div className="mb:space-y-1 mb:p-1" aria-hidden="true">
              <Skeleton className="mb:h-8 mb:w-40" />
              <Skeleton className="mb:h-8 mb:w-32" />
              <Skeleton className="mb:h-8 mb:w-36" />
            </div>
          ) : versions.length === 0 ? (
            <p className="mb:px-2 mb:py-1.5 mb:text-[12px] mb:text-foreground-muted">{t('No versions yet.')}</p>
          ) : (
            versions.map((version, index) => (
              <div
                key={version.id}
                className="mb:flex mb:items-center mb:gap-2 mb:rounded-lg2 mb:px-2 mb:py-1.5 mb:hover:bg-surface-100"
              >
                <div className="mb:min-w-0 mb:flex-1">
                  <p className="mb:text-[13px] mb:text-foreground">
                    {t('Version {n}', { n: version.versionNumber })}
                    {index === 0 && <span className="mb:ml-1.5 mb:text-[11px] mb:text-foreground-muted">{t('current')}</span>}
                  </p>
                  <p className="mb:text-[11px] mb:tabular-nums mb:text-foreground-muted">
                    {formatWhen(version.createdAt, locale)}
                    {version.createdBy ? ` · ${version.createdBy}` : ''}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={restoring !== null}
                  onClick={() => restore(version)}
                  aria-label={t('Restore version {n}', { n: version.versionNumber })}
                >
                  {t('Restore')}
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
