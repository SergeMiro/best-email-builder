import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { cn } from '../ui/primitives/cn.js';

/**
 * MODEL — the model of the provider chosen, in the Connect dialog: a field
 * that opens the provider's list of models in place (not over the dialog, so
 * the list scrolls like the rest of it).
 *
 * The list comes from the provider with the key (OpenRouter's needs none;
 * an OpenAI-compatible API of the user's own, from the address given):
 * the default model first, then the free ones, then the newest. Type to
 * filter, ↑/↓ to move, Enter to choose, Esc to close. An id the list does not
 * have can be used as it is ("Use “…”"); without the list, the default model
 * still works.
 *
 * @param {{
 *   aiKey: import('./keys.js').AiKey,
 *   provider: import('./keys.js').ProviderChoice,
 *   apiKey: string,
 *   address?: string,
 *   delay?: number,
 *   value: string,
 *   onChange: (model: string) => void,
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 * }} props
 *   `apiKey`: the key the list is asked with ('' when there is none yet);
 *   `address`: where the API answers, for a provider that needs one;
 *   `delay`: how long to wait after they change (a key being pasted).
 */
export default function ModelPicker({ aiKey, provider, apiKey, address = '', delay = 0, value, onChange, open, onOpenChange }) {
  const { t } = useUi();
  const [list, setList] = useState(/** @type {{status: 'loading'|'ready'|'needs-key'|'needs-address'|'refused'|'failed', models: import('./providers.js').ModelChoice[]}} */ ({ status: 'loading', models: [] }));
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [active, setActive] = useState(0);
  const triggerRef = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const listRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const labelId = useId();
  const valueId = useId();
  const listId = useId();
  const hintId = useId();

  // The list of the provider, asked again when the key (or the address) changes.
  useEffect(() => {
    if (provider.needsAddress && !address) {
      setList({ status: 'needs-address', models: [] });
      return undefined;
    }
    if (!apiKey && !provider.publicModels && !provider.keyless) {
      setList({ status: 'needs-key', models: [] });
      return undefined;
    }
    const controller = new AbortController();
    setList({ status: 'loading', models: [] });
    const timer = setTimeout(() => {
      aiKey.listModels(provider.id, { apiKey, address, signal: controller.signal }).then(
        (models) => !controller.signal.aborted && setList({ status: 'ready', models }),
        (error) => !controller.signal.aborted && setList({ status: error?.code === 'KEY_REFUSED' ? 'refused' : 'failed', models: [] })
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [aiKey, provider.id, provider.publicModels, provider.keyless, provider.needsAddress, apiKey, address, delay]);

  // Each time it opens: no search, the model in use under the keys.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFreeOnly(false);
  }, [open]);

  // The default model first, then the one in use, then the list.
  const models = useMemo(() => {
    const listed = new Map(list.models.map((model) => [model.id, model]));
    const seen = new Set();
    /** @type {import('./providers.js').ModelChoice[]} */
    const all = [];
    const add = (/** @type {import('./providers.js').ModelChoice} */ model) => {
      if (model.id && !seen.has(model.id)) seen.add(model.id) && all.push(model);
    };
    for (const id of [provider.model, value]) if (id) add(listed.get(id) || { id, name: id, free: false });
    list.models.forEach(add);
    return all;
  }, [list.models, provider.model, value]);
  const hasFree = list.models.some((model) => model.free);
  const typed = query.trim();
  const matches = useMemo(() => {
    const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
    return models.filter((model) => (!freeOnly || model.free) && words.every((word) => `${model.id} ${model.name}`.toLowerCase().includes(word)));
  }, [models, typed, freeOnly]);
  // An id of one's own: a model the list does not have (or not yet).
  const custom = typed && !/\s/.test(typed) && !models.some((model) => model.id === typed) ? typed : '';
  const count = matches.length + (custom ? 1 : 0);
  const current = models.find((model) => model.id === value);

  useEffect(() => setActive(Math.max(0, matches.findIndex((model) => model.id === value))), [matches, value]);
  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = () => {
    triggerRef.current?.focus();
    onOpenChange(false);
  };
  /** @param {string} id */
  const pick = (id) => {
    onChange(id);
    close();
  };

  const onKeyDown = (/** @type {React.KeyboardEvent} */ event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((at) => (count ? (at + (event.key === 'ArrowDown' ? 1 : -1) + count) % count : 0));
    } else if (event.key === 'Enter') {
      // The model, not the form: Connect is the button's.
      event.preventDefault();
      const id = active < matches.length ? matches[active]?.id : custom;
      if (id) pick(id);
    }
  };

  const optionId = (/** @type {number} */ at) => `${listId}-${at}`;
  const badges = (/** @type {import('./providers.js').ModelChoice} */ model) => (
    <>
      {model.free && (
        <span className="eb:shrink-0 eb:rounded-md eb:bg-success/10 eb:px-1.5 eb:py-px eb:text-[10.5px] eb:font-medium eb:text-success">
          {t('Free')}
        </span>
      )}
      {model.id === provider.model && (
        <span className="eb:shrink-0 eb:rounded-md eb:bg-muted eb:px-1.5 eb:py-px eb:text-[10.5px] eb:font-medium eb:text-foreground-lighter">{t('Default')}</span>
      )}
    </>
  );

  const status = {
    loading: (
      <>
        <LoaderCircle className="eb:size-3 eb:shrink-0 eb:animate-spin" aria-hidden="true" />
        {t('Loading the models of {provider}…', { provider: provider.name })}
      </>
    ),
    'needs-key': t('Paste the key to see all the models of {provider}.', { provider: provider.name }),
    'needs-address': t('Give the API address to see its models.'),
    refused: <span className="eb:text-warning">{t('{provider} refused this key: its models could not be listed.', { provider: provider.name })}</span>,
    failed: provider.model
      ? t('The list of models could not be loaded. The default model works, or type the id of another.')
      : t('The list of models could not be loaded. Type the id of the model.'),
    ready: list.models.length
      ? hasFree
        ? t('{count} models, the free ones first.', { count: list.models.length })
        : t('{count} models.', { count: list.models.length })
      : t('{provider} lists no models here: type the id of the one you want.', { provider: provider.name }),
  }[list.status];

  return (
    <div className="eb:flex eb:flex-col eb:gap-1.5" data-testid="eb-ai-connect-model-field">
      <span id={labelId} className="eb:text-[12.5px] eb:leading-none eb:font-medium eb:text-foreground">
        {t('Model')}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={hintId}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'eb:flex eb:h-7 eb:w-full eb:min-w-0 eb:items-center eb:gap-2 eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:px-2.5 eb:text-left eb:shadow-xs eb:transition-[color,box-shadow] eb:outline-none eb:focus-visible:border-ring eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
          open && 'eb:border-ring'
        )}
        data-testid="eb-ai-connect-model"
      >
        <span id={valueId} className="eb:min-w-0 eb:truncate eb:font-mono eb:text-[12.5px] eb:text-foreground">{value || t('Choose a model')}</span>
        {current && badges(current)}
        <ChevronDown className={cn('eb:ml-auto eb:size-4 eb:shrink-0 eb:text-foreground-muted eb:transition-transform', open && 'eb:rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          className="eb:flex eb:flex-col eb:overflow-hidden eb:rounded-lg2 eb:border eb:border-border eb:bg-background"
          onKeyDown={(event) => event.key === 'Escape' && close()}
          data-eb-models=""
          data-testid="eb-ai-connect-models"
        >
          <div className="eb:flex eb:items-center eb:gap-2 eb:border-b eb:border-border eb:p-2">
            <div className="eb:relative eb:min-w-0 eb:flex-1">
              <Search className="eb:pointer-events-none eb:absolute eb:top-1/2 eb:left-2 eb:size-3.5 eb:-translate-y-1/2 eb:text-foreground-muted" aria-hidden="true" />
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={count ? optionId(active) : undefined}
                aria-label={t('Search the models')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t('Search the models…')}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="eb:h-7 eb:w-full eb:rounded-lg2 eb:border eb:border-border eb:bg-background eb:pr-2 eb:pl-7 eb:text-[12px] eb:text-foreground eb:shadow-xs eb:outline-none eb:placeholder:text-foreground-muted eb:focus-visible:ring-2 eb:focus-visible:ring-ring/40"
                data-testid="eb-ai-connect-model-search"
              />
            </div>
            {hasFree && (
              <button
                type="button"
                aria-pressed={freeOnly}
                onClick={() => setFreeOnly((on) => !on)}
                className={cn(
                  'eb:inline-flex eb:h-8 eb:shrink-0 eb:items-center eb:rounded-lg2 eb:border eb:px-2.5 eb:text-[12px] eb:font-medium eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
                  freeOnly ? 'eb:border-success/40 eb:bg-success/10 eb:text-success' : 'eb:border-border eb:text-foreground-lighter eb:hover:bg-muted'
                )}
              >
                {t('Free only')}
              </button>
            )}
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className="eb:max-h-56 eb:overflow-y-auto eb:p-1">
            {matches.map((model, at) => (
              <button
                key={model.id}
                id={optionId(at)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={model.id === value}
                data-active={at === active}
                data-model={model.id}
                onClick={() => pick(model.id)}
                onMouseMove={() => at !== active && setActive(at)}
                className={cn(
                  'eb:flex eb:w-full eb:min-w-0 eb:items-start eb:gap-2 eb:rounded-md eb:px-2 eb:py-1.5 eb:text-left',
                  at === active ? 'eb:bg-accent eb:text-accent-foreground' : ''
                )}
              >
                <Check className={cn('eb:mt-0.5 eb:size-3.5 eb:shrink-0 eb:text-primary', model.id !== value && 'eb:invisible')} aria-hidden="true" />
                <span className="eb:flex eb:min-w-0 eb:flex-1 eb:flex-col eb:gap-0.5">
                  <span className="eb:flex eb:min-w-0 eb:items-center eb:gap-1.5">
                    <span className="eb:truncate eb:text-[13px] eb:text-foreground">{model.name}</span>
                    {badges(model)}
                  </span>
                  {model.name !== model.id && <span className="eb:truncate eb:font-mono eb:text-[10.5px] eb:text-foreground-muted">{model.id}</span>}
                </span>
              </button>
            ))}
            {custom && (
              <button
                id={optionId(matches.length)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={false}
                data-active={active === matches.length}
                onClick={() => pick(custom)}
                onMouseMove={() => active !== matches.length && setActive(matches.length)}
                className={cn(
                  'eb:flex eb:w-full eb:min-w-0 eb:items-center eb:gap-2 eb:rounded-md eb:px-2 eb:py-1.5 eb:text-left eb:text-[13px] eb:text-primary',
                  active === matches.length ? 'eb:bg-accent' : ''
                )}
                data-testid="eb-ai-connect-model-custom"
              >
                <span className="eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                <span className="eb:min-w-0 eb:truncate">{t('Use “{model}”', { model: custom })}</span>
              </button>
            )}
            {!count && <p className="eb:px-2 eb:py-3 eb:text-center eb:text-[12px] eb:text-foreground-muted">{t('No model matches.')}</p>}
          </div>
        </div>
      )}

      <p id={hintId} role="status" className="eb:flex eb:min-h-4 eb:items-center eb:gap-1.5 eb:text-[11.5px] eb:text-foreground-muted" data-testid="eb-ai-connect-models-status">
        {status}
      </p>
    </div>
  );
}
