import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Languages, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { Button } from '../ui/primitives/button.jsx';
import { Input } from '../ui/primitives/fields.jsx';
import { SectionLabel } from '../ui/primitives/misc.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/primitives/overlays.jsx';
import { cleanRichText } from '../engine/richText.js';
import { chipClassName } from './chip.js';
import { MAX_REWRITE_INSTRUCTION, REWRITE_ACTIONS, REWRITE_LANGUAGES } from './rewrite.js';

/**
 * REWRITE WITH AI — in the properties of a selected text or button.
 *
 * One click: shorter, longer, fixed, friendlier, more formal, translated —
 * or a change in the user's words. The result replaces the text at once, in
 * one step of the history: Ctrl+Z brings the previous text back, so there is
 * nothing to accept or compare.
 *
 * Mounted per element (keyed by its id): selecting another element cancels a
 * rewrite in progress. If the text is edited while the AI works, the user's
 * words win and the answer is dropped.
 */

/** A language under its own name: "Deutsch", "Українська". @param {string} code */
function nativeName(code) {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) || code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

export default function RewriteText({ editor, selection, rewrite }) {
  const { t, notify } = useUi();
  const [running, setRunning] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState('');
  const [instruction, setInstruction] = useState('');
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const label = selection.tagName === 'mj-button';

  useEffect(() => () => abortRef.current?.abort(), []);

  /** The text as stored: a button's label, a text block's HTML. */
  const currentText = () => {
    const element = editor.getElement(selection.id);
    return (label ? element?.content : element?.html) ?? '';
  };

  const run = async (action, extra = {}) => {
    if (running) return;
    const text = currentText();
    setError('');
    setRunning(action);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await rewrite({ action, text, format: label ? 'plain' : 'html', ...extra }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (currentText() !== text) {
        setError(t('The text changed in the meantime, so it was left as it is.'));
        return;
      }
      editor.setContent(label ? result.text : cleanRichText(result.text, document), selection.id);
      if (action === 'custom') setInstruction('');
      notify('success', t('Text rewritten. Ctrl+Z brings back the previous one.'));
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message ? t(err.message) : t('The text could not be rewritten.'));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(null);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setRunning(null);
  };

  const busy = Boolean(running);
  const spinner = <Loader2 className="eb:size-3 eb:animate-spin" aria-hidden="true" />;

  return (
    <section className="eb:space-y-2.5" aria-label={t('Rewrite with AI')} data-testid="eb-rewrite">
      <SectionLabel className="eb:flex eb:items-center eb:gap-1.5">
        <Sparkles className="eb:size-3" aria-hidden="true" />
        {t('Rewrite with AI')}
      </SectionLabel>
      <div className="eb:flex eb:flex-wrap eb:gap-1.5">
        {REWRITE_ACTIONS.map((action) => (
          <button key={action.id} type="button" className={chipClassName()} disabled={busy} onClick={() => run(action.id)}>
            {running === action.id && spinner}
            {t(action.label)}
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={busy}>
            <button type="button" className={chipClassName()}>
              {running === 'translate' ? spinner : <Languages className="eb:size-3" aria-hidden="true" />}
              {t('Translate')}
              <ChevronDown className="eb:size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" aria-label={t('Translate into')}>
            {REWRITE_LANGUAGES.map((code) => (
              <DropdownMenuItem key={code} lang={code} onSelect={() => run('translate', { targetLanguage: code })}>
                {nativeName(code)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <form
        className="eb:flex eb:gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (instruction.trim()) run('custom', { instruction: instruction.trim() });
        }}
      >
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          maxLength={MAX_REWRITE_INSTRUCTION}
          placeholder={t('Or say what to change…')}
          aria-label={t('What to change')}
          disabled={busy}
        />
        <Button type="submit" variant="outline" size="icon-sm" aria-label={t('Rewrite')} disabled={busy || !instruction.trim()}>
          {running === 'custom' ? <Loader2 className="eb:animate-spin" /> : <Sparkles />}
        </Button>
      </form>
      {running && (
        <p className="eb:flex eb:items-center eb:gap-2 eb:text-[12px] eb:text-foreground-muted" role="status" aria-live="polite">
          {t('Rewriting…')}
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
    </section>
  );
}
