import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, Sparkles, TriangleAlert } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Textarea } from '../../ui/primitives/fields.jsx';
import { SectionLabel } from '../../ui/primitives/misc.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { MAX_DETAILS_LENGTH } from './generator.js';
import { purposesByCategory } from './purposes.js';

/**
 * GENERATE — toolbar button and dialog: an email written from scratch.
 *
 * One decision for the user: what the email is for (a badge). Details are
 * optional; the language is the interface's, the sender and the variables
 * are the builder's own. The dialog says up front that the email in the
 * editor will be replaced — no confirmation after a minute of waiting.
 *
 * The result REPLACES the email in the editor, subject and preview text
 * included (they belong to the new email); the name is filled when empty.
 * A saved template counts as modified: the next save keeps it.
 */

/** Lowercase, without accents: "Été" matches "ete". @param {string} text */
const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function GenerateButton({ context }) {
  const { editor, ready, storage, isDirty, markDirty, template, setMeta, variables, sender } = context;
  const { t, locale, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState(/** @type {string|null} */ (null));
  const [details, setDetails] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [dirty, setDirty] = useState(false);
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const searchRef = useRef(/** @type {HTMLInputElement|null} */ (null));

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!busy) return undefined;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const groups = useMemo(() => {
    const words = fold(query.trim()).split(/\s+/).filter(Boolean);
    return purposesByCategory()
      .map((group) => ({
        ...group,
        purposes: group.purposes.filter((entry) => {
          const label = fold(`${t(entry.label)} ${entry.label} ${t(group.label)}`);
          return words.every((word) => label.includes(word));
        }),
      }))
      .filter((group) => group.purposes.length > 0);
  }, [query, t]);

  const openDialog = () => {
    setError('');
    setDirty(isDirty());
    setOpen(true);
  };

  const close = (next) => {
    if (next) return;
    abortRef.current?.abort();
    setOpen(false);
  };

  const generate = async () => {
    if (busy || (!purpose && !details.trim())) return;
    setError('');
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const email = await storage.generate(
        {
          purpose,
          details: details.trim(),
          language: String(locale || 'en').slice(0, 2),
          sender: sender || {},
          variables: (variables || []).map((variable) => ({ key: variable.key, label: variable.label })),
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      editor.loadMjml(email.mjml);
      setMeta((meta) => ({
        ...meta,
        name: meta.name || email.name,
        subject: email.subject || meta.subject,
        preheader: email.preheader || meta.preheader,
      }));
      if (template.id) markDirty();
      setOpen(false);
      notify('success', t('Your email is ready. Edit anything, then save.'));
    } catch (err) {
      if (!controller.signal.aborted) setError(t(err?.message || 'The email could not be generated.'));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setBusy(false);
  };

  const canGenerate = Boolean(purpose || details.trim());

  return (
    <>
      <Button variant="outline" size="sm-compact" disabled={!ready} onClick={openDialog}>
        <Sparkles />
        {t('Generate')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="eb:flex eb:max-h-[calc(100dvh-2rem)] eb:flex-col eb:gap-0 eb:p-0 eb:sm:max-w-2xl"
          data-testid="eb-generate"
          onOpenAutoFocus={(event) => {
            // The search field rather than the first badge.
            event.preventDefault();
            searchRef.current?.focus();
          }}
        >
          <DialogHeader className="eb:gap-1.5 eb:px-6 eb:pt-6 eb:pb-3">
            <DialogTitle>{t('Generate an email')}</DialogTitle>
            <DialogDescription>{t('Pick what it is for. AI writes a complete email that opens here, ready to edit.')}</DialogDescription>
          </DialogHeader>

          <div className="eb:px-6 eb:pb-3">
            <div className="eb:relative">
              <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" aria-hidden="true" />
              <Input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('Search: sale, password, birthday…')}
                aria-label={t('Search')}
                className="eb:pl-8"
                disabled={busy}
              />
            </div>
          </div>

          {/* The scroll box is a div: a fieldset does not clip its overflow
              as a flex item, and the badges would run under the footer. */}
          <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:border-y eb:border-border eb:px-6 eb:py-4" data-testid="eb-generate-purposes">
            <fieldset disabled={busy} className="eb:m-0 eb:min-w-0 eb:border-0 eb:p-0">
              <legend className="eb:sr-only">{t('What is the email for?')}</legend>
              {groups.length === 0 && (
                <p className="eb:py-6 eb:text-center eb:text-[13px] eb:text-foreground-muted">
                  {t('Nothing matches. Describe your email in the details below.')}
                </p>
              )}
              <div className="eb:flex eb:flex-col eb:gap-4">
                {groups.map((group) => (
                  <section key={group.id} className="eb:flex eb:flex-col eb:gap-2" aria-label={t(group.label)}>
                    <SectionLabel>{t(group.label)}</SectionLabel>
                    <div className="eb:flex eb:flex-wrap eb:gap-1.5">
                      {group.purposes.map((entry) => {
                        const selected = purpose === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            aria-pressed={selected}
                            data-purpose={entry.id}
                            onClick={() => setPurpose(selected ? null : entry.id)}
                            className={cn(
                              'eb:inline-flex eb:h-7 eb:items-center eb:gap-1 eb:rounded-full eb:border eb:px-3 eb:text-[12px] eb:font-medium eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50 eb:disabled:opacity-50',
                              selected
                                ? 'eb:border-primary eb:bg-primary eb:text-primary-foreground'
                                : 'eb:border-border eb:bg-background eb:text-foreground eb:hover:border-primary/50 eb:hover:bg-primary/5'
                            )}
                          >
                            {selected && <Check className="eb:size-3" aria-hidden="true" />}
                            {t(entry.label)}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="eb:flex eb:flex-col eb:gap-3 eb:px-6 eb:pt-3 eb:pb-6">
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, MAX_DETAILS_LENGTH))}
              placeholder={t('Details (optional): product, dates, offer, tone, language…')}
              aria-label={t('Details (optional)')}
              rows={2}
              className="eb:min-h-14"
              disabled={busy}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) generate();
              }}
            />
            {error ? (
              <p role="alert" className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-destructive">
                <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : (
              dirty &&
              !busy && (
                <p className="eb:text-[12px] eb:text-foreground-muted">{t('The email being edited will be replaced, unsaved changes included.')}</p>
              )
            )}
            <div className="eb:flex eb:items-center eb:justify-end eb:gap-2">
              {busy && (
                <p className="eb:mr-auto eb:text-[12px] eb:text-foreground-muted" role="status" aria-live="polite">
                  {t('Writing your email… {seconds} s', { seconds })}
                </p>
              )}
              {busy && (
                <Button variant="outline" size="sm" onClick={cancel}>
                  {t('Cancel')}
                </Button>
              )}
              <Button size="sm" onClick={generate} disabled={!canGenerate || busy} data-testid="eb-generate-submit">
                {busy ? <Loader2 className="eb:animate-spin" /> : <Sparkles />}
                {t('Generate')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
