import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { useUi } from '../../ui/context.jsx';
import { Button } from '../../ui/primitives/button.jsx';
import { cn } from '../../ui/primitives/cn.js';
import { chipClassName } from './chip.js';
import { emailWords } from './subjects.js';

/**
 * SUGGEST SUBJECTS — under the subject of the email.
 *
 * One click: three other subject lines, drawn from the words of the email.
 * They are a list to pick from, the user's own subject first: a click puts
 * one in the field, another click another one, the first row brings the
 * user's subject back. "More ideas" asks for three new ones; "Done" closes
 * the list and keeps the subject in the field.
 */
export default function SubjectIdeas({ editor, meta, onSubject, suggest, variables = null }) {
  const { t, locale } = useUi();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [ideas, setIdeas] = useState(/** @type {string[]|null} */ (null));
  const [original, setOriginal] = useState('');
  const abortRef = useRef(/** @type {AbortController|null} */ (null));

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (running) return;
    // The user's subject, kept as it was before the first idea was picked.
    const yours = ideas ? original : meta.subject.trim();
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setRunning(true);
    try {
      const result = await suggest(
        {
          subject: yours,
          preheader: meta.preheader,
          text: emailWords(editor.exportMjml()),
          language: locale,
          variables: variables?.map(({ key, label }) => ({ key, label })),
          avoid: ideas || [],
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      setOriginal(yours);
      setIdeas(result.subjects);
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message ? t(err.message) : t('No subject could be suggested.'));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const options = ideas ? [...(original ? [{ text: original, yours: true }] : []), ...ideas.map((text) => ({ text, yours: false }))] : [];
  const spinner = <Loader2 className="eb:size-3 eb:animate-spin" aria-hidden="true" />;

  return (
    <div className="eb:space-y-2" data-testid="eb-subject-ideas">
      {!ideas && (
        <button type="button" className={chipClassName()} disabled={running} onClick={run}>
          {running ? spinner : <Sparkles className="eb:size-3" aria-hidden="true" />}
          {t('Suggest subjects')}
        </button>
      )}
      {ideas && (
        <div className="eb:space-y-2 eb:rounded-md eb:border eb:border-border eb:p-1.5">
          <div role="radiogroup" aria-label={t('Subject ideas')} className="eb:space-y-0.5">
            {options.map((option) => {
              const chosen = meta.subject === option.text;
              return (
                <button
                  key={`${option.yours ? 'yours' : 'idea'}:${option.text}`}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  className={cn(
                    'eb:flex eb:w-full eb:items-start eb:gap-2 eb:rounded eb:px-2 eb:py-1.5 eb:text-left eb:text-[12.5px] eb:leading-snug eb:transition-colors eb:outline-none eb:focus-visible:ring-[3px] eb:focus-visible:ring-ring/50',
                    chosen ? 'eb:bg-primary/10 eb:text-foreground' : 'eb:text-foreground-lighter eb:hover:bg-muted'
                  )}
                  onClick={() => onSubject(option.text)}
                >
                  <Check className={cn('eb:mt-0.5 eb:size-3.5 eb:shrink-0', chosen ? 'eb:text-primary' : 'eb:invisible')} aria-hidden="true" />
                  <span className="eb:min-w-0 eb:flex-1 eb:break-words">{option.text}</span>
                  {option.yours && <span className="eb:shrink-0 eb:text-[11px] eb:text-foreground-muted">{t('yours')}</span>}
                </button>
              );
            })}
          </div>
          <div className="eb:flex eb:items-center eb:gap-1.5 eb:px-1 eb:pb-0.5">
            <button type="button" className={chipClassName()} disabled={running} onClick={run}>
              {running ? spinner : <Sparkles className="eb:size-3" aria-hidden="true" />}
              {t('More ideas')}
            </button>
            <Button type="button" variant="ghost" size="xs" className="eb:ml-auto" disabled={running} onClick={() => setIdeas(null)}>
              {t('Done')}
            </Button>
          </div>
        </div>
      )}
      {running && (
        <p className="eb:flex eb:items-center eb:gap-2 eb:text-[12px] eb:text-foreground-muted" role="status" aria-live="polite">
          {t('Reading the email…')}
          <Button type="button" variant="link" size="xs" className="eb:h-auto eb:px-0" onClick={cancel}>
            {t('Cancel')}
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="eb:flex eb:items-start eb:gap-1.5 eb:text-[12px] eb:text-destructive">
          <TriangleAlert className="eb:mt-px eb:size-3.5 eb:shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
