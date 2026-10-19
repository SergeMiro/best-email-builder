import { useMemo, useState } from 'react';
import { createEmailEditor, emailBlocks, emailBuilderFeatures, EmailBuilder, createMemoryStorage } from '../src/index.js';
import { createNativeAdapter } from '../src/engine/NativeAdapter.js';
import { translatorFor } from '../src/i18n/index.js';
import { createAi } from '../src/ai/createAi.js';
import { createEmailGenerator } from '../src/ai/generator.js';

/**
 * The complete builder screen, without network or session (memory storage).
 * Driven by `e2e/builder.stories.spec.js` with mouse and keyboard, like a user.
 *
 * Exposed for assertions (never to act instead of the interface):
 *   window.__emailEditor   the mounted editor (reading the MJML)
 *   window.__emailStorage  the memory storage (rows, versions; simulating a
 *                          second editor)
 *   window.__reopenBuilder(id|null, {mjml, meta}?)  close then reopen the screen
 *   window.__setAutosave({ idleMs, maxWaitMs, draftDelayMs })  short delays
 *   window.__sentTests     test sends received by the fake transport
 *   window.__proofread     what "Proofread" asked (texts, language); the fake
 *                          model answers `__proofreadAnswers` in turn (`{fixes}`
 *                          each), else corrects the typos of TYPOS wherever
 *                          they are; `__proofreadDelay` (ms) and
 *                          `__proofreadFail` (an error message) drive it
 *   window.__rewritten     what "Write with AI" and "Rewrite with AI" asked
 *                          (action, text, format…); the fake model answers
 *                          `__rewriteAnswers` in turn, else the text with
 *                          "Rewritten:" in front (a text written: "Written
 *                          about" the topic); `__rewriteDelay`, `__rewriteFail`
 *                          as above
 *   window.__subjectAsks   what "Suggest subjects" asked (subject, text, avoid…);
 *                          the fake model answers `__subjectAnswers` in turn
 *                          (an array of subjects each), else three fixed ones;
 *                          `__subjectDelay`, `__subjectFail` as above;
 *                          `__subjectLate` answers even after a cancel;
 *                          `__subjectAborted` is set when a request is cancelled
 *   window.__brandImports  the addresses "Get my brand" was asked to read; the
 *                          fake answers `__brandResult` ({brand, notes}) or the
 *                          Acme Rockets brand; `__brandDelay`, `__brandFail` as above
 *
 * `?lang=fr` in the story URL switches the interface to French. The AI module
 * (`createAi`) is given by default; `?ai=off` opens the builder without it, as
 * an application that does not install it, and `?ai=rewrite` with only
 * "Rewrite with AI" (`createAi({ rewrite })`).
 */
export default {
  title: 'Builder',
};

const QUALITY_SAMPLE = [{ code: 'IMAGE_NO_ALT', level: 'warning', message: 'Images without alt text: 1' }];

function fakeRender({ mjml, subject }) {
  // MJML only compiles on the server: the playground shows the source text.
  const text = String(mjml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return Promise.resolve({
    html: `<!doctype html><html><body><h1>${subject || ''}</h1><p data-preview>${text}</p></body></html>`,
    warnings: [],
    quality: QUALITY_SAMPLE,
  });
}

function fakeSendTest({ emails, subject }) {
  window.__sentTests = [...(window.__sentTests || []), ...emails.map((to) => ({ to, subject: `[TEST] ${subject || ''}` }))];
  return Promise.resolve({
    sent: emails.length,
    failed: 0,
    invalid: [],
    results: emails.map((email) => ({ email, ok: true, error: null })),
  });
}

/** The mistakes the fake proofreader corrects, wherever they are. */
const TYPOS = [
  [/\bsumer\b/g, 'summer'],
  [/\bteh\b/g, 'the'],
  [/\brecieve\b/g, 'receive'],
  [/\bprodcuts\b/g, 'products'],
];

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/** The real generator (reading, checks, repair turn) around a fake model. */
const fakeGenerator = createEmailGenerator({
  model: async ({ signal, task, messages }) => {
    const asking = messages[0].content;
    if (task === 'rewrite' && asking.includes('<text id=')) {
      await wait(window.__proofreadDelay ?? 300, signal);
      if (window.__proofreadFail) throw new Error(window.__proofreadFail);
      if (window.__proofreadAnswers?.length) return JSON.stringify(window.__proofreadAnswers.shift());
      const fixes = [...asking.matchAll(/<text id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/text>/g)]
        .map(([, id, text]) => ({ id, text, fixed: TYPOS.reduce((words, [typo, word]) => words.replace(typo, word), text) }))
        .filter(({ text, fixed }) => fixed !== text)
        .map(({ id, fixed }) => ({ id, text: fixed }));
      return JSON.stringify({ fixes });
    }
    if (task === 'rewrite') {
      await wait(window.__rewriteDelay ?? 300, signal);
      if (window.__rewriteFail) throw new Error(window.__rewriteFail);
      if (window.__rewriteAnswers?.length) return JSON.stringify({ text: window.__rewriteAnswers.shift() });
      const topic = /^Change: Write a new text about: (.*?) It is /.exec(asking)?.[1];
      const asked = /<text>\n([\s\S]*)\n<\/text>/.exec(asking)?.[1] ?? '';
      return JSON.stringify({ text: topic ? `<p>Written about ${topic}.</p>` : `Rewritten: ${asked}` });
    }
    if (task === 'subjects') {
      // `__subjectLate`: a model that settles after it was cancelled.
      await wait(window.__subjectDelay ?? 300, window.__subjectLate ? undefined : signal);
      if (window.__subjectFail) throw new Error(window.__subjectFail);
      const subjects = window.__subjectAnswers?.length
        ? window.__subjectAnswers.shift()
        : ['Your new password is one click away', 'Locked out? Not for long', '{{contact.firstname}}, reset your password'];
      return JSON.stringify({ subjects });
    }
    throw new Error(`No fake answer for the task ${task}`);
  },
});

function fakeProofread(input, options) {
  window.__proofread = [...(window.__proofread || []), input];
  return fakeGenerator.proofread(input, options);
}

function fakeSuggestSubjects(input, options) {
  window.__subjectAsks = [...(window.__subjectAsks || []), input];
  options?.signal?.addEventListener('abort', () => (window.__subjectAborted = true));
  return fakeGenerator.suggestSubjects(input, options);
}

function fakeRewrite(input, options) {
  window.__rewritten = [...(window.__rewritten || []), input];
  return fakeGenerator.rewrite(input, options);
}

const ACME = {
  brand: { name: 'Acme Rockets', primary: '#e91e63', heading: '#1a1a2e', font: 'Georgia, Times, serif', website: 'https://acme.example/' },
  notes: ['LOGO_NOT_FOUND'],
};

/** "Get my brand" without a network (the real reading is tested on the server). */
async function fakeImportBrand(url, { signal } = {}) {
  window.__brandImports = [...(window.__brandImports || []), url];
  await wait(window.__brandDelay ?? 300, signal);
  if (window.__brandFail) throw new Error(window.__brandFail);
  return window.__brandResult || ACME;
}

/** The AI module of the bench, from `?ai=`: all of it (the fake model), only the rewriting, or none. */
function benchAi(mode) {
  if (mode === 'off') return null;
  if (mode === 'rewrite') return createAi({ rewrite: fakeRewrite });
  return createAi({ proofread: fakeProofread, rewrite: fakeRewrite, suggestSubjects: fakeSuggestSubjects });
}

function Session({ storage, templateId, initial, onClose, locale, ai }) {
  const adapter = useMemo(() => createNativeAdapter(), []);
  const editor = useMemo(
    () => createEmailEditor({ adapter, blocks: emailBlocks, features: emailBuilderFeatures, t: translatorFor(locale) }),
    [adapter, locale]
  );
  if (typeof window !== 'undefined') {
    window.__emailEditor = editor;
    window.__emailAdapter = adapter;
  }
  return (
    <EmailBuilder
      editor={editor}
      storage={storage}
      templateId={templateId}
      initialMjml={initial?.mjml}
      initialMeta={initial?.meta}
      onClose={onClose}
      locale={locale}
      ai={ai}
      sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }}
    />
  );
}

function Bench() {
  const params = new URLSearchParams(window.location.search);
  const locale = params.get('lang') || 'en';
  const aiMode = params.get('ai');
  const ai = useMemo(() => benchAi(aiMode), [aiMode]);
  const storage = useMemo(
    () => createMemoryStorage({ render: fakeRender, sendTest: fakeSendTest, importBrand: fakeImportBrand }),
    []
  );
  const [session, setSession] = useState({ key: 0, templateId: null, open: true });
  const [closed, setClosed] = useState(0);
  window.__emailStorage = storage;
  window.__reopenBuilder = (templateId = null, initial = null) =>
    setSession((s) => ({ key: s.key + 1, templateId, initial, open: true }));
  window.__setAutosave = (options) => Object.assign(emailBuilderFeatures.get('autosave').options, options);
  return (
    <div data-testid="bench" data-closed={closed} style={{ height: 760, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      {session.open && (
        <Session
          key={session.key}
          storage={storage}
          templateId={session.templateId}
          initial={session.initial}
          locale={locale}
          ai={ai}
          onClose={() => {
            setClosed((n) => n + 1);
            setSession((s) => ({ ...s, open: false }));
          }}
        />
      )}
    </div>
  );
}

export const Interface = () => <Bench />;
