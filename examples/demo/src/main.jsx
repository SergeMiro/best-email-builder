import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmailBuilder } from 'best-email-builder';
import 'best-email-builder/styles.css';
import { Check, Copy, Info, Languages, LayoutTemplate, Mail, PencilLine, Plus, Smartphone, Trash2 } from 'lucide-react';
import { createDemoStorage } from './browserStorage.js';

const REPOSITORY_URL = import.meta.env.VITE_REPOSITORY_URL || 'https://github.com/SergeMiro/best-email-builder';

const INSTALL = 'npm install best-email-builder';
const AUTHOR_URL = 'https://smiro.dev';

const TEXT = {
  en: {
    eyebrow: 'Open source · MIT',
    tagline: 'Drag-and-drop email builder for React — MJML output that renders in Outlook, Gmail and Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Ready-made templates', 'Phone and tablet', 'English and French'],
    note: 'Demo: templates stay in this browser; the preview compiles in the browser. A real app compiles on its server.',
    templates: 'Your templates',
    create: 'New template',
    empty: 'No template yet.',
    emptyHint: 'Start from a blank page or from one of the ready-made emails.',
    open: 'Open',
    remove: 'Delete',
    source: 'Source code',
    copy: 'Copy the install command',
    copied: 'Copied',
    noSubject: 'No subject',
    madeBy: 'Made by',
  },
  fr: {
    eyebrow: 'Open source · MIT',
    tagline: 'Constructeur de courriels par glisser-déposer pour React — un rendu MJML fidèle dans Outlook, Gmail et Apple Mail.',
    chips: ['Outlook, Gmail, Apple Mail', 'Modèles prêts à l’emploi', 'Téléphone et tablette', 'Anglais et français'],
    note: 'Démo : les modèles restent dans ce navigateur, l’aperçu est compilé dans le navigateur.',
    templates: 'Vos modèles',
    create: 'Nouveau modèle',
    empty: 'Aucun modèle pour l’instant.',
    emptyHint: 'Partez d’une page vierge ou de l’un des courriels prêts à l’emploi.',
    open: 'Ouvrir',
    remove: 'Supprimer',
    source: 'Code source',
    copy: 'Copier la commande d’installation',
    copied: 'Copié',
    noSubject: 'Sans objet',
    madeBy: 'Réalisé par',
  },
};

const CHIP_ICONS = [Mail, LayoutTemplate, Smartphone, Languages];

const initialLocale = () => {
  const fromUrl = new URLSearchParams(window.location.search).get('lang');
  if (fromUrl === 'en' || fromUrl === 'fr') return fromUrl;
  return navigator.language?.startsWith('fr') ? 'fr' : 'en';
};

/** GitHub's mark (lucide no longer ships brand icons). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/**
 * The author's mark, as on smiro.dev: a window, a spark in its corner and a
 * code sign inside, standing between the given name and the family name.
 */
function AuthorMark() {
  return (
    <svg className="made-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.5 6C7.022 6 4.782 6 3.391 7.172S2 10.229 2 14s0 5.657 1.391 6.828S7.021 22 11.5 22c4.478 0 6.718 0 8.109-1.172S21 17.771 21 14c0-1.17 0-2.158-.041-3" />
      <path d="m18.5 2l.258.697c.338.914.507 1.371.84 1.704c.334.334.791.503 1.705.841L22 5.5l-.697.258c-.914.338-1.371.507-1.704.84c-.334.334-.503.791-.841 1.705L18.5 9l-.258-.697c-.338-.914-.507-1.371-.84-1.704c-.334-.334-.791-.503-1.705-.841L15 5.5l.697-.258c.914-.338 1.371-.507 1.704-.84c.334-.334.503-.791.841-1.705z" />
      <path d="m15.5 12l1.227 1.057c.515.445.773.667.773.943s-.258.498-.773.943L15.5 16m-8-4l-1.227 1.057c-.515.445-.773.667-.773.943s.258.498.773.943L7.5 16m5-5l-2 6" />
    </svg>
  );
}

function InstallCommand({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused (insecure context, permissions): the command stays selectable.
    }
  };
  return (
    <div className="install">
      <code>
        <b>$</b> {INSTALL}
      </code>
      <button type="button" onClick={copy} aria-label={copied ? text.copied : text.copy} title={copied ? text.copied : text.copy}>
        {copied ? <Check /> : <Copy />}
      </button>
    </div>
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
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
    <div className="landing">
      <header className="wrap topbar">
        <span className="brand">
          <span className="brand-mark">
            <Mail aria-hidden="true" />
          </span>
          <span className="brand-name">Best Email Builder</span>
        </span>
        <div className="topbar-actions">
          <div className="segmented" role="group" aria-label="Language">
            {['en', 'fr'].map((code) => (
              <button key={code} type="button" onClick={() => setLocale(code)} aria-pressed={code === locale}>
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <a className="btn" href={REPOSITORY_URL} aria-label={text.source}>
            <GitHubMark />
            <span className="btn-label">{text.source}</span>
          </a>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <span className="eyebrow">
            <i aria-hidden="true" />
            {text.eyebrow}
          </span>
          <h1>
            Best <span>Email Builder</span>
          </h1>
          <p className="tagline">{text.tagline}</p>
          <div className="chips">
            {text.chips.map((label, i) => {
              const Icon = CHIP_ICONS[i];
              return (
                <span key={label} className="chip">
                  <Icon aria-hidden="true" />
                  {label}
                </span>
              );
            })}
          </div>
          <InstallCommand text={text} />
        </section>

        <section className="panel" aria-labelledby="templates-title">
          <div className="panel-head">
            <h2 id="templates-title">
              {text.templates}
              {templates.length > 0 && <span className="count">{templates.length}</span>}
            </h2>
            <button type="button" className="btn btn-primary" onClick={() => setOpen({ id: null })}>
              <Plus aria-hidden="true" />
              {text.create}
            </button>
          </div>
          <p className="note">
            <Info aria-hidden="true" />
            <span>{text.note}</span>
          </p>
          <ul data-testid="template-list" className="list">
            {templates.length === 0 && (
              <li className="empty">
                <div className="empty-art">
                  <LayoutTemplate aria-hidden="true" />
                </div>
                <strong>{text.empty}</strong>
                <p>{text.emptyHint}</p>
                <button type="button" className="btn" onClick={() => setOpen({ id: null })} tabIndex={-1} aria-hidden="true">
                  <Plus />
                  {text.create}
                </button>
              </li>
            )}
            {templates.map((template) => (
              <li key={template.id} className="row">
                <span className="row-icon">
                  <Mail aria-hidden="true" />
                </span>
                <div className="row-text">
                  <div className="row-name">{template.name}</div>
                  <div className="row-sub">{template.subject || text.noSubject}</div>
                </div>
                <div className="row-actions">
                  <button type="button" className="btn" onClick={() => setOpen({ id: template.id })}>
                    <PencilLine aria-hidden="true" />
                    {text.open}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => storage.remove(template.id).then(refresh)}
                    aria-label={text.remove}
                    title={text.remove}
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="wrap footer">
        <a className="made" href={AUTHOR_URL} target="_blank" rel="noopener">
          © 2026 {text.madeBy}
          <span className="made-sig">
            Sergiy
            <AuthorMark />
            Miro
          </span>
        </a>
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
