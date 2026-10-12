import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { createDefaultEmailEditor } from '../index.js';
import { emailBuilderFeatures, isFeatureEnabled } from '../features/index.js';
import { DEFAULT_VARIABLES, defineVariables, mergeVariables } from '../features/variables/catalog.js';
import { createStarterMjml } from '../features/templates/starter.js';
import { TEMPLATE_GALLERY, buildGallery } from '../features/templates/gallery.js';
import { createAutosaveScheduler } from '../features/autosave/scheduler.js';
import { clearLocalDraft, readLocalDraft, saveLocalDraft } from '../features/autosave/localDraft.js';
import { createHttpStorage } from '../storage/client.js';
import { NoticeArea, UiProvider, useUi } from './context.jsx';
import { Button } from './primitives/button.jsx';
import { cn } from './primitives/cn.js';
import EmailCanvas from './EmailCanvas.jsx';
import BlockSidebar from './BlockSidebar.jsx';
import ElementActions from './ElementActions.jsx';
import PropertiesPanel from './PropertiesPanel.jsx';
import Toolbar from './Toolbar.jsx';
import { useEmailEditorState } from './useEmailEditorState.js';

/**
 * THE EMAIL BUILDER — the screen.
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ Back · name            ↶ ↷  Desktop|Mobile   …  Save          │
 *   ├────────────┬───────────────────────────────┬──────────────────┤
 *   │ Blocks     │            canvas             │ Properties       │
 *   └────────────┴───────────────────────────────┴──────────────────┘
 *
 * Only talks to `EmailEditor` (core/EmailEditor.js) and to the storage
 * (storage/client.js). The engine is loaded when the canvas mounts.
 *
 * ── SAVE ────────────────────────────────────────────────────────────────────
 * "Save" (or Ctrl+S, inside the canvas too) sends the PROJECT and its MJML;
 * the server validates, compiles and creates a version. A template changed
 * elsewhere in the meantime is not overwritten: saving a copy is offered.
 *
 * ── INITIAL CONTENT (`initialMjml`, `initialMeta`) ──────────────────────────
 * A new template can start from given MJML instead of the starter template —
 * e.g. a template imported from another format. It counts as modified until
 * the first save.
 *
 * ── AUTOSAVE (feature `autosave`) ───────────────────────────────────────────
 * Template already saved: server save without a version. New template: local
 * draft, offered again at the next opening.
 */

const EMPTY_META = { name: '', subject: '', preheader: '', description: '' };

function metaOf(template) {
  return {
    name: template?.name || '',
    subject: template?.subject || '',
    preheader: template?.preheader || '',
    description: template?.description || '',
  };
}

const sameMeta = (a, b) => Object.keys(EMPTY_META).every((k) => (a[k] || '') === (b[k] || ''));

function Builder({
  editor: injected,
  storage: injectedStorage,
  templateId: initialTemplateId,
  variables: variablesProp,
  sender,
  starterMjml,
  templates: galleryProp,
  testRecipients,
  initialMjml,
  initialMeta,
  onClose,
  onSaved,
  onDirtyChange,
  dirtyCheckRef,
  className,
}) {
  const { t, locale, notify, confirm } = useUi();
  const editor = useMemo(() => injected || createDefaultEmailEditor({ locale }), [injected, locale]);
  const storage = useMemo(() => injectedStorage || createHttpStorage(), [injectedStorage]);
  const systemVariables = useMemo(() => defineVariables(variablesProp || DEFAULT_VARIABLES), [variablesProp]);
  const [customVariables, setCustomVariables] = useState([]);
  const variables = useMemo(() => mergeVariables(systemVariables, customVariables), [systemVariables, customVariables]);
  const canManageVariables = typeof storage.saveVariable === 'function' && typeof storage.listVariables === 'function';
  const reloadVariables = useCallback(async () => {
    if (typeof storage.listVariables !== 'function') return;
    try {
      setCustomVariables(await storage.listVariables());
    } catch (error) {
      notify('error', error.message);
    }
  }, [storage, notify]);
  useEffect(() => {
    reloadVariables();
  }, [reloadVariables]);
  const starter = useMemo(() => starterMjml || createStarterMjml({ sender, t }), [starterMjml, sender, t]);
  const templates = useMemo(
    () => buildGallery({ templates: galleryProp ?? TEMPLATE_GALLERY, sender: sender || {}, t }),
    [galleryProp, sender, t]
  );
  const services = useMemo(() => ({ uploadImage: (file) => storage.uploadImage(file) }), [storage]);
  const state = useEmailEditorState(editor);
  const autosaveOn = isFeatureEnabled('autosave');
  const autosaveOptions = emailBuilderFeatures.get('autosave')?.options || {};

  const [template, setTemplate] = useState({ id: initialTemplateId, revision: null, savedAt: null, auto: false });
  /** loading → (error) → ready ; `document`: project to mount (null = starter template). */
  const [boot, setBoot] = useState({ status: 'loading', document: null, draft: false, message: null });
  const [meta, setMeta] = useState(EMPTY_META);
  const [savedMeta, setSavedMeta] = useState(EMPTY_META);
  const [saving, setSaving] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [autosaveBlocked, setAutosaveBlocked] = useState(null);
  const [engineError, setEngineError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const ready = state.status === 'ready';
  const metaDirty = !sameMeta(meta, savedMeta);
  const dirty = state.dirty || metaDirty;

  const timeOf = useCallback(
    (date) => (date ? new Date(date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : ''),
    [locale]
  );

  /* ── Start: saved template, local draft, or starter template ── */
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      if (initialTemplateId) {
        try {
          const loaded = await storage.load(initialTemplateId);
          setMeta(metaOf(loaded));
          setSavedMeta(metaOf(loaded));
          setTemplate({ id: loaded.id, revision: loaded.revision, savedAt: null, auto: false });
          setBoot({ status: 'ready', document: loaded.document, draft: false, message: null });
        } catch (error) {
          setBoot({ status: 'error', document: null, draft: false, message: error.message });
        }
        return;
      }
      if (initialMjml) {
        setMeta({ ...EMPTY_META, ...initialMeta });
        setBoot({ status: 'ready', document: null, draft: true, message: null });
        return;
      }
      const draft = autosaveOn ? readLocalDraft() : null;
      if (draft) {
        const when = new Date(draft.savedAt).toLocaleString(locale, {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        const restore = await confirm({
          title: t('Resume the draft?'),
          description: t('Unsaved template from {when}.', { when }),
          confirmLabel: t('Resume'),
          cancelLabel: t('Start over'),
        });
        if (restore) {
          setMeta({ ...EMPTY_META, ...draft.meta });
          setBoot({ status: 'ready', document: draft.document, draft: true, message: null });
          return;
        }
        clearLocalDraft();
      }
      setBoot({ status: 'ready', document: null, draft: false, message: null });
    })();
    // Initial content is read once, at start-up, like `templateId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, storage, autosaveOn, confirm, t, locale]);

  const onReady = useCallback(() => {
    if (!boot.document) editor.loadMjml(initialMjml || starter);
  }, [editor, boot.document, starter, initialMjml]);

  // A resumed draft was never saved: it is "modified".
  const { markDirty, markClean, checkDirty } = state;
  useEffect(() => {
    if (ready && boot.draft) markDirty();
  }, [ready, boot.draft, markDirty]);

  /* ── Modified? (the host screen and "Back" need the immediate answer) ── */
  const isDirty = useCallback(
    () => (editor.status === 'ready' && checkDirty()) || metaDirty,
    [editor, checkDirty, metaDirty]
  );
  const reportDirty = useRef(onDirtyChange);
  reportDirty.current = onDirtyChange;
  useEffect(() => {
    reportDirty.current?.(dirty);
  }, [dirty]);
  useEffect(() => {
    if (!dirtyCheckRef) return undefined;
    dirtyCheckRef.current = isDirty;
    return () => {
      dirtyCheckRef.current = null;
    };
  }, [dirtyCheckRef, isDirty]);

  // Closing the tab with work in progress: the browser asks.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /* ── Save ────────────────────────────────────────────────────────────── */
  const savingRef = useRef(false);
  const latest = useRef({});
  latest.current = { template, meta, onSaved };

  const save = useCallback(
    async ({ auto = false } = {}) => {
      if (savingRef.current || editor.status !== 'ready') return false;
      const { template: current, meta: currentMeta } = latest.current;
      if (!currentMeta.name.trim()) {
        if (!auto) {
          setShowErrors(true);
          editor.select(null);
          notify('error', t('Give the template a name before saving it.'));
        }
        return false;
      }
      const document = editor.getDocument();
      const mjml = editor.exportMjml();
      const payload = { ...currentMeta, document, mjml };
      savingRef.current = true;
      setSaving(auto ? 'auto' : 'manual');
      try {
        const result = current.id
          ? await storage.save(current.id, { ...payload, revision: current.revision, createVersion: !auto })
          : await storage.create(payload);
        setTemplate({ id: result.template.id, revision: result.template.revision, savedAt: new Date(), auto });
        setSavedMeta(currentMeta);
        setShowErrors(false);
        setAutosaveBlocked(null);
        markClean(mjml);
        if (!current.id) clearLocalDraft();
        latest.current.onSaved?.(result.template);
        const warnings = result.warnings || [];
        if (warnings.length) {
          notify(
            'warning',
            t('Saved, with {count} MJML warning(s): {message}', { count: warnings.length, message: warnings[0].message })
          );
        } else if (!auto) {
          notify(
            'success',
            result.version ? t('Saved — version {n}.', { n: result.version.versionNumber }) : t('Template saved.')
          );
        }
        return true;
      } catch (error) {
        if (error.status === 409 && current.id) {
          if (auto) {
            setAutosaveBlocked(error.message);
            return false;
          }
          const copy = await confirm({
            title: t('Template changed in the meantime'),
            description: t('{message} Your version can be saved as a copy.', { message: error.message }),
            confirmLabel: t('Save a copy'),
          });
          if (!copy) return false;
          try {
            const result = await storage.create({
              ...payload,
              name: t('{name} (copy)', { name: currentMeta.name }).slice(0, 200),
            });
            const copyMeta = { ...currentMeta, name: result.template.name };
            setMeta(copyMeta);
            setSavedMeta(copyMeta);
            setTemplate({ id: result.template.id, revision: result.template.revision, savedAt: new Date(), auto: false });
            setAutosaveBlocked(null);
            markClean(mjml);
            latest.current.onSaved?.(result.template);
            notify('success', t('Copy saved: “{name}”.', { name: result.template.name }));
            return true;
          } catch (copyError) {
            notify('error', copyError.message);
            return false;
          }
        }
        if (auto) setAutosaveBlocked(error.message);
        else notify('error', error.message);
        return false;
      } finally {
        savingRef.current = false;
        setSaving(null);
      }
    },
    [editor, storage, markClean, notify, confirm, t]
  );

  // Ctrl+S: in the page (fields included) and in the canvas (iframe).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [save]);
  useEffect(() => {
    if (!ready) return undefined;
    return editor.addShortcut('save', 'mod+s', () => save());
  }, [ready, editor, save]);

  /* ── Autosave ────────────────────────────────────────────────────────── */
  const scheduler = useMemo(
    () =>
      createAutosaveScheduler({
        run: () => save({ auto: true }),
        idleMs: autosaveOptions.idleMs,
        maxWaitMs: autosaveOptions.maxWaitMs,
      }),
    [save, autosaveOptions.idleMs, autosaveOptions.maxWaitMs]
  );
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => {
    if (!autosaveOn || !ready || !template.id || autosaveBlocked) return;
    if (dirty) scheduler.notify();
    else scheduler.reset();
  }, [autosaveOn, ready, template.id, autosaveBlocked, dirty, state.changes, meta, scheduler]);

  // Never saved template: local draft.
  useEffect(() => {
    if (!autosaveOn || !ready || template.id || !dirty) return undefined;
    const timer = setTimeout(() => {
      if (editor.status === 'ready') saveLocalDraft({ document: editor.getDocument(), meta });
    }, autosaveOptions.draftDelayMs ?? 1500);
    return () => clearTimeout(timer);
  }, [autosaveOn, ready, template.id, dirty, state.changes, meta, editor, autosaveOptions.draftDelayMs]);

  /* ── Back ────────────────────────────────────────────────────────────── */
  const back = async () => {
    if (isDirty()) {
      const ok = await confirm({
        title: t('Leave the builder?'),
        description: template.id
          ? t('Unsaved changes will be lost.')
          : t('The draft will be offered again next time.'),
        confirmLabel: t('Leave'),
        destructive: true,
      });
      if (!ok) return;
    }
    onClose?.();
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  const status = !ready
    ? t('Loading…')
    : saving === 'manual'
      ? t('Saving…')
      : saving === 'auto'
        ? t('Autosaving…')
        : autosaveBlocked
          ? t('Autosave paused')
          : dirty
            ? t('Unsaved changes')
            : template.savedAt
              ? template.auto
                ? t('Autosaved at {time}', { time: timeOf(template.savedAt) })
                : t('Saved at {time}', { time: timeOf(template.savedAt) })
              : template.id
                ? t('Saved')
                : t('No changes');

  const featureContext = {
    editor,
    storage,
    template,
    meta,
    setMeta,
    templates,
    ready,
    isDirty,
    markDirty,
    save,
    variables,
    systemVariables,
    canManageVariables,
    reloadVariables,
    testRecipients,
  };
  const toolbarFeatures = emailBuilderFeatures.list(
    (f) => f.enabled !== false && Boolean(f.toolbar) && (f.isAvailable ? f.isAvailable(featureContext) : true)
  );

  return (
    <div
      className={cn('eb-root eb:relative eb:flex eb:h-full eb:min-h-0 eb:flex-col eb:bg-background eb:text-foreground', className)}
      data-testid="email-builder"
      data-status={state.status}
      data-template-id={template.id || ''}
    >
      <Toolbar
        title={meta.name}
        status={status}
        ready={ready}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={() => editor.undo()}
        onRedo={() => editor.redo()}
        device={state.device}
        onDeviceChange={(device) => editor.setDevice(device)}
        onBack={onClose ? back : undefined}
        actions={
          <>
            {toolbarFeatures.map((feature) => {
              const Action = feature.toolbar;
              return <Action key={feature.id} context={featureContext} />;
            })}
            <Button size="sm-compact" onClick={() => save()} disabled={!ready || saving !== null}>
              {saving === 'manual' ? <Loader2 className="eb:animate-spin" /> : <Save />}
              {t('Save')}
            </Button>
          </>
        }
      />
      <div className="eb:grid eb:min-h-0 eb:flex-1 eb:grid-cols-[224px_minmax(0,1fr)_296px] eb:grid-rows-1">
        <BlockSidebar editor={editor} disabled={!ready} />
        <div className="eb:relative eb:min-w-0 eb:bg-surface-75" aria-busy={!ready}>
          {boot.status === 'error' || engineError ? (
            <div role="alert" className="eb:flex eb:h-full eb:flex-col eb:items-center eb:justify-center eb:gap-2 eb:p-6 eb:text-center">
              <AlertTriangle className="eb:size-6 eb:text-destructive" aria-hidden="true" />
              <p className="eb:text-[13px] eb:text-foreground">
                {boot.status === 'error' ? t('The template could not be loaded.') : t('The builder could not start.')}
              </p>
              <p className="eb:max-w-sm eb:text-[12px] eb:text-foreground-muted">{boot.message || engineError}</p>
              {engineError && (
                <Button
                  variant="outline"
                  size="sm-compact"
                  onClick={() => {
                    setEngineError(null);
                    setAttempt((n) => n + 1);
                  }}
                >
                  {t('Retry')}
                </Button>
              )}
            </div>
          ) : (
            <>
              {boot.status === 'ready' && (
                <EmailCanvas
                  key={attempt}
                  editor={editor}
                  document={boot.document}
                  onReady={onReady}
                  onError={(error) => setEngineError(error.message)}
                />
              )}
              {!ready && (
                <div className="eb:absolute eb:inset-0 eb:flex eb:items-center eb:justify-center eb:bg-surface-75" role="status" aria-live="polite">
                  <Loader2 className="eb:size-6 eb:animate-spin eb:text-foreground-muted" aria-hidden="true" />
                  <span className="eb:sr-only">{t('Loading the builder')}</span>
                </div>
              )}
            </>
          )}
        </div>
        <PropertiesPanel
          editor={editor}
          selection={ready ? state.selection : null}
          meta={meta}
          onMetaChange={setMeta}
          changes={state.changes}
          showErrors={showErrors}
          actions={<ElementActions editor={editor} selection={state.selection} />}
          services={services}
          variables={variables}
        />
      </div>
      <NoticeArea />
    </div>
  );
}

/**
 * @param {{
 *   storage?: import('../storage/client.js').TemplateStorage,
 *   templateId?: string|number|null,
 *   editor?: import('../core/EmailEditor.js').EmailEditor,
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   onNotify?: (level: 'success'|'info'|'warning'|'error', message: string) => void,
 *   variables?: import('../features/variables/catalog.js').EmailVariable[],
 *   sender?: import('../features/templates/starter.js').StarterSender,
 *   starterMjml?: string,
 *   templates?: import('../features/templates/gallery.js').GalleryTemplate[],
 *   testRecipients?: string[],
 *   initialMjml?: string,
 *   initialMeta?: {name?: string, subject?: string, preheader?: string, description?: string},
 *   onClose?: () => void,
 *   onSaved?: (template: object) => void,
 *   onDirtyChange?: (dirty: boolean) => void,
 *   dirtyCheckRef?: {current: null | (() => boolean)},
 *   className?: string,
 * }} props
 */
export default function EmailBuilder({ locale = 'en', messages, onNotify, ...props }) {
  return (
    <UiProvider locale={locale} messages={messages} onNotify={onNotify}>
      <Builder {...props} templateId={props.templateId ?? null} />
    </UiProvider>
  );
}
