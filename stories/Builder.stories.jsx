import { useMemo, useState } from 'react';
import { createEmailEditor, emailBlocks, emailBuilderFeatures, EmailBuilder, createMemoryStorage } from '../src/index.js';
import { createNativeAdapter } from '../src/engine/NativeAdapter.js';
import { translatorFor } from '../src/i18n/index.js';
import { createEmailGenerator } from '../src/features/generate/generator.js';

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
 *   window.__generated     what "Generate" asked the fake model (purpose, details,
 *                          language, sender, variables); `__generateDelay` (ms)
 *                          and `__generateFail` (an error message) drive it
 *   window.__rewritten     what "Rewrite with AI" asked (action, text, format…);
 *                          the fake model answers `__rewriteAnswers` in turn,
 *                          else the text with "Rewritten:" in front;
 *                          `__rewriteDelay`, `__rewriteFail` as above
 *   window.__subjectAsks   what "Suggest subjects" asked (subject, text, avoid…);
 *                          the fake model answers `__subjectAnswers` in turn
 *                          (an array of subjects each), else three fixed ones;
 *                          `__subjectDelay`, `__subjectFail` as above
 *   window.__brandImports  the addresses "Get my brand" was asked to read; the
 *                          fake answers `__brandResult` ({brand, notes}) or the
 *                          Acme Rockets brand; `__brandDelay`, `__brandFail` as above
 *
 * `?lang=fr` in the story URL switches the interface to French.
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

/**
 * "Generate" without a model: the real generator (cleaning, checks) around a
 * fake model that answers a fixed email in the shape models get wrong —
 * shorthand padding, a stock photo, an unknown variable.
 */
const FAKE_EMAIL = {
  name: 'Password reset',
  subject: 'Reset your password',
  preheader: 'A link to choose a new password, valid for one hour.',
  mjml:
    '<mjml><mj-body><mj-section background-color="#ffffff" padding="32px 0px"><mj-column>' +
    '<mj-image src="https://picsum.photos/600/200" alt="A padlock"></mj-image>' +
    '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="28px" line-height="36px" color="#212e5a" font-weight="bold">Reset your password</mj-text>' +
    '<mj-text font-family="Arial, Helvetica, sans-serif" font-size="15px" line-height="24px" color="#2b3038">Hello {{contact.firstname|there}}, use code {{reset.code}} or the button below.</mj-text>' +
    '<mj-button href="https://example.com/reset-password" background-color="#2977bc" color="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="15px" font-weight="bold" border-radius="6px" inner-padding="12px 28px">Reset my password</mj-button>' +
    '</mj-column></mj-section></mj-body></mjml>',
};

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

const fakeGenerator = createEmailGenerator({
  model: async ({ signal, task, messages }) => {
    if (task === 'rewrite') {
      await wait(window.__rewriteDelay ?? 300, signal);
      if (window.__rewriteFail) throw new Error(window.__rewriteFail);
      const asked = /<text>\n([\s\S]*)\n<\/text>/.exec(messages[0].content)?.[1] ?? '';
      return JSON.stringify({ text: window.__rewriteAnswers?.length ? window.__rewriteAnswers.shift() : `Rewritten: ${asked}` });
    }
    if (task === 'subjects') {
      await wait(window.__subjectDelay ?? 300, signal);
      if (window.__subjectFail) throw new Error(window.__subjectFail);
      const subjects = window.__subjectAnswers?.length
        ? window.__subjectAnswers.shift()
        : ['Your new password is one click away', 'Locked out? Not for long', '{{contact.firstname}}, reset your password'];
      return JSON.stringify({ subjects });
    }
    await wait(window.__generateDelay ?? 300, signal);
    if (window.__generateFail) throw new Error(window.__generateFail);
    return JSON.stringify(FAKE_EMAIL);
  },
});

function fakeGenerate(input, options) {
  window.__generated = [...(window.__generated || []), input];
  return fakeGenerator.generate(input, options);
}

function fakeSuggestSubjects(input, options) {
  window.__subjectAsks = [...(window.__subjectAsks || []), input];
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

function Session({ storage, templateId, initial, onClose, locale }) {
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
      sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }}
    />
  );
}

function Bench() {
  const locale = new URLSearchParams(window.location.search).get('lang') || 'en';
  const storage = useMemo(
    () =>
      createMemoryStorage({
        render: fakeRender,
        sendTest: fakeSendTest,
        generate: fakeGenerate,
        rewrite: fakeRewrite,
        suggestSubjects: fakeSuggestSubjects,
        importBrand: fakeImportBrand,
      }),
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
