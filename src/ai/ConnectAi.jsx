import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, Eye, EyeOff, Gift, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { Button } from '../ui/primitives/button.jsx';
import { Input, Label } from '../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/primitives/overlays.jsx';

/**
 * CONNECT — the dialog that asks the user for their provider key, when the AI
 * runs in the page with `createAi({ provider, askKey: true })`.
 *
 * It opens by itself when an AI action needs a key and there is none, or the
 * provider refused the last one; the action goes on once the key is given.
 * Cancel ends the action ("Connect an AI provider first"). The key is kept in
 * this browser and sent only to the provider (see keys.js).
 */
export default function ConnectAi({ aiKey }) {
  const { t } = useUi();
  const state = useSyncExternalStore(aiKey.subscribe, aiKey.state, aiKey.state);
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const inputId = useId();
  const hintId = useId();
  const { name, keyUrl, keyHint, free } = aiKey.provider;

  // Each time it opens: an empty field, the key hidden.
  useEffect(() => {
    if (!state.asking) return;
    setValue('');
    setShown(false);
  }, [state.asking]);

  const key = value.trim();
  // A key from elsewhere (another provider's) is the usual mistake: said, not blocked.
  const unusual = Boolean(key && keyHint && !key.startsWith(keyHint));

  const submit = (/** @type {React.FormEvent} */ event) => {
    event.preventDefault();
    if (key) aiKey.answer(key);
  };

  return (
    <Dialog open={state.asking} onOpenChange={(open) => !open && aiKey.answer(null)}>
      <DialogContent
        className="eb:gap-0 eb:overflow-hidden eb:p-0 eb:sm:max-w-md"
        data-testid="eb-ai-connect"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form onSubmit={submit}>
          <div className="eb:flex eb:flex-col eb:gap-5 eb:px-6 eb:pt-6 eb:pb-5">
            <DialogHeader className="eb:flex-row eb:items-start eb:gap-3.5 eb:pr-6">
              <span className="eb:flex eb:size-10 eb:shrink-0 eb:items-center eb:justify-center eb:rounded-full eb:bg-primary/10 eb:text-primary">
                <KeyRound className="eb:size-5" aria-hidden="true" />
              </span>
              <div className="eb:flex eb:flex-col eb:gap-1.5">
                <DialogTitle>{t('Connect {provider}', { provider: name })}</DialogTitle>
                <DialogDescription className="eb:text-[13px] eb:leading-relaxed eb:text-foreground-lighter">
                  {t('The AI writes with your own {provider} key. Connect it once: this browser remembers it.', { provider: name })}
                </DialogDescription>
              </div>
            </DialogHeader>

            {state.refused && (
              <p role="alert" className="eb:flex eb:items-start eb:gap-2 eb:rounded-md eb:border eb:border-destructive/30 eb:bg-destructive/10 eb:px-3 eb:py-2 eb:text-[12.5px] eb:text-destructive">
                <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                {t('{provider} refused the last key. Paste another one.', { provider: name })}
              </p>
            )}

            {(keyUrl || free) && (
              <div className="eb:flex eb:flex-wrap eb:items-center eb:gap-x-3 eb:gap-y-2">
                {keyUrl && (
                  <Button asChild variant="outline" size="sm-compact">
                    <a href={keyUrl} target="_blank" rel="noopener noreferrer" data-testid="eb-ai-connect-get-key">
                      {t('Get a key')}
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </Button>
                )}
                {free && (
                  <span className="eb:inline-flex eb:items-center eb:gap-1.5 eb:rounded-full eb:bg-success/10 eb:px-2.5 eb:py-1 eb:text-[11.5px] eb:font-medium eb:text-success">
                    <Gift className="eb:size-3.5" aria-hidden="true" />
                    {t(free)}
                  </span>
                )}
              </div>
            )}

            <div className="eb:flex eb:flex-col eb:gap-1.5">
              <Label htmlFor={inputId}>{t('API key')}</Label>
              <div className="eb:relative">
                <Input
                  ref={inputRef}
                  id={inputId}
                  type={shown ? 'text' : 'password'}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder={keyHint ? `${keyHint}…` : t('Paste the key')}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-describedby={hintId}
                  className="eb:h-9 eb:pr-10 eb:font-mono eb:text-[12.5px]"
                  data-testid="eb-ai-connect-key"
                />
                <button
                  type="button"
                  className="eb:absolute eb:top-1/2 eb:right-1 eb:flex eb:size-7 eb:-translate-y-1/2 eb:items-center eb:justify-center eb:rounded eb:text-foreground-muted eb:transition-colors eb:outline-none eb:hover:bg-muted eb:hover:text-foreground eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50"
                  onClick={() => setShown((current) => !current)}
                  aria-label={shown ? t('Hide the key') : t('Show the key')}
                  aria-pressed={shown}
                >
                  {shown ? <EyeOff className="eb:size-4" aria-hidden="true" /> : <Eye className="eb:size-4" aria-hidden="true" />}
                </button>
              </div>
              <p id={hintId} className="eb:min-h-4 eb:text-[11.5px] eb:text-foreground-muted">
                {unusual ? (
                  <span className="eb:text-warning">{t('{provider} keys usually start with {prefix}.', { provider: name, prefix: keyHint })}</span>
                ) : keyHint ? (
                  t('{provider} keys start with {prefix}.', { provider: name, prefix: keyHint })
                ) : null}
              </p>
            </div>
          </div>

          <div className="eb:flex eb:items-start eb:gap-2 eb:border-t eb:border-border eb:bg-surface-75 eb:px-6 eb:py-3 eb:text-[11.5px] eb:leading-relaxed eb:text-foreground-lighter">
            <ShieldCheck className="eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-foreground-muted" aria-hidden="true" />
            <span>{t('The key stays in this browser and is sent only to {provider}.', { provider: name })}</span>
          </div>

          <DialogFooter className="eb:border-t eb:border-border eb:px-6 eb:py-4">
            <Button type="button" variant="ghost" onClick={() => aiKey.answer(null)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!key} data-testid="eb-ai-connect-submit">
              {t('Connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
