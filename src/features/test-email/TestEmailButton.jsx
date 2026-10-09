import { useState } from 'react';
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { Label, Textarea } from '../../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../ui/primitives/overlays.jsx';

/**
 * TEST SEND — the only real layout check: a browser preview says nothing about
 * what Outlook will do. Sends the MJML on screen, saved or not.
 *
 * The addresses are remembered in the browser for the next test.
 */

const KEY = 'best-email-builder:test-addresses';

function readAddresses(fallback) {
  try {
    return window.localStorage.getItem(KEY) ?? fallback;
  } catch {
    return fallback;
  }
}

function rememberAddresses(value) {
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* private browsing: nothing to remember */
  }
}

export default function TestEmailButton({ context }) {
  const { editor, ready, meta, storage, testRecipients = [] } = context;
  const { t, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState('');
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(null);

  const emails = addresses
    .split(/[,;\s]+/)
    .map((a) => a.trim())
    .filter(Boolean);

  const send = async () => {
    if (!emails.length) return;
    rememberAddresses(addresses);
    setSending(true);
    setReport(null);
    try {
      const result = await storage.sendTest({
        mjml: editor.exportMjml(),
        subject: meta.subject,
        preheader: meta.preheader,
        emails,
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

  return (
    <>
      <Button
        variant="outline"
        size="sm-compact"
        disabled={!ready}
        onClick={() => {
          setAddresses(readAddresses(testRecipients.join(', ')));
          setReport(null);
          setOpen(true);
        }}
      >
        <Send />
        {t('Test')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="eb:sm:max-w-[460px]">
          <DialogHeader>
            <div className="eb:flex eb:items-center eb:gap-3">
              <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-lg2 eb:bg-primary/10 eb:text-primary">
                <Send className="eb:size-5" />
              </span>
              <div>
                <DialogTitle className="eb:text-base eb:font-normal">{t('Send a test')}</DialogTitle>
                <DialogDescription className="eb:text-[13px]">{t('The email on screen, to reviewers’ addresses.')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="eb:space-y-2">
            <Label htmlFor="eb-test-addresses">{t('Addresses')}</Label>
            <Textarea
              id="eb-test-addresses"
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              placeholder="jane@example.com, john@example.com"
              rows={3}
            />
          </div>
          {report && (
            <ul className="eb:space-y-1" aria-label={t('Results')}>
              {report.results.map((r) => (
                <li key={r.email} className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-foreground">
                  {r.ok ? (
                    <CheckCircle2 className="eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-success" aria-hidden="true" />
                  ) : (
                    <XCircle className="eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-destructive" aria-hidden="true" />
                  )}
                  <span className="eb:min-w-0 eb:break-all">
                    {r.email}
                    {r.error ? ` — ${r.error}` : ''}
                  </span>
                </li>
              ))}
              {report.invalid.map((email) => (
                <li key={`invalid-${email}`} className="eb:text-[12px] eb:text-foreground-muted">
                  {t('Ignored (invalid): {email}', { email })}
                </li>
              ))}
            </ul>
          )}
          <div className="eb:flex eb:justify-end eb:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('Close')}
            </Button>
            <Button onClick={send} disabled={sending || !emails.length}>
              {sending ? <Loader2 className="eb:animate-spin" /> : <Send />}
              {t('Send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
