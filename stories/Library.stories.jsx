import { useMemo, useState } from 'react';
import { EmailStudio, TemplateLibrary, createMemoryStorage, createStarterMjml, createDocument } from '../src/index.js';

/**
 * The template library, alone and wired to the builder (`EmailStudio`).
 * Driven by `e2e/library.stories.spec.js`.
 *
 *   window.__libraryEvents  what the standalone library asked its host to open
 *   window.__emailStorage   the memory storage (reading what was saved)
 *
 * `?lang=fr` switches the interface to French.
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

const EMPTY_PROJECT = { pages: [{ frames: [{ component: { type: 'wrapper', components: [] } }] }] };

/** Memory storage with two saved templates (their project is empty: listing and preview only). */
function seededStorage() {
  const storage = createMemoryStorage({ render: fakeRender });
  const document = createDocument({ engine: 'grapesjs-mjml', engineVersion: '0.23.6', project: EMPTY_PROJECT });
  const mjml = createStarterMjml({ sender: { name: 'Example Inc.', address: '1 Main Street, Springfield' } });
  storage.create({ name: 'October newsletter', subject: 'The news of the month', document, mjml });
  storage.create({ name: 'Welcome series — day 1', subject: 'Welcome aboard!', preheader: 'Three steps to get started.', document, mjml });
  return storage;
}

const locale = () => new URLSearchParams(window.location.search).get('lang') || 'en';
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
        sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }}
        onEdit={(template) => setEvents((e) => [...e, { type: 'edit', id: template.id }])}
        onCreate={(start) => setEvents((e) => [...e, { type: 'create', baseId: start?.baseId ?? null, mjml: start?.mjml ?? null }])}
        onClose={() => setEvents((e) => [...e, { type: 'close' }])}
      />
    </div>
  );
};

// Starts empty: templates are created through the builder, as a user would.
export const Studio = () => {
  const storage = useMemo(() => createMemoryStorage({ render: fakeRender }), []);
  window.__emailStorage = storage;
  return (
    <div style={frame}>
      <EmailStudio storage={storage} locale={locale()} sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }} />
    </div>
  );
};
