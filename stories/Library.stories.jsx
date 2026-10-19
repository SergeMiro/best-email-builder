import { useMemo, useState } from 'react';
import {
  EmailStudio,
  TemplateLibrary,
  createMemoryStorage,
  createStarterMjml,
  createDocument,
  ENGINE_NAME,
  parseMjml,
} from '../src/index.js';
import { toProject } from '../src/engine/model.js';

/**
 * The template library, alone and wired to the builder (`EmailStudio`).
 * Driven by `e2e/library.stories.spec.js`.
 *
 *   window.__libraryEvents  what the standalone library asked its host to open
 *   window.__emailStorage   the memory storage (reading what was saved)
 *
 * `?lang=fr` switches the interface to French; `?nodelete=1` turns Delete off
 * (`deleteDisabled`), as a demo would.
 */
export default {
  title: 'Library',
};

function fakeRender({ mjml, subject }) {
  // MJML only compiles on the server: the playground shows the source text.
  const text = String(mjml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return Promise.resolve({
    html: `<!doctype html><html><body><h1>${subject || ''}</h1><p data-preview>${text}</p></body></html>`,
    warnings: [],
    quality: [],
  });
}

/** Memory storage with two saved templates, tagged. `compile` gives them the HTML to copy or download. */
function seededStorage() {
  const storage = createMemoryStorage({ render: fakeRender, compile: fakeRender });
  const mjml = createStarterMjml({ sender: { name: 'Example Inc.', address: '1 Main Street, Springfield' } });
  const document = createDocument({ engine: ENGINE_NAME, engineVersion: '', project: toProject(parseMjml(mjml)) });
  const ready = (async () => {
    const marketing = await storage.saveTag({ label: 'Marketing', color: 'blue' }, { create: true });
    const onboarding = await storage.saveTag({ label: 'Onboarding', color: 'green' }, { create: true });
    const october = await storage.create({ name: 'October newsletter', subject: 'The news of the month', document, mjml });
    const welcome = await storage.create({ name: 'Welcome series — day 1', subject: 'Welcome aboard!', preheader: 'Three steps to get started.', document, mjml });
    await storage.setTemplateTags(october.template.id, [marketing.id]);
    await storage.setTemplateTags(welcome.template.id, [onboarding.id]);
  })();
  return {
    ...storage,
    async list() {
      await ready;
      return storage.list();
    },
    async listTags() {
      await ready;
      return storage.listTags();
    },
  };
}

const param = (name) => new URLSearchParams(window.location.search).get(name);
const locale = () => param('lang') || 'en';
const frame = { height: 760, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' };

export const Standalone = () => {
  const storage = useMemo(seededStorage, []);
  const [events, setEvents] = useState([]);
  window.__emailStorage = storage;
  window.__libraryEvents = events;
  return (
    <div style={frame} data-events={events.length}>
      <TemplateLibrary
        storage={storage}
        locale={locale()}
        deleteDisabled={param('nodelete') ? 'Deleting is turned off here.' : null}
        onEdit={(template) => setEvents((e) => [...e, { type: 'edit', id: template.id }])}
        onCreate={() => setEvents((e) => [...e, { type: 'create' }])}
        onClose={() => setEvents((e) => [...e, { type: 'close' }])}
      />
    </div>
  );
};

// Starts empty: templates are created through the builder, as a user would.
export const Studio = () => {
  const storage = useMemo(() => createMemoryStorage({ render: fakeRender, compile: fakeRender }), []);
  window.__emailStorage = storage;
  return (
    <div style={frame}>
      <EmailStudio storage={storage} locale={locale()} sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }} />
    </div>
  );
};
