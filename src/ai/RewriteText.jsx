import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Languages, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { Button } from '../ui/primitives/button.jsx';
import { Textarea } from '../ui/primitives/fields.jsx';
import { SectionLabel } from '../ui/primitives/misc.jsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/primitives/overlays.jsx';
import { cleanRichText } from '../engine/richText.js';
import { chipClassName } from './chip.js';
import { MAX_REWRITE_INSTRUCTION, REWRITE_ACTIONS, REWRITE_LANGUAGES } from './rewrite.js';
import { emailWords, visibleText } from './subjects.js';

/**
 * WRITE WITH AI — in the properties of a selected text or button.
 *
 * One field for the user's words: what to change in the text ("say it in
 * two lines"), or what to write instead ("the sale ends Sunday") — the AI
 * tells which, and writes to fit the rest of the email (its language, its
 * tone, nothing it already says); a block set as a title gets one line.
 * Under it, one click rewrites the text: shorter, longer, fixed, friendlier,
 * more formal, translated. While the AI works the text shimmers on the
 * canvas; its answer comes in word by word. It replaces the text in one step
 * of the history: Ctrl+Z brings the previous text back, so there is nothing
 * to accept or compare.
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
  const { t, locale, notify } = useUi();
  const [running, setRunning] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState('');
  const [request, setRequest] = useState('');
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const label = selection.tagName === 'mj-button';

  /** Stops the AI's work, and its shimmer on the canvas. */
  const stop = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    abortRef.current = null;
    editor.showWorking(null);
  }, [editor]);

  useEffect(() => stop, [stop]);

  /** The text as stored: a button's label, a text block's HTML. */
  const currentText = () => {
    const element = editor.getElement(selection.id);
    return (label ? element?.content : element?.html) ?? '';
  };

  const run = async (action, extra = {}) => {
    if (running) return;
    const text = currentText();
    // The user's own words: the AI writes; a click: it rewrites.
    const writing = action === 'custom';
    setError('');
    setRunning(action);
    const controller = new AbortController();
    abortRef.current = controller;
    editor.showWorking(selection.id);
    try {
      const result = await rewrite({ action, text, format: label ? 'plain' : 'html', ...extra }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (currentText() !== text) {
        setError(t('The text changed in the meantime, so it was left as it is.'));
        return;
      }
      editor.setContent(label ? result.text : cleanRichText(result.text, document), selection.id, { reveal: true });
      if (action === 'custom') setRequest('');
      notify('success', writing ? t('Text written. Ctrl+Z brings back the previous one.') : t('Text rewritten. Ctrl+Z brings back the previous one.'));
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err?.message ? t(err.message) : writing ? t('The text could not be written.') : t('The text could not be rewritten.'));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        editor.showWorking(null);
      }
      setRunning(null);
    }
  };

  const cancel = () => {
    stop();
    setRunning(null);
  };

  /** The user's words: a change, or what to write — fitting the rest of the email. */
  const ask = () => {
    const words = request.trim();
    if (!words) return;
    const size = Number.parseFloat(String(editor.getElement(selection.id)?.attributes?.['font-size'] || ''));
    // The email without this text: what the new one must fit, and not repeat.
    const own = visibleText(currentText());
    const email = emailWords(editor.exportMjml());
    run('custom', {
      instruction: words,
      context: own ? email.replace(own, '').trim() : email,
      role: size >= 20 ? 'heading' : 'text',
      language: String(locale || 'en').slice(0, 2),
    });
  };

  const busy = Boolean(running);
  const spinner = <Loader2 className="eb:size-3 eb:animate-spin" aria-hidden="true" />;

  return (
    <section className="eb:space-y-2.5" aria-label={t('Write with AI')} data-testid="eb-rewrite">
      <SectionLabel className="eb:flex eb:items-center eb:gap-1.5">
        <Sparkles className="eb:size-3" aria-hidden="true" />
        {t('Write with AI')}
      </SectionLabel>
      <PromptForm
        value={request}
        onChange={setRequest}
        onSubmit={ask}
        placeholder={t('What should it say, or what should change? e.g. the sale ends Sunday')}
        label={t('Ask the AI')}
        busy={busy}
        submitLabel={t('Write')}
      >
        {running === 'custom' ? <Loader2 className="eb:animate-spin" /> : <Sparkles />}
      </PromptForm>
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
      {running && (
        <p className="eb:flex eb:items-center eb:gap-2 eb:text-[12px] eb:text-foreground-muted" role="status" aria-live="polite">
          {running === 'custom' ? t('Writing…') : t('Rewriting…')}
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

/**
 * What the AI is asked, on a few lines so that the whole request stays in
 * view. Enter sends it, Shift+Enter starts a new line; an empty one is not
 * sent. `children`: the send button's icon.
 */
function PromptForm({ value, onChange, onSubmit, placeholder, label, busy, submitLabel, children }) {
  const ready = !busy && Boolean(value.trim());
  return (
    <form
      className="eb:flex eb:items-end eb:gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit();
      }}
    >
      <Textarea
        dense
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (ready) onSubmit();
        }}
        maxLength={MAX_REWRITE_INSTRUCTION}
        placeholder={placeholder}
        aria-label={label}
        disabled={busy}
        className="eb:min-h-16 eb:max-h-40 eb:resize-none"
      />
      <Button type="submit" variant="outline" size="icon-dense" aria-label={submitLabel} disabled={!ready}>
        {children}
      </Button>
    </form>
  );
}
