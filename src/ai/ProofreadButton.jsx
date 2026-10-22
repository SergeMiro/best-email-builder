import { useEffect, useRef, useState } from 'react';
import { Check, CircleCheck, Loader2, SpellCheck, TriangleAlert } from 'lucide-react';
import { useUi } from '../ui/context.jsx';
import { Button } from '../ui/primitives/button.jsx';
import { cn } from '../ui/primitives/cn.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/primitives/overlays.jsx';
import { cleanRichText } from '../engine/richText.js';
import { diffWords } from './diff.js';
import { visibleText } from './subjects.js';

/**
 * PROOFREAD — toolbar button and dialog: the mistakes of the whole email.
 *
 * One click reads every text the reader sees — the subject, the preview
 * text, the text blocks, the buttons, the menu links — and lists the ones
 * with a mistake: the old words struck out, the new ones next to them. Each
 * correction is applied on its own or all at once; in the email, all of them
 * are one step of the history (Ctrl+Z brings the texts back). Nothing changes
 * before the user applies it.
 *
 * A text edited while the email is read, or before its correction is
 * applied, is left as it is: the correction was for the old one. Who reads it
 * — an AI, or LanguageTool (languagetool.js) — is the `proofread` function's.
 */

/** Tags whose content is a label of plain words (EmailEditor `content`). */
const LABEL_TAGS = { 'mj-button': 'button', 'mj-navbar-link': 'link' };

/** What each kind of text is called in the list. */
const KIND_LABELS = { subject: 'Subject', preheader: 'Preview text', text: 'Text', button: 'Button', link: 'Menu link' };

/**
 * The texts of the email, in order: as they are stored, under the id the
 * correction comes back with.
 * @param {any} editor @param {{subject: string, preheader: string}} meta
 */
function textsOf(editor, meta) {
  /** @type {{id: string, kind: keyof typeof KIND_LABELS, format: 'html'|'plain', text: string}[]} */
  const texts = [];
  if (meta.subject.trim()) texts.push({ id: 'subject', kind: 'subject', format: 'plain', text: meta.subject.trim() });
  if (meta.preheader.trim()) texts.push({ id: 'preheader', kind: 'preheader', format: 'plain', text: meta.preheader.trim() });
  const walk = (/** @type {any} */ node) => {
    if (!node || typeof node !== 'object') return;
    const element = node.tag === 'mj-text' || LABEL_TAGS[node.tag] ? editor.getElement(node.id) : null;
    if (node.tag === 'mj-text' && element?.html) texts.push({ id: node.id, kind: 'text', format: 'html', text: element.html });
    else if (LABEL_TAGS[node.tag] && element?.content) texts.push({ id: node.id, kind: LABEL_TAGS[node.tag], format: 'plain', text: element.content });
    for (const child of node.children || []) walk(child);
  };
  walk(editor.getDocument().project?.root);
  return texts;
}

/** The text of one entry as it is now. @param {any} editor @param {{subject: string, preheader: string}} meta @param {string} id */
function currentText(editor, meta, id) {
  if (id === 'subject' || id === 'preheader') return meta[id].trim();
  const element = editor.getElement(id);
  return (element?.tagName === 'mj-text' ? element?.html : element?.content) ?? null;
}

export default function ProofreadButton({ context, proofread }) {
  const { editor, ready, meta, setMeta } = context;
  const { t, locale, notify } = useUi();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  /** @type {[{id: string, kind: keyof typeof KIND_LABELS, format: 'html'|'plain', before: string, after: string, state: 'open'|'applied'|'stale'}[]|null, Function]} */
  const [fixes, setFixes] = useState(null);
  const abortRef = useRef(/** @type {AbortController|null} */ (null));
  const metaRef = useRef(meta);
  metaRef.current = meta;

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!busy) return undefined;
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  // Another email loaded: these corrections were for the previous one.
  useEffect(
    () =>
      editor.on('load', () => {
        abortRef.current?.abort();
        setOpen(false);
      }),
    [editor]
  );

  const run = async () => {
    if (busy) return;
    const texts = textsOf(editor, metaRef.current);
    setError('');
    setFixes(null);
    if (!texts.length) {
      setError(t('The email has no text to check yet.'));
      return;
    }
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await proofread(
        { texts: texts.map(({ id, kind, format, text }) => ({ id, kind, format, text })), language: String(locale || 'en').slice(0, 2) },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      const sent = new Map(texts.map((text) => [text.id, text]));
      setFixes(
        result.fixes
          .filter((fix) => sent.has(fix.id))
          .map((fix) => {
            const text = /** @type {(typeof texts)[number]} */ (sent.get(fix.id));
            // Edited while it was read: the correction is for the old text.
            const stale = currentText(editor, metaRef.current, fix.id) !== text.text;
            return { id: fix.id, kind: text.kind, format: text.format, before: text.text, after: fix.text, state: stale ? 'stale' : 'open' };
          })
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(err?.message ? t(err.message) : t('The email could not be checked.'));
    } finally {
      // A reading cancelled for a newer one leaves that one busy.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };

  // Read once the dialog is there. Without a key yet, the reading opens the
  // Connect dialog, which then comes above this one; opened in the same
  // render, it was hidden from screen readers and the keyboard.
  useEffect(() => {
    if (!open) return undefined;
    run();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openDialog = () => setOpen(true);

  const close = (next) => {
    if (next) return;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setOpen(false);
  };

  /**
   * Applies corrections still open, those whose text has not changed since;
   * the others are marked. The texts of the email change in one step.
   * @param {string[]} ids
   */
  const apply = (ids) => {
    if (!fixes) return;
    const wanted = new Set(ids);
    /** @type {{id: string, content: string}[]} */
    const contents = [];
    /** @type {Partial<{subject: string, preheader: string}>} */
    const metaChanges = {};
    const next = fixes.map((fix) => {
      if (!wanted.has(fix.id) || fix.state !== 'open') return fix;
      if (currentText(editor, metaRef.current, fix.id) !== fix.before) return { ...fix, state: /** @type {const} */ ('stale') };
      if (fix.id === 'subject' || fix.id === 'preheader') metaChanges[fix.id] = fix.after;
      else contents.push({ id: fix.id, content: fix.format === 'html' ? cleanRichText(fix.after, document) : fix.after });
      return { ...fix, state: /** @type {const} */ ('applied') };
    });
    if (contents.length) editor.setContents(contents);
    if (Object.keys(metaChanges).length) setMeta((current) => ({ ...current, ...metaChanges }));
    setFixes(next);
    const applied = next.filter((fix, index) => fix.state === 'applied' && fixes[index].state !== 'applied').length;
    if (applied && next.every((fix) => fix.state !== 'open')) {
      setOpen(false);
      notify('success', t('Corrections applied: {count}.', { count: next.filter((fix) => fix.state === 'applied').length }));
    }
  };

  const remaining = (fixes || []).filter((fix) => fix.state === 'open');

  return (
    <>
      <Button variant="outline" size="sm-compact" disabled={!ready} onClick={openDialog}>
        <SpellCheck />
        {t('Proofread')}
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="eb:flex eb:max-h-[calc(100dvh-2rem)] eb:flex-col eb:gap-0 eb:p-0 eb:sm:max-w-xl" data-testid="eb-proofread">
          <DialogHeader className="eb:gap-1.5 eb:px-6 eb:pt-6 eb:pb-4">
            <DialogTitle>{t('Proofread the email')}</DialogTitle>
            <DialogDescription>{t('Every text is checked for spelling, grammar and punctuation mistakes. Nothing changes until you apply it.')}</DialogDescription>
          </DialogHeader>

          <div className="eb:min-h-0 eb:flex-1 eb:overflow-y-auto eb:border-t eb:border-border eb:px-6 eb:py-4">
            {busy && (
              <p className="eb:flex eb:items-center eb:gap-2 eb:py-6 eb:text-[13px] eb:text-foreground-muted" role="status" aria-live="polite">
                <Loader2 className="eb:size-4 eb:animate-spin" aria-hidden="true" />
                {t('Reading the email… {seconds} s', { seconds })}
              </p>
            )}
            {error && (
              <p role="alert" className="eb:flex eb:items-start eb:gap-1.5 eb:py-2 eb:text-[13px] eb:text-destructive">
                <TriangleAlert className="eb:mt-0.5 eb:size-3.5 eb:shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
            {fixes && !fixes.length && (
              <p className="eb:flex eb:items-center eb:gap-2 eb:py-6 eb:text-[13px] eb:text-foreground" role="status">
                <CircleCheck className="eb:size-4 eb:text-success" aria-hidden="true" />
                {t('No mistake found.')}
              </p>
            )}
            {fixes && fixes.length > 0 && (
              <ul className="eb:flex eb:flex-col eb:gap-2.5" aria-label={t('Corrections')}>
                {fixes.map((fix) => (
                  <li
                    key={fix.id}
                    className={cn('eb:rounded-md eb:border eb:border-border eb:p-3', fix.state !== 'open' && 'eb:bg-muted/40')}
                    data-testid="eb-proofread-fix"
                    data-state={fix.state}
                  >
                    <div className="eb:mb-1.5 eb:flex eb:items-center eb:gap-2">
                      <span className="eb:text-[11px] eb:font-medium eb:tracking-wide eb:text-foreground-muted eb:uppercase">{t(KIND_LABELS[fix.kind])}</span>
                      <span className="eb:ml-auto">
                        {fix.state === 'open' && (
                          <Button variant="outline" size="xs" onClick={() => apply([fix.id])}>
                            {t('Apply')}
                          </Button>
                        )}
                        {fix.state === 'applied' && (
                          <span className="eb:flex eb:items-center eb:gap-1 eb:text-[12px] eb:text-success">
                            <Check className="eb:size-3.5" aria-hidden="true" />
                            {t('Applied')}
                          </span>
                        )}
                        {fix.state === 'stale' && (
                          <span className="eb:text-[12px] eb:text-foreground-muted">{t('Text changed since — left as it is')}</span>
                        )}
                      </span>
                    </div>
                    <Changes before={fix.before} after={fix.after} html={fix.format === 'html'} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="eb:flex eb:items-center eb:justify-end eb:gap-2 eb:border-t eb:border-border eb:px-6 eb:py-4">
            {busy ? (
              <Button variant="outline" size="sm" onClick={() => close(false)}>
                {t('Cancel')}
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="eb:mr-auto" onClick={run}>
                  {t('Check again')}
                </Button>
                {remaining.length > 0 ? (
                  <Button size="sm" onClick={() => apply(remaining.map((fix) => fix.id))} data-testid="eb-proofread-apply-all">
                    <Check />
                    {t('Apply all ({count})', { count: remaining.length })}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => close(false)}>
                    {t('Close')}
                  </Button>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * The words a correction changes: the old ones struck out, the new ones
 * marked, in the flow of the text.
 */
function Changes({ before, after, html }) {
  const parts = diffWords(html ? visibleText(before) : before, html ? visibleText(after) : after);
  return (
    <p className="eb:text-[13px] eb:leading-relaxed eb:break-words eb:whitespace-pre-line eb:text-foreground">
      {parts.map((part, index) =>
        part.type === 'same' ? (
          <span key={index}>{around(part.text, index === 0, index === parts.length - 1)}</span>
        ) : part.type === 'removed' ? (
          <del key={index} className="eb:rounded-sm eb:bg-destructive/10 eb:text-destructive eb:line-through">
            {part.text}
          </del>
        ) : (
          <ins key={index} className="eb:rounded-sm eb:bg-success/15 eb:text-success eb:no-underline">
            {part.text}
          </ins>
        )
      )}
    </p>
  );
}

/** Words kept on each side of a change; a longer stretch is cut short. */
const CONTEXT = 48;

/**
 * Unchanged words between corrections, shortened around them: a long text
 * shows where its mistakes are, not the whole of it.
 * @param {string} text @param {boolean} first @param {boolean} last
 */
function around(text, first, last) {
  if (text.length <= CONTEXT * 2 + 8) return text;
  const head = (/** @type {string} */ value) => value.slice(0, CONTEXT).replace(/\s\S*$/, '');
  const tail = (/** @type {string} */ value) => value.slice(-CONTEXT).replace(/^\S*\s/, '');
  if (first && last) return text;
  if (first) return `…${tail(text)}`;
  if (last) return `${head(text)}…`;
  return `${head(text)} … ${tail(text)}`;
}
