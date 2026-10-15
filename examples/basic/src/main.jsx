import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmailBuilder, createHttpStorage } from 'best-email-builder';
import 'best-email-builder/styles.css';

const storage = createHttpStorage({ baseUrl: '/api/email-builder', brand: true });
const locale = new URLSearchParams(window.location.search).get('lang') || 'en';

/** A minimal template list around the builder. */
function App() {
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(null); // null: list ; { id }: builder

  const refresh = () =>
    fetch('/api/email-builder/templates')
      .then((res) => res.json())
      .then((json) => setTemplates(json.data || []));

  useEffect(() => {
    refresh();
  }, []);

  if (open) {
    return (
      <EmailBuilder
        key={open.id ?? 'new'}
        storage={storage}
        templateId={open.id}
        locale={locale}
        sender={{ name: 'Example Inc.', address: '1 Main Street, Springfield' }}
        onClose={() => {
          setOpen(null);
          refresh();
        }}
      />
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: '48px auto', padding: '0 16px' }}>
      <h1 style={{ fontSize: 22 }}>Best Email Builder example</h1>
      <p style={{ color: '#555' }}>Templates are kept in memory by the dev server.</p>
      <button type="button" onClick={() => setOpen({ id: null })}>
        New template
      </button>
      <ul data-testid="template-list" style={{ marginTop: 24, paddingLeft: 18 }}>
        {templates.map((template) => (
          <li key={template.id} style={{ margin: '6px 0' }}>
            <button type="button" onClick={() => setOpen({ id: template.id })}>
              {template.name}
            </button>{' '}
            <small style={{ color: '#777' }}>{template.subject}</small>
          </li>
        ))}
      </ul>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
