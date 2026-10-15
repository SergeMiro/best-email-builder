import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, Eye, EyeOff, Gift, KeyRound, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { cn } from '../ui/primitives/cn.js';
import { Button } from '../ui/primitives/button.jsx';
import { Input, Label } from '../ui/primitives/fields.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/primitives/overlays.jsx';
import ModelPicker from './ModelPicker.jsx';

/** A key this long is complete enough to ask the provider for its models. */
const LISTABLE_KEY = 20;

/**
 * CONNECT — the dialog that asks the user for their provider key, when the AI
 * runs in the page with `createAi({ provider, askKey: true })`.
 *
 * It opens by itself when an AI action needs a key and there is none, or the
 * provider refused the last one; the action goes on once the key is given.
 * Cancel ends the action ("Connect an AI provider first"). The key is kept in
 * this browser and sent only to the provider (see keys.js).
 *
 * Given several providers (`createAi({ provider: [...] })`), the user chooses
 * one at the top; a provider whose key this browser already keeps needs no
 * new one. Under the key, the model: the provider's own, or another of its
 * list (ModelPicker.jsx).
 */
export default function ConnectAi({ aiKey }) {
  const { t } = useUi();
  const state = useSyncExternalStore(aiKey.subscribe, aiKey.state, aiKey.state);
  const [value, setValue] = useState('');
  const [shown, setShown] = useState(false);
  const [chosenId, setChosenId] = useState(aiKey.provider.id);
  /** The models chosen in the dialog, by provider, until Connect. */
  const [picks, setPicks] = useState(/** @type {Record<string, string>} */ ({}));
  const [modelsOpen, setModelsOpen] = useState(false);
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null));
  const choicesRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const inputId = useId();
  const hintId = useId();
  const choices = aiKey.providers;
  const chosen = choices.find((provider) => provider.id === chosenId) || aiKey.provider;
  const { name, keyUrl, keyHint, free } = chosen;

  // Each time it opens: the provider in use, an empty field, the key hidden.
  useEffect(() => {
    if (!state.asking) return;
    setChosenId(aiKey.provider.id);
    setValue('');
    setShown(false);
    setPicks({});
    setModelsOpen(false);
  }, [state.asking, aiKey]);

  const key = value.trim();
  // The key this browser keeps for the provider chosen (none for one refused).
  const saved = aiKey.get(chosen.id);
  // A key from elsewhere (another provider's) is the usual mistake: said, not blocked.
  const unusual = Boolean(key && keyHint && !key.startsWith(keyHint));
  const refused = state.refused && chosen.id === aiKey.provider.id;
  /** @param {string} id */
  const modelFor = (id) => picks[id] ?? aiKey.model(id);

  const submit = (/** @type {React.FormEvent} */ event) => {
    event.preventDefault();
    const answer = key || saved;
    if (!answer) return;
    if (chosen.id !== aiKey.provider.id) aiKey.choose(chosen.id);
    if (picks[chosen.id] && picks[chosen.id] !== aiKey.model(chosen.id)) aiKey.chooseModel(picks[chosen.id], chosen.id);
    aiKey.answer(answer);
  };

  /** @param {string} id */
  const choose = (id) => {
    setChosenId(id);
    setValue('');
    setModelsOpen(false);
  };

  /** Arrows move through the providers and choose, as in any radio group. */
  const onChoicesKeyDown = (/** @type {React.KeyboardEvent} */ event) => {
    const at = choices.findIndex((provider) => provider.id === chosen.id);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const to = step ? (at + step + choices.length) % choices.length : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : -1;
    if (to === -1) return;
    event.preventDefault();
    choose(choices[to].id);
    /** @type {HTMLElement|undefined} */ (choicesRef.current?.querySelectorAll('[role="radio"]')[to])?.focus();
  };

  return (
    <Dialog open={state.asking} onOpenChange={(open) => !open && aiKey.answer(null)}>
      <DialogContent
        className={cn('eb:max-h-[calc(100dvh-2rem)] eb:gap-0 eb:overflow-y-auto eb:p-0', choices.length > 1 ? 'eb:sm:max-w-xl' : 'eb:sm:max-w-md')}
        data-testid="eb-ai-connect"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        // Esc closes the list of models first, then the dialog. From inside
        // the list, the list closes itself (and gives the focus back to its field).
        onEscapeKeyDown={(event) => {
          if (!modelsOpen) return;
          event.preventDefault();
          if (!(event.target instanceof Element && event.target.closest('[data-eb-models]'))) setModelsOpen(false);
        }}
      >
        {/* min-w-0: the long names of the list of models do not widen the dialog. */}
        <form onSubmit={submit} className="eb:min-w-0">
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

            {choices.length > 1 && (
              <div
                ref={choicesRef}
                role="radiogroup"
                aria-label={t('AI provider')}
                className="eb:grid eb:grid-cols-2 eb:gap-1.5 eb:sm:grid-cols-3"
                onKeyDown={onChoicesKeyDown}
                data-testid="eb-ai-connect-providers"
              >
                {choices.map((provider) => {
                  const checked = provider.id === chosen.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      tabIndex={checked ? 0 : -1}
                      onClick={() => choose(provider.id)}
                      className={cn(
                        'eb:flex eb:min-w-0 eb:flex-col eb:gap-0.5 eb:rounded-md eb:border eb:px-2.5 eb:py-2 eb:text-left eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
                        checked ? 'eb:border-primary eb:bg-primary/10' : 'eb:border-border eb:hover:bg-muted'
                      )}
                    >
                      <span className="eb:flex eb:items-center eb:gap-1.5 eb:text-[13px] eb:leading-tight eb:font-medium eb:text-foreground">
                        <span className="eb:truncate">{provider.name}</span>
                        {provider.free && <Gift className="eb:size-3 eb:shrink-0 eb:text-success" aria-label={t(provider.free)} />}
                        {aiKey.get(provider.id) && (
                          <span className="eb:ml-auto eb:size-1.5 eb:shrink-0 eb:rounded-full eb:bg-success" title={t('Key saved')} aria-label={t('Key saved')} />
                        )}
                      </span>
                      {modelFor(provider.id) && (
                        <span className="eb:truncate eb:font-mono eb:text-[10.5px] eb:text-foreground-muted" title={modelFor(provider.id)}>
                          {modelFor(provider.id)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {refused && (
              <p role="alert" className="eb:flex eb:items-start eb:gap-2 eb:rounded-md eb:border eb:border-destructive/30 eb:bg-destructive/10 eb:px-3 eb:py-2 eb:text-[12.5px] eb:text-destructive">
                <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                {t('{provider} refused the last key. Paste another one.', { provider: name })}
              </p>
            )}

            {(keyUrl || free) && (
              <div className="eb:flex eb:flex-wrap eb:items-center eb:gap-x-3 eb:gap-y-2">
                {keyUrl && (
                  <Button asChild variant="outline" size="sm-compact">
                    <a
                      href={keyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      // A new tab, always — even where a link's target is ignored (webviews).
                      onClick={(event) => {
                        event.preventDefault();
                        window.open(keyUrl, '_blank', 'noopener,noreferrer');
                      }}
                      data-testid="eb-ai-connect-get-key"
                    >
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
                ) : saved && !key ? (
                  t('A key for {provider} is saved in this browser: Connect uses it, or paste another one.', { provider: name })
                ) : keyHint ? (
                  t('{provider} keys start with {prefix}.', { provider: name, prefix: keyHint })
                ) : null}
              </p>
            </div>

            <ModelPicker
              aiKey={aiKey}
              provider={chosen}
              apiKey={key.length >= LISTABLE_KEY ? key : saved}
              delay={key.length >= LISTABLE_KEY ? 350 : 0}
              value={modelFor(chosen.id)}
              onChange={(model) => setPicks((current) => ({ ...current, [chosen.id]: model }))}
              open={modelsOpen}
              onOpenChange={setModelsOpen}
            />
          </div>

          <div className="eb:flex eb:items-start eb:gap-2 eb:border-t eb:border-border eb:bg-surface-75 eb:px-6 eb:py-3 eb:text-[11.5px] eb:leading-relaxed eb:text-foreground-lighter">
            <ShieldCheck className="eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-foreground-muted" aria-hidden="true" />
            <span>{t('The key stays in this browser and is sent only to {provider}.', { provider: name })}</span>
          </div>

          <DialogFooter className="eb:border-t eb:border-border eb:px-6 eb:py-4">
            <Button type="button" variant="ghost" onClick={() => aiKey.answer(null)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={!key && !saved} data-testid="eb-ai-connect-submit">
              {t('Connect')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
