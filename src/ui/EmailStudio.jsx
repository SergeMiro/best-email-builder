import { useMemo, useState } from 'react';
import { createHttpStorage } from '../storage/client.js';
import EmailBuilder from './EmailBuilder.jsx';
import TemplateLibrary from './library/TemplateLibrary.jsx';

/**
 * EMAIL STUDIO — the two screens wired together.
 *
 *   TemplateLibrary ── Edit / New template ──▶ EmailBuilder
 *         ▲                                       │
 *         └──────────────── Back ─────────────────┘
 *
 * Nothing here that a host could not write itself: both screens are exported
 * on their own, and an application that only wants the editor mounts
 * `EmailBuilder` alone (or the library alone, opening its own editor).
 *
 * Shared props go to both screens; `templates` (the bases) and `sender` only
 * matter to the editor, where a new template starts from a base with the
 * *Templates* button. `libraryProps` / `builderProps` reach only one. Coming
 * back from the editor, the library selects the template that was just
 * edited or created.
 *
 * `ai` (`createAi()` from `best-email-builder/ai`) goes to the editor only:
 * without it, the editor has no AI button at all.
 *
 * @param {{
 *   storage?: import('../storage/client.js').TemplateStorage,
 *   ai?: import('../ai/createAi.js').EmailBuilderAi|null,
 *   locale?: string,
 *   messages?: Record<string, string>,
 *   onNotify?: (level: 'success'|'info'|'warning'|'error', message: string) => void,
 *   sender?: import('../features/templates/starter.js').StarterSender,
 *   templates?: import('../features/templates/gallery.js').GalleryTemplate[],
 *   onClose?: () => void,
 *   libraryProps?: object,
 *   builderProps?: object,
 *   className?: string,
 * }} props  `onClose`: shows the library's close button.
 */
export default function EmailStudio({
  storage: injectedStorage,
  ai,
  locale = 'en',
  messages,
  onNotify,
  sender,
  templates,
  onClose,
  libraryProps,
  builderProps,
  className,
}) {
  const storage = useMemo(() => injectedStorage || createHttpStorage(), [injectedStorage]);
  /** null = library; else the editor session: {key, templateId}. */
  const [session, setSession] = useState(null);
  const [lastId, setLastId] = useState(null);
  const shared = { storage, locale, messages, onNotify, className };

  if (session) {
    return (
      <EmailBuilder
        key={session.key}
        {...shared}
        ai={ai}
        sender={sender}
        templates={templates}
        {...builderProps}
        templateId={session.templateId}
        onSaved={(template) => {
          if (template?.id != null) setLastId(template.id);
          builderProps?.onSaved?.(template);
        }}
        onClose={() => {
          setSession(null);
          builderProps?.onClose?.();
        }}
      />
    );
  }

  return (
    <TemplateLibrary
      {...shared}
      {...libraryProps}
      selectedId={lastId}
      onClose={onClose}
      onEdit={(template) => {
        setLastId(template.id);
        setSession({ key: Date.now(), templateId: template.id });
      }}
      onCreate={() => setSession({ key: Date.now(), templateId: null })}
    />
  );
}
