import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmailBuilder } from 'mailblocks';
import 'mailblocks/styles.css';
import { createDemoStorage } from './browserStorage.js';

const REPOSITORY_URL = import.meta.env.VITE_REPOSITORY_URL || 'https://github.com/';

const TEXT = {
  en: {
    tagline: 'Drag-and-drop email builder for React — MJML output that renders in Outlook, Gmail and Apple Mail.',
    note: 'Demo: templates stay in this browser; the preview compiles in the browser. A real app compiles on its server.',
    create: 'New template',
    empty: 'No template yet.',
    open: 'Open',
    remove: 'Delete',
    source: 'Source code',
  },
  fr: {
    tagline: 'Constructeur de courriels par glisser-déposer pour React — un rendu MJML fidèle dans Outlook, Gmail et Apple Mail.',
    note: 'Démo : les modèles restent dans ce navigateur, l’aperçu est compilé dans le navigateur.',
    create: 'Nouveau modèle',
    empty: 'Aucun modèle pour l’instant.',
    open: 'Ouvrir',
    remove: 'Supprimer',
    source: 'Code source',
  },
};

const initialLocale = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (fromUrl === 'en' || fromUrl === 'fr') return fromUrl;
  return navigator.language?.startsWith('fr') ? 'fr' : 'en';
};

function Button({ children, primary = false, ...props }) {
  return (
    <button
      type="button"
      {...props}
      style={{
        font: 'inherit',
        fontSize: 13,
        padding: '6px 12px',
        borderRadius: 8,
        cursor: 'pointer',
        border: primary ? '1px solid #5b4fe0' : '1px solid #d4d4d8',
        background: primary ? '#5b4fe0' : '#fff',
        color: primary ? '#fff' : '#27272a',
      }}
    >
      {children}
    </button>
  );
}

function App() {
  const storage = useMemo(() => createDemoStorage(), []);
  const [locale, setLocale] = useState(initialLocale);
  const [templates, setTemplates] = useState([]);
  const [open, setOpen] = useState(null);
  const text = TEXT[locale];

  const refresh = () => storage.list().then(setTemplates);
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (open) {
    return (
      <EmailBuilder
        key={`${open.id ?? 'new'}-${locale}`}
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
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>mailblocks</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {['en', 'fr'].map((code) => (
            <Button key={code} primary={code === locale} onClick={() => setLocale(code)} aria-pressed={code === locale}>
              {code.toUpperCase()}
            </Button>
          ))}
          <a href={REPOSITORY_URL} style={{ fontSize: 13, alignSelf: 'center', color: '#5b4fe0' }}>
            {text.source}
          </a>
        </div>
      </div>
      <p style={{ fontSize: 16, color: '#3f3f46', lineHeight: 1.5 }}>{text.tagline}</p>
      <p style={{ fontSize: 13, color: '#71717a' }}>{text.note}</p>
      <div style={{ margin: '28px 0 16px' }}>
        <Button primary onClick={() => setOpen({ id: null })}>
          {text.create}
        </Button>
      </div>
      <ul data-testid="template-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {templates.length === 0 && <li style={{ color: '#71717a', fontSize: 14 }}>{text.empty}</li>}
        {templates.map((template) => (
          <li
            key={template.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              background: '#fff',
              border: '1px solid #e4e4e7',
              borderRadius: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{template.name}</div>
              <div style={{ color: '#71717a', fontSize: 12 }}>{template.subject}</div>
            </div>
            <Button onClick={() => setOpen({ id: template.id })}>{text.open}</Button>
            <Button onClick={() => storage.remove(template.id).then(refresh)}>{text.remove}</Button>
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
