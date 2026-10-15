import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { Button } from '../ui/primitives/button.jsx';
import { cn } from '../ui/primitives/cn.js';
import { chipClassName } from './chip.js';
import { emailWords } from './subjects.js';

/** Ideas already shown that "More ideas" asks the model not to repeat (the server keeps 12). */
const MAX_AVOID = 12;

/**
 * SUGGEST SUBJECTS — under the subject of the email.
 *
 * One click: three other subject lines, drawn from the words of the email.
 * They are a list to pick from, the user's own subject first: a click puts
 * one in the field, another click another one, the first row brings the
 * user's subject back. "More ideas" asks for three new ones (none of those
 * already shown; the one in the field stays in the list); "Done" closes the
 * list and keeps the subject in the field.
 *
 * "Yours" is what the user wrote: typed in the field while the list is open
 * (or while ideas are on their way), it becomes the new "yours". When the
 * email itself is replaced (Generate, a template), the list closes.
 *
 * Keyboard: the list is a radio group — one Tab stop, the arrows move and
 * pick. Focus goes to the list when it opens, back to the button after Done or
 * Cancel.
 */
export default function SubjectIdeas({ editor, meta, onSubject, suggest, variables = null }) {
  const { t, locale } = useUi();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [ideas, setIdeas] = useState(/** @type {string[]|null} */ (null));
  const [original, setOriginal] = useState('');
  const shownRef = useRef(/** @type {string[]} */ ([]));
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const subjectRef = useRef(meta.subject);
  subjectRef.current = meta.subject;
  const rootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  /** Where focus goes after the next render: the list, or the button that opened it. */
  const focusRef = useRef(/** @type {'list'|'button'|null} */ (null));

  useEffect(() => () => abortRef.current?.abort(), []);

  // Another email loaded in the editor: these ideas were for the previous one.
  useEffect(
    () =>
      editor.on('load', () => {
        abortRef.current?.abort();
        abortRef.current = null;
        shownRef.current = [];
        setRunning(false);
        setIdeas(null);
        setError('');
        setOriginal('');
      }),
    [editor]
  );

  // Typed in the field while the list is open: that is the user's subject now.
  const typed = meta.subject.trim();
  useEffect(() => {
    if (ideas && typed && !ideas.includes(meta.subject) && typed !== original) setOriginal(typed);
  }, [ideas, meta.subject, typed, original]);

  useLayoutEffect(() => {
    const target = focusRef.current;
    if (!target || running) return;
    focusRef.current = null;
    const root = rootRef.current;
    const element =
      target === 'list'
        ? root?.querySelector('[role="radio"][tabindex="0"]')
        : root?.querySelector('[data-subject-ideas-button]');
    /** @type {HTMLElement|null|undefined} */ (element)?.focus();
  });

  const ready = editor.status === 'ready';

  const run = async () => {
    if (running || editor.status !== 'ready') return;
    const first = !ideas;
    // The user's subject: as it was before the first idea was picked, or typed since.
    const yours = first ? subjectRef.current.trim() : original;
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
          variables: variables?.map(({ key, label, kind }) => ({ key, label, kind })),
          avoid: shownRef.current.slice(-MAX_AVOID),
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const current = subjectRef.current;
      // The idea in the field stays in the list; the others give way to the new ones.
      const kept = ideas?.includes(current) ? [current] : [];
      const next = [...kept, ...result.subjects.filter((subject) => subject !== current)];
      shownRef.current = [...shownRef.current, ...result.subjects];
      // Typed during the wait: that is "yours" now.
      setOriginal(current.trim() && !ideas?.includes(current) ? current.trim() : yours);
      setIdeas(next);
      if (first) focusRef.current = 'list';
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message ? t(err.message) : t('No subject could be suggested.'));
    } finally {
      // A request cancelled earlier must not end the one that replaced it.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setRunning(false);
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    focusRef.current = 'button';
  };

  const done = () => {
    setIdeas(null);
    setError('');
    shownRef.current = [];
    focusRef.current = 'button';
  };

  const options = ideas ? [...(original ? [{ text: original, yours: true }] : []), ...ideas.map((text) => ({ text, yours: false }))] : [];
  const checked = options.findIndex((option) => option.text === meta.subject);
  const tabStop = checked === -1 ? 0 : checked;

  /** Arrows move through the ideas and pick, as in any radio group. */
  const onKeyDown = (/** @type {React.KeyboardEvent} */ event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    const to = step ? (tabStop + step + options.length) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : -1;
    if (to === -1 || !options.length) return;
    event.preventDefault();
    onSubject(options[to].text);
    /** @type {HTMLElement|undefined} */ (rootRef.current?.querySelectorAll('[role="radio"]')[to])?.focus();
  };

  const spinner = <Loader2 className="eb:size-3 eb:animate-spin" aria-hidden="true" />;

  return (
    <div className="eb:space-y-2" data-testid="eb-subject-ideas" ref={rootRef}>
      {!ideas && (
        <button type="button" className={chipClassName()} disabled={running || !ready} onClick={run} data-subject-ideas-button>
          {running ? spinner : <Sparkles className="eb:size-3" aria-hidden="true" />}
          {t('Suggest subjects')}
        </button>
      )}
      {ideas && (
        <div className="eb:space-y-2 eb:rounded-md eb:border eb:border-border eb:p-1.5">
          <div role="radiogroup" aria-label={t('Subject ideas')} className="eb:space-y-0.5" onKeyDown={onKeyDown}>
            {options.map((option, index) => {
              const chosen = index === checked;
              return (
                <button
                  key={`${option.yours ? 'yours' : 'idea'}:${option.text}`}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  tabIndex={index === tabStop ? 0 : -1}
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
            <button type="button" className={chipClassName()} disabled={running || !ready} onClick={run} data-subject-ideas-button>
              {running ? spinner : <Sparkles className="eb:size-3" aria-hidden="true" />}
              {t('More ideas')}
            </button>
            <Button type="button" variant="ghost" size="xs" className="eb:ml-auto" disabled={running} onClick={done}>
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
