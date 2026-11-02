import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Plus, Search, Send, X, XCircle } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { SectionLabel } from '../../ui/primitives/misc.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';
import { EmailPreview } from '../preview/PreviewButton.jsx';

/**
 * TEST SEND — the only real layout check: a browser preview says nothing about
 * what Outlook will do. Sends the MJML on screen, saved or not.
 *
 * Left, the email as the selected recipient will get it (server rendering,
 * when the storage can `render`). Right, the recipients, then a field that
 * finds the host's contacts (`storage.searchContacts`) or takes an address.
 *
 * A CONTACT gets its own values: the server reads them from its id, the
 * browser never sends them. A typed address gets sample values.
 *
 * The TYPED addresses are remembered in the browser for the next test; the
 * contacts are not: their names would stay in a browser others may use.
 */

const KEY = 'best-email-builder:test-addresses';
/** The server's default (`MAX_TEST_RECIPIENTS`). */
const MAX_RECIPIENTS = 10;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * @typedef {{key: string, email: string, contactId?: string, label?: string|null, detail?: string|null}} Recipient
 */

/** @param {string} email @returns {Recipient} */
const typed = (email) => ({ key: `e:${email}`, email });

/** @param {{id: string, email: string, label?: string|null, detail?: string|null}} contact @returns {Recipient} */
const picked = (contact) => ({
  key: `c:${contact.id}`,
  email: String(contact.email || '').trim().toLowerCase(),
  contactId: String(contact.id),
  label: contact.label || null,
  detail: contact.detail || null,
});

const splitAddresses = (text) =>
  String(text || '')
    .split(/[,;\s]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => EMAIL_SHAPE.test(a));

/** The typed addresses of the last test, else the host's reviewers. @param {string[]} fallback @returns {Recipient[]} */
function readRecipients(fallback) {
  let saved = null;
  try {
    saved = window.localStorage.getItem(KEY);
  } catch {
    /* private browsing: nothing remembered */
  }
  return [...new Set(splitAddresses(saved ?? fallback.join(',')))].slice(0, MAX_RECIPIENTS).map(typed);
}

/** @param {Recipient[]} recipients */
function rememberAddresses(recipients) {
  try {
    window.localStorage.setItem(
      KEY,
      recipients
        .filter((r) => !r.contactId)
        .map((r) => r.email)
        .join(', ')
    );
  } catch {
    /* private browsing: nothing to remember */
  }
}

export default function TestEmailButton({ context }) {
  const { editor, ready, meta, storage, testRecipients = [] } = context;
  const { t, notify } = useUi();
  const canPreview = typeof storage.render === 'function';
  const canSearch = typeof storage.searchContacts === 'function';

  const [open, setOpen] = useState(false);
  const [mjml, setMjml] = useState('');
  /** @type {[Recipient[], Function]} */
  const [recipients, setRecipients] = useState([]);
  const [focus, setFocus] = useState(/** @type {string|null} */ (null));
  const [query, setQuery] = useState('');
  // `query`: what the items were found for — Enter never takes a previous search's.
  const [found, setFound] = useState({ query: null, loading: false, items: [], error: null });
  const [device, setDevice] = useState('desktop');
  const [preview, setPreview] = useState({ loading: false, html: '', error: null });
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const renderRun = useRef(0);

  const focused = recipients.find((r) => r.key === focus) || recipients[0] || null;
  const full = recipients.length >= MAX_RECIPIENTS;
  const term = query.trim().toLowerCase();
  const typedAddress = EMAIL_SHAPE.test(term) && !recipients.some((r) => r.email === term) ? term : null;

  // Contacts matching the field, a moment after the last key.
  useEffect(() => {
    if (!open || !canSearch) return undefined;
    const controller = new AbortController();
    setFound((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      storage
        .searchContacts(query, { signal: controller.signal })
        .then((items) => setFound({ query, loading: false, items: Array.isArray(items) ? items : [], error: null }))
        .catch((error) => {
          if (!controller.signal.aborted) setFound({ query, loading: false, items: [], error: error.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, canSearch, storage, query]);

  // The email as the selected recipient gets it.
  const focusedKey = focused?.key ?? null;
  useEffect(() => {
    if (!open || !canPreview || !mjml) return;
    const run = ++renderRun.current;
    setPreview((s) => ({ ...s, loading: true, error: null }));
    storage
      .render({
        mjml,
        subject: meta.subject,
        preheader: meta.preheader,
        contactId: focused?.contactId ?? null,
        email: focused && !focused.contactId ? focused.email : null,
      })
      .then((data) => run === renderRun.current && setPreview({ loading: false, html: data.html, error: null }))
      .catch((error) => run === renderRun.current && setPreview({ loading: false, html: '', error: error.message }));
    // `focused` is read through its key: a new array of the same recipients renders nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canPreview, storage, mjml, meta.subject, meta.preheader, focusedKey]);

  /**
   * Adds the ones not there yet (up to the limit); the last one is previewed.
   * A contact takes the place of the same address typed: its values, not samples.
   * @param {Recipient[]} list
   */
  const addAll = (list) => {
    setReport(null);
    const next = [...recipients];
    let last = null;
    for (const recipient of list) {
      const at = next.findIndex((r) => r.key === recipient.key || r.email === recipient.email);
      const same = next[at];
      if (same && recipient.contactId && !same.contactId) {
        next[at] = recipient;
        last = recipient.key;
      } else if (same) last = same.key;
      else if (next.length < MAX_RECIPIENTS) {
        next.push(recipient);
        last = recipient.key;
      }
    }
    setRecipients(next);
    if (last) setFocus(last);
  };
  const add = (recipient) => addAll([recipient]);

  const remove = (key) => {
    setReport(null);
    setRecipients(recipients.filter((r) => r.key !== key));
    if (focus === key) setFocus(null);
  };

  // Enter: the addresses typed (several at once, pasted), else the only contact found.
  const onKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const tokens = query.split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter(Boolean);
    const addresses = tokens.filter((a) => EMAIL_SHAPE.test(a));
    if (addresses.length) {
      addAll(addresses.map(typed));
      setQuery(tokens.filter((a) => !EMAIL_SHAPE.test(a)).join(', '));
    } else if (canSearch && found.query === query && !found.loading && found.items.length === 1) {
      add(picked(found.items[0]));
    }
  };

  const send = async () => {
    if (!recipients.length) return;
    rememberAddresses(recipients);
    setSending(true);
    setReport(null);
    try {
      const result = await storage.sendTest({
        mjml: editor.exportMjml(),
        subject: meta.subject,
        preheader: meta.preheader,
        emails: recipients.filter((r) => !r.contactId).map((r) => r.email),
        contacts: recipients.filter((r) => r.contactId).map((r) => r.contactId),
      });
      setReport(result);
      if (result.failed > 0) notify('warning', t('{sent} sent, {failed} failed.', { sent: result.sent, failed: result.failed }));
      else notify('success', t('{sent} test(s) sent — check your inbox.', { sent: result.sent }));
    } catch (error) {
      notify('error', error.message);
    } finally {
      setSending(false);
    }
  };

  /** A recipient's outcome: sent, failed, or a contact the server no longer gives. */
  const resultOf = (r) =>
    r.contactId && report?.skipped?.includes(r.contactId)
      ? { ok: false, error: t('This contact is no longer available') }
      : report?.results?.find((x) => x.email === r.email) || null;

  return (
    <>
      <Button
        variant="outline"
        size="sm-compact"
        disabled={!ready}
        onClick={() => {
          setRecipients(readRecipients(testRecipients));
          setFocus(null);
          setQuery('');
          setReport(null);
          setPreview({ loading: false, html: '', error: null });
          setMjml(editor.exportMjml());
          setOpen(true);
        }}
      >
        <Send />
        {t('Test')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn(
            'eb:flex eb:flex-col eb:gap-4',
            canPreview ? 'eb:h-[85vh] eb:max-h-[85vh] eb:sm:max-w-[67.2rem]' : 'eb:max-h-[85vh] eb:sm:max-w-[460px]'
          )}
        >
          <DialogHeader>
            <div className="eb:flex eb:items-center eb:gap-3">
              <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
                <Send className="eb:size-5" />
              </span>
              <div>
                <DialogTitle className="eb:text-base eb:font-normal">{t('Send a test')}</DialogTitle>
                <DialogDescription className="eb:text-[13px]">
                  {canSearch ? t('The email on screen, with each contact’s values.') : t('The email on screen, to reviewers’ addresses.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div
            className={cn(
              'eb:grid eb:min-h-0 eb:flex-1 eb:gap-4',
              canPreview && 'eb:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] eb:md:grid-cols-[minmax(0,1fr)_320px] eb:md:grid-rows-1'
            )}
          >
            {canPreview && (
              <EmailPreview
                html={preview.html}
                loading={preview.loading}
                error={preview.error}
                device={device}
                onDeviceChange={setDevice}
                hint={false}
              />
            )}

            <aside className="eb:flex eb:min-h-0 eb:flex-col eb:gap-3" aria-label={t('Recipients')}>
              <section className="eb:flex eb:max-h-[45%] eb:min-h-0 eb:shrink-0 eb:flex-col eb:gap-1.5">
                <SectionLabel>
                  {t('Recipients')} · {recipients.length}/{MAX_RECIPIENTS}
                </SectionLabel>
                {recipients.length ? (
                  <ul className="eb:min-h-0 eb:space-y-1 eb:overflow-y-auto" data-testid="eb-test-recipients">
                    {recipients.map((r) => {
                      const result = resultOf(r);
                      const current = canPreview && focused?.key === r.key;
                      return (
                        <li
                          key={r.key}
                          className={cn(
                            'eb:flex eb:items-center eb:gap-1 eb:rounded-lg2 eb:border eb:px-1.5 eb:py-1',
                            current ? 'eb:border-primary/40 eb:bg-primary/5' : 'eb:border-border'
                          )}
                        >
                          <button
                            type="button"
                            className="eb:flex eb:min-w-0 eb:flex-1 eb:items-center eb:gap-1.5 eb:text-left"
                            onClick={() => setFocus(r.key)}
                            aria-pressed={current}
                            title={canPreview ? t('Preview with these values') : undefined}
                            disabled={!canPreview}
                          >
                            {result ? (
                              result.ok ? (
                                <CheckCircle2 className="eb:size-3.5 eb:shrink-0 eb:text-success" aria-label={t('Sent')} />
                              ) : (
                                <XCircle className="eb:size-3.5 eb:shrink-0 eb:text-destructive" aria-label={result.error || ''} />
                              )
                            ) : (
                              canPreview && (
                                <Eye
                                  className={cn('eb:size-3.5 eb:shrink-0', current ? 'eb:text-primary' : 'eb:text-foreground-muted/50')}
                                  aria-hidden="true"
                                />
                              )
                            )}
                            <span className="eb:min-w-0">
                              <span className="eb:block eb:truncate eb:text-[12px] eb:text-foreground">{r.label || r.email}</span>
                              <span className="eb:block eb:truncate eb:text-[11px] eb:text-foreground-muted">
                                {r.contactId ? r.email : t('Sample values')}
                              </span>
                              {result?.error && <span className="eb:block eb:text-[11px] eb:text-destructive">{result.error}</span>}
                            </span>
                          </button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t('Remove {email}', { email: r.email })}
                            title={t('Remove')}
                            onClick={() => remove(r.key)}
                          >
                            <X />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="eb:text-[12px] eb:text-foreground-lighter">{t('No recipient yet.')}</p>
                )}
                {report?.invalid?.map((email) => (
                  <p key={`invalid-${email}`} className="eb:text-[12px] eb:text-foreground-muted">
                    {t('Ignored (invalid): {email}', { email })}
                  </p>
                ))}
              </section>

              <section className="eb:flex eb:min-h-0 eb:flex-1 eb:flex-col eb:gap-1.5">
                <Label htmlFor="eb-test-find">{canSearch ? t('Find a contact') : t('Addresses')}</Label>
                <div className="eb:relative">
                  <Search
                    className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted"
                    aria-hidden="true"
                  />
                  <Input
                    id="eb-test-find"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={canSearch ? t('Name, company or address') : 'jane@example.com'}
                    className="eb:h-8 eb:pl-8"
                    autoComplete="off"
                    disabled={full}
                  />
                </div>
                {full && <p className="eb:text-[11px] eb:text-foreground-muted">{t('{max} test addresses at most', { max: MAX_RECIPIENTS })}</p>}
                <ul className="eb:min-h-0 eb:flex-1 eb:space-y-0.5 eb:overflow-y-auto" aria-label={t('Search results')} data-testid="eb-test-contacts">
                  {typedAddress && (
                    <li>
                      <button
                        type="button"
                        disabled={full}
                        onClick={() => {
                          add(typed(typedAddress));
                          setQuery('');
                        }}
                        className="eb:flex eb:w-full eb:items-center eb:gap-1.5 eb:rounded-lg2 eb:px-2 eb:py-1.5 eb:text-left eb:text-[12px] eb:text-foreground eb:hover:bg-surface-200 eb:disabled:opacity-50"
                      >
                        <Plus className="eb:size-3.5 eb:shrink-0 eb:text-primary" aria-hidden="true" />
                        <span className="eb:truncate">{t('Add “{email}”', { email: typedAddress })}</span>
                      </button>
                    </li>
                  )}
                  {canSearch &&
                    found.items.map((contact) => {
                      const added = recipients.some((r) => r.contactId === String(contact.id));
                      return (
                        <li key={contact.id}>
                          <button
                            type="button"
                            disabled={full && !added}
                            onClick={() => add(picked(contact))}
                            className="eb:flex eb:w-full eb:items-center eb:gap-1.5 eb:rounded-lg2 eb:px-2 eb:py-1.5 eb:text-left eb:hover:bg-surface-200 eb:disabled:opacity-50"
                          >
                            <span className="eb:min-w-0 eb:flex-1">
                              <span className="eb:block eb:truncate eb:text-[12px] eb:text-foreground">{contact.label || contact.email}</span>
                              <span className="eb:block eb:truncate eb:text-[11px] eb:text-foreground-muted">
                                {[contact.label ? contact.email : null, contact.detail].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            {added ? (
                              <CheckCircle2 className="eb:size-3.5 eb:shrink-0 eb:text-success" aria-label={t('Added')} />
                            ) : (
                              <Plus className="eb:size-3.5 eb:shrink-0 eb:text-foreground-muted" aria-hidden="true" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  {canSearch && !found.loading && !found.error && !found.items.length && !typedAddress && (
                    <li className="eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-foreground-lighter">{t('No contact found.')}</li>
                  )}
                  {canSearch && found.loading && !found.items.length && (
                    <li className="eb:flex eb:items-center eb:gap-1.5 eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-foreground-lighter">
                      <Loader2 className="eb:size-3.5 eb:animate-spin" aria-hidden="true" />
                      {t('Searching…')}
                    </li>
                  )}
                  {found.error && <li className="eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-destructive">{found.error}</li>}
                </ul>
              </section>

              <div className="eb:flex eb:shrink-0 eb:justify-end eb:gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  {t('Close')}
                </Button>
                <Button onClick={send} disabled={sending || !recipients.length}>
                  {sending ? <Loader2 className="eb:animate-spin" /> : <Send />}
                  {t('Send')}
                </Button>
              </div>
            </aside>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
