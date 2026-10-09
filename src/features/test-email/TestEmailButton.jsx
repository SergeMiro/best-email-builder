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

const KEY = 'mailblocks:test-addresses';

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
        <DialogContent className="mb:sm:max-w-[460px]">
          <DialogHeader>
            <div className="mb:flex mb:items-center mb:gap-3">
              <span className="mb:flex mb:size-10 mb:shrink-0 mb:items-center mb:justify-center mb:rounded-lg2 mb:bg-primary/10 mb:text-primary">
                <Send className="mb:size-5" />
              </span>
              <div>
                <DialogTitle className="mb:text-base mb:font-normal">{t('Send a test')}</DialogTitle>
                <DialogDescription className="mb:text-[13px]">{t('The email on screen, to reviewers’ addresses.')}</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="mb:space-y-2">
            <Label htmlFor="mb-test-addresses">{t('Addresses')}</Label>
            <Textarea
              id="mb-test-addresses"
              value={addresses}
              onChange={(e) => setAddresses(e.target.value)}
              placeholder="jane@example.com, john@example.com"
              rows={3}
            />
          </div>
          {report && (
            <ul className="mb:space-y-1" aria-label={t('Results')}>
              {report.results.map((r) => (
                <li key={r.email} className="mb:flex mb:items-start mb:gap-1.5 mb:text-[12px] mb:text-foreground">
                  {r.ok ? (
                    <CheckCircle2 className="mb:mt-0.5 mb:size-3.5 mb:shrink-0 mb:text-success" aria-hidden="true" />
                  ) : (
                    <XCircle className="mb:mt-0.5 mb:size-3.5 mb:shrink-0 mb:text-destructive" aria-hidden="true" />
                  )}
                  <span className="mb:min-w-0 mb:break-all">
                    {r.email}
                    {r.error ? ` — ${r.error}` : ''}
                  </span>
                </li>
              ))}
              {report.invalid.map((email) => (
                <li key={`invalid-${email}`} className="mb:text-[12px] mb:text-foreground-muted">
                  {t('Ignored (invalid): {email}', { email })}
                </li>
              ))}
            </ul>
          )}
          <div className="mb:flex mb:justify-end mb:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('Close')}
            </Button>
            <Button onClick={send} disabled={sending || !emails.length}>
              {sending ? <Loader2 className="mb:animate-spin" /> : <Send />}
              {t('Send')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
