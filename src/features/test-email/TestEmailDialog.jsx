import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Plus, Search, Send, X, XCircle } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Input, Label } from '../../ui/primitives/fields.jsx';
import { SectionLabel } from '../../ui/primitives/misc.jsx';
import { cn } from '../../ui/primitives/cn.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/primitives/overlays.jsx';
import { EmailPreview } from '../preview/PreviewButton.jsx';

/**
 * TEST SEND — the only real layout check: a browser preview says nothing about
 * what Outlook will do. Sends the MJML on screen, saved or not.
 *
 * The preview's dialog, with the recipients beside it. Left, the email as the
 * selected recipient gets it (server rendering, when the storage can
 * `render`). Right, the host's contact lists (`storage.contactLists`)
 * and their contacts (`storage.searchContacts`), the recipients, and a field
 * for addresses typed by hand.
 *
 * A CONTACT gets its own values: the server reads them from its id, the
 * browser never sends them. A typed address gets sample values. While the
 * test leaves, the preview goes from one recipient to the next.
 *
 * The TYPED addresses are remembered in the browser for the next test; the
 * contacts are not: their names would stay in a browser others may use.
 */

const KEY = 'best-email-builder:test-addresses';
/** The server's default (`MAX_TEST_RECIPIENTS`). */
const MAX_RECIPIENTS = 10;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Every contact, in no list (a Select item cannot be ''). */
const ALL = '*';
/** How long each recipient's email stays on screen while the test leaves. */
const SENDING_STEP_MS = 1200;
/** The rendering with sample values, before any recipient. */
const NOBODY = '';

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

const EMPTY_RENDER = { loading: false, html: '', subject: null, preheader: null, values: null, warnings: [], quality: [], error: null };

/**
 * The test dialog alone, for a host's own button (a campaign, say).
 * `getMjml` gives the email at opening and on "Refresh"; it is handed back to
 * `storage.render` and `storage.sendTest` as `mjml`, so a host whose email is
 * not MJML passes its own source and reads it there.
 * @param {{open: boolean, onOpenChange: (open: boolean) => void, storage: any, getMjml: () => string, meta?: {subject?: string|null, preheader?: string|null}, testRecipients?: string[]}} props
 */
export function TestEmailDialog({ open, onOpenChange, storage, getMjml, meta = {}, testRecipients = [] }) {
  const { t, notify } = useUi();
  const setOpen = onOpenChange;
  const canPreview = typeof storage.render === 'function';
  const canSearch = typeof storage.searchContacts === 'function';
  const canList = canSearch && typeof storage.contactLists === 'function';

  const [mjml, setMjml] = useState('');
  /** @type {[Recipient[], Function]} */
  const [recipients, setRecipients] = useState([]);
  const [focus, setFocus] = useState(/** @type {string|null} */ (null));
  const [lists, setLists] = useState({ loading: false, items: [], error: null });
  const [list, setList] = useState(ALL);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState({ loading: false, items: [], error: null });
  const [addresses, setAddresses] = useState('');
  const [device, setDevice] = useState('desktop');
  // One rendering per recipient, kept while the dialog is open: going back to one is instant.
  const [renders, setRenders] = useState(/** @type {Record<string, any>} */ ({}));
  // Bumped by "Refresh": every recipient renders again.
  const [round, setRound] = useState(0);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);
  const rendering = useRef(new Set());
  // Bumped on opening and on "Refresh": a rendering of before is dropped.
  const generation = useRef(0);

  const focused = recipients.find((r) => r.key === focus) || recipients[0] || null;
  // No recipient yet: the email with sample values.
  const shownKey = focused?.key ?? NOBODY;
  const shown = renders[shownKey] || (canPreview && mjml ? { ...EMPTY_RENDER, loading: true } : EMPTY_RENDER);
  const full = recipients.length >= MAX_RECIPIENTS;

  // The host's lists, once per opening.
  useEffect(() => {
    if (!open || !canList) return undefined;
    const controller = new AbortController();
    setLists((s) => ({ ...s, loading: true, error: null }));
    storage
      .contactLists({ signal: controller.signal })
      .then((items) => setLists({ loading: false, items: Array.isArray(items) ? items : [], error: null }))
      .catch((error) => {
        if (!controller.signal.aborted) setLists({ loading: false, items: [], error: error.message });
      });
    return () => controller.abort();
  }, [open, canList, storage]);

  // The contacts of the list, matching the field, a moment after the last key.
  useEffect(() => {
    if (!open || !canSearch) return undefined;
    const controller = new AbortController();
    setFound((s) => ({ ...s, loading: true, error: null }));
    const timer = setTimeout(() => {
      storage
        .searchContacts(query, { list: list === ALL ? null : list, signal: controller.signal })
        .then((items) => setFound({ loading: false, items: Array.isArray(items) ? items : [], error: null }))
        .catch((error) => {
          if (!controller.signal.aborted) setFound({ loading: false, items: [], error: error.message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, canSearch, storage, query, list]);

  /** Renders a recipient's email (null: samples), unless it is there or on its way. @param {Recipient|null} r */
  const renderFor = (r) => {
    const key = r?.key ?? NOBODY;
    // A failed rendering is tried again when its recipient is shown again.
    if (!canPreview || !mjml || (renders[key] && !renders[key].error) || rendering.current.has(key)) return;
    rendering.current.add(key);
    const run = generation.current;
    storage
      .render({
        mjml,
        subject: meta.subject,
        preheader: meta.preheader,
        contactId: r?.contactId ?? null,
        email: r && !r.contactId ? r.email : null,
      })
      .then((data) => ({ ...EMPTY_RENDER, ...data, warnings: data.warnings || [], quality: data.quality || [] }))
      .catch((error) => ({ ...EMPTY_RENDER, error: error.message }))
      .then((result) => {
        if (run !== generation.current) return;
        rendering.current.delete(key);
        setRenders((all) => ({ ...all, [key]: result }));
      });
  };

  // The email as the selected recipient gets it.
  useEffect(() => {
    if (open) renderFor(focused);
    // `renderFor` reads the state it needs; the focused recipient is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, focused?.key, mjml, round]);

  const refresh = () => {
    generation.current += 1;
    rendering.current.clear();
    setRenders({});
    setMjml(getMjml());
    setRound((n) => n + 1);
  };

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

  const remove = (key) => {
    setReport(null);
    setRecipients(recipients.filter((r) => r.key !== key));
    if (focus === key) setFocus(null);
  };

  // A contact of the list: in, or out when it is in already. Not while a test leaves.
  const toggle = (contact) => {
    if (sending) return;
    const there = recipients.find((r) => r.contactId === String(contact.id));
    if (there) remove(there.key);
    else addAll([picked(contact)]);
  };

  // The addresses typed (several at once, pasted); what is not one stays in the field.
  const addTyped = () => {
    if (sending) return;
    const tokens = addresses.split(/[,;\s]+/).map((a) => a.trim().toLowerCase()).filter(Boolean);
    const valid = tokens.filter((a) => EMAIL_SHAPE.test(a));
    if (!valid.length) return;
    addAll(valid.map(typed));
    setAddresses(tokens.filter((a) => !EMAIL_SHAPE.test(a)).join(', '));
  };

  const send = async () => {
    if (!recipients.length) return;
    rememberAddresses(recipients);
    setSending(true);
    setReport(null);
    // The preview goes through the recipients while the test leaves.
    const order = recipients.map((r) => r.key);
    let step = 0;
    setFocus(order[0]);
    const timer = setInterval(() => {
      step = (step + 1) % order.length;
      setFocus(order[step]);
    }, SENDING_STEP_MS);
    try {
      const result = await storage.sendTest({
        mjml: getMjml(),
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
      clearInterval(timer);
      setSending(false);
    }
  };

  /** A recipient's outcome: sent, failed, or a contact the server no longer gives. */
  const resultOf = (r) =>
    r.contactId && report?.skipped?.includes(r.contactId)
      ? { ok: false, error: t('This contact is no longer available') }
      : report?.results?.find((x) => x.email === r.email) || null;

  const ROW = 'eb:flex eb:w-full eb:items-center eb:gap-1.5 eb:rounded-lg2 eb:px-2 eb:py-1.5 eb:text-left eb:hover:bg-surface-200 eb:disabled:opacity-50';

  const contactsSection = canSearch && (
    <section className="eb:flex eb:min-h-0 eb:flex-1 eb:flex-col eb:gap-1.5">
      <SectionLabel className="eb:flex eb:items-center eb:gap-1.5">
        {t('Contact lists')}
        {found.loading && found.items.length > 0 && <Loader2 className="eb:size-3 eb:animate-spin" aria-label={t('Searching…')} />}
      </SectionLabel>
      {canList && (
        <Select value={list} onValueChange={setList} disabled={lists.loading}>
          <SelectTrigger aria-label={t('Contact lists')} className="eb:h-8 eb:text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('All contacts')}</SelectItem>
            {lists.items.map((l) => (
              <SelectItem key={l.id} value={String(l.id)}>
                {[l.name, l.detail].filter(Boolean).join(' · ')}
                {l.count != null && <span className="eb:text-foreground-muted"> ({l.count})</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {lists.error && <p className="eb:text-[12px] eb:text-destructive">{lists.error}</p>}
      <div className="eb:relative">
        <Search
          className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2.5 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('Find a contact')}
          placeholder={t('Name, company or address')}
          className="eb:h-8 eb:pl-8"
          autoComplete="off"
        />
      </div>
      <ul className="eb:min-h-24 eb:flex-1 eb:space-y-0.5 eb:overflow-y-auto" aria-label={t('Search results')} data-testid="eb-test-contacts">
        {found.items.map((contact) => {
          const added = recipients.some((r) => r.contactId === String(contact.id));
          return (
            <li key={contact.id}>
              <button type="button" disabled={sending || (full && !added)} onClick={() => toggle(contact)} aria-pressed={added} className={ROW}>
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
        {!found.loading && !found.error && !found.items.length && (
          <li className="eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-foreground-lighter">{t('No contact found.')}</li>
        )}
        {found.loading && !found.items.length && (
          <li className="eb:flex eb:items-center eb:gap-1.5 eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-foreground-lighter">
            <Loader2 className="eb:size-3.5 eb:animate-spin" aria-hidden="true" />
            {t('Searching…')}
          </li>
        )}
        {found.error && <li className="eb:px-2 eb:py-1.5 eb:text-[12px] eb:text-destructive">{found.error}</li>}
      </ul>
    </section>
  );

  const recipientsSection = (
    <section className={cn('eb:flex eb:min-h-0 eb:flex-col eb:gap-1.5', canSearch ? 'eb:max-h-[35%] eb:shrink-0' : 'eb:flex-1')}>
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
                  disabled={!canPreview || sending}
                >
                  {sending ? (
                    <Loader2 className="eb:size-3.5 eb:shrink-0 eb:animate-spin eb:text-foreground-muted" aria-hidden="true" />
                  ) : result ? (
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
                  disabled={sending}
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
  );

  const addressesSection = (
    <section className="eb:flex eb:shrink-0 eb:flex-col eb:gap-1.5">
      <Label htmlFor="eb-test-addresses">{t('Addresses')}</Label>
      <div className="eb:flex eb:gap-1.5">
        <Input
          id="eb-test-addresses"
          value={addresses}
          onChange={(e) => setAddresses(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            addTyped();
          }}
          placeholder="jane@example.com, john@example.com"
          className="eb:h-8"
          autoComplete="off"
          disabled={full || sending}
        />
        <Button
          variant="outline"
          size="sm-compact"
          className="eb:h-8"
          onClick={addTyped}
          disabled={full || sending || !splitAddresses(addresses).length}
        >
          <Plus />
          {t('Add')}
        </Button>
      </div>
      {full && <p className="eb:text-[11px] eb:text-foreground-muted">{t('{max} test addresses at most', { max: MAX_RECIPIENTS })}</p>}
    </section>
  );

  // Each opening starts afresh: the typed addresses of last time, the email as it is now.
  useEffect(() => {
    if (!open) return;
    setRecipients(readRecipients(testRecipients));
    setFocus(null);
    setQuery('');
    setAddresses('');
    setReport(null);
    setList(ALL);
    generation.current += 1;
    rendering.current.clear();
    setRenders({});
    setMjml(getMjml());
    // Only the opening matters: the host's callbacks may change at each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent
          className={cn(
            'eb:flex eb:flex-col eb:gap-4',
            canPreview ? 'eb:h-[88vh] eb:max-h-[88vh] eb:sm:max-w-[92rem]' : 'eb:max-h-[85vh] eb:sm:max-w-[460px]'
          )}
        >
          <DialogHeader>
            <div className="eb:flex eb:items-center eb:gap-3">
              <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
                <Send className="eb:size-5" />
              </span>
              <div>
                <DialogTitle className="eb:text-base eb:font-normal">{t('Send a test')}</DialogTitle>
                <DialogDescription className="eb:text-[13px]" aria-live="polite">
                  {sending && focused
                    ? t('Sending to {email}…', { email: focused.email })
                    : canSearch
                      ? t('The email on screen, with each contact’s values.')
                      : t('The email on screen, to reviewers’ addresses.')}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div
            className={cn(
              'eb:grid eb:min-h-0 eb:flex-1 eb:gap-4',
              canPreview &&
                'eb:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] eb:md:grid-cols-[minmax(0,1fr)_320px] eb:md:grid-rows-1 eb:xl:grid-cols-[minmax(0,1fr)_576px]'
            )}
          >
            {canPreview && (
              <EmailPreview
                html={shown.html}
                loading={shown.loading}
                error={shown.error}
                device={device}
                onDeviceChange={setDevice}
                onRefresh={sending ? undefined : refresh}
                hint={false}
              />
            )}

            <aside className="eb:flex eb:min-h-0 eb:flex-col eb:gap-3" aria-label={t('Recipients')}>
              {contactsSection}
              {recipientsSection}
              {addressesSection}
              <div className="eb:flex eb:shrink-0 eb:justify-end eb:gap-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
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
  );
}

/** The toolbar's "Test" button and its dialog, on the email being edited. */
export default function TestEmailButton({ context }) {
  const { editor, ready, meta, storage, testRecipients = [] } = context;
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm-compact" disabled={!ready} onClick={() => setOpen(true)}>
        <Send />
        {t('Test')}
      </Button>
      <TestEmailDialog
        open={open}
        onOpenChange={setOpen}
        storage={storage}
        getMjml={() => editor.exportMjml()}
        meta={meta}
        testRecipients={testRecipients}
      />
    </>
  );
}
