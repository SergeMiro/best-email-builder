import { useMemo, useState } from 'react';
import { createEmailEditor, emailBlocks, emailBuilderFeatures, EmailBuilder, createMemoryStorage } from '../src/index.js';
import { createNativeAdapter } from '../src/engine/NativeAdapter.js';
import { translatorFor } from '../src/i18n/index.js';

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
  const storage = useMemo(() => createMemoryStorage({ render: fakeRender, sendTest: fakeSendTest }), []);
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
