import { useMemo, useState } from 'react';
import {
  createEmailEditor,
  emailBlocks,
  emailBuilderFeatures,
  EmailBuilder,
  createMemoryStorage,
  DEFAULT_VARIABLES,
  EXAMPLE_VARIABLES,
} from '../src/index.js';
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
 *   window.__rewritten     what "Write with AI" asked (action, text, format…);
 *                          the fake model answers `__rewriteAnswers` in turn,
 *                          else the text with "Rewritten:" in front (for the
 *                          user's own words: "Written about" them);
 *                          `__rewriteDelay`, `__rewriteFail` as above
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
 * "Write with AI" (`createAi({ rewrite })`).
 */
export default {
  title: 'Builder',
};

const QUALITY_SAMPLE = [{ code: 'IMAGE_NO_ALT', level: 'warning', message: 'Images without alt text: 1' }];

/** The host's contacts (`?contacts=1`): their values are the server's, never sent by the browser. */
const FAKE_CONTACTS = [
  { id: '11', email: 'ada@example.com', label: 'Ada Lovelace', detail: 'Analytical Engines', lists: ['1'] },
  { id: '12', email: 'grace@example.com', label: 'Grace Hopper', detail: 'Navy', lists: ['1', '2'] },
];
const FAKE_LISTS = [
  { id: '1', name: 'Pioneers', detail: null, count: 2 },
  { id: '2', name: 'Navy', detail: null, count: 1 },
];

function fakeSearchContacts(query, { list = null } = {}) {
  const term = String(query || '').toLowerCase();
  return Promise.resolve(
    FAKE_CONTACTS.filter((c) => (!list || c.lists.includes(list)) && `${c.label} ${c.email} ${c.detail}`.toLowerCase().includes(term)).map(
      ({ lists: _lists, ...c }) => c
    )
  );
}

const fakeContactLists = () => Promise.resolve(FAKE_LISTS);

function fakeRender({ mjml, subject, contactId, email }) {
  // MJML only compiles on the server: the playground shows the source text.
  const text = String(mjml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const contact = FAKE_CONTACTS.find((c) => c.id === contactId);
  const who = contact?.label || email || 'sample';
  return Promise.resolve({
    html: `<!doctype html><html><body><h1>${subject || ''}</h1><p data-recipient>${who}</p><p data-preview>${text}</p></body></html>`,
    subject: `${subject || ''} — ${who}`,
    values: contact
      ? { 'contact.firstname': contact.label.split(' ')[0], 'contact.email': contact.email }
      : { 'contact.firstname': 'Jane', 'contact.email': email || 'jane@example.com' },
    warnings: [],
    quality: QUALITY_SAMPLE,
  });
}

async function fakeSendTest({ emails, contacts = [], subject }) {
  // Long enough to see the preview go from one recipient to the next.
  await new Promise((resolve) => setTimeout(resolve, Number(new URLSearchParams(window.location.search).get('sendMs')) || 0));
  const all = [...contacts.map((id) => FAKE_CONTACTS.find((c) => c.id === id)?.email).filter(Boolean), ...emails];
  window.__sentTests = [...(window.__sentTests || []), ...all.map((to) => ({ to, subject: `[TEST] ${subject || ''}` }))];
  return {
    sent: all.length,
    failed: 0,
    invalid: [],
    results: all.map((email) => ({ email, ok: true, error: null })),
  };
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
      // A topic, or the user's own words: written about, as a model would.
      const topic = /^Change: (?:Write a new text about|The user asks): ([\s\S]*?) (?:It is|If this says) /.exec(asking)?.[1];
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

/**
 * The bench's system variables: a ready-made set, or with `?variables=default`
 * what an npm install starts with (none but the unsubscribe link).
 */
function benchVariables(mode) {
  return mode === 'default' ? DEFAULT_VARIABLES : [...EXAMPLE_VARIABLES, ...DEFAULT_VARIABLES];
}

function Session({ storage, templateId, initial, onClose, locale, ai, variables }) {
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
      variables={variables}
      sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }}
    />
  );
}

function Bench() {
  const params = new URLSearchParams(window.location.search);
  const locale = params.get('lang') || 'en';
  const aiMode = params.get('ai');
  const ai = useMemo(() => benchAi(aiMode), [aiMode]);
  const variablesMode = params.get('variables');
  const variables = useMemo(() => benchVariables(variablesMode), [variablesMode]);
  const contacts = params.get('contacts') === '1';
  const storage = useMemo(
    () =>
      createMemoryStorage({
        render: fakeRender,
        sendTest: fakeSendTest,
        ...(contacts ? { searchContacts: fakeSearchContacts, contactLists: fakeContactLists } : {}),
        importBrand: fakeImportBrand,
        systemVariables: variables,
      }),
    [variables, contacts]
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
          variables={variables}
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
