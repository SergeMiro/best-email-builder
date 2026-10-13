import { useMemo, useState } from 'react';
import { createHttpStorage } from '../storage/client.js';
import EmailBuilder from './EmailBuilder.jsx';
import TemplateLibrary from './library/TemplateLibrary.jsx';

/**
 * EMAIL STUDIO — the two screens wired together.
 *
 *   TemplateLibrary ── Edit / New template / Start from this base ──▶ EmailBuilder
 *         ▲                                                              │
 *         └──────────────────────────── Back ───────────────────────────┘
 *
 * Nothing here that a host could not write itself: both screens are exported
 * on their own, and an application that only wants the editor mounts
 * `EmailBuilder` alone (or the library alone, opening its own editor).
 *
 * Shared props go to both screens; `libraryProps` / `builderProps` reach only
 * one. Coming back from the editor, the library selects the template that was
 * just edited or created.
 *
 * @param {{
 *   storage?: import('../storage/client.js').TemplateStorage,
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
  /** null = library; else the editor session: {key, templateId, start}. */
  const [session, setSession] = useState(null);
  const [lastId, setLastId] = useState(null);
  const shared = { storage, locale, messages, onNotify, sender, templates, className };

  if (session) {
    return (
      <EmailBuilder
        key={session.key}
        {...shared}
        // The bases are picked in the bank: no second gallery in the editor,
        // where picking one would replace the email being edited.
        templates={[]}
        {...builderProps}
        templateId={session.templateId}
        initialMjml={session.start?.mjml}
        initialMeta={session.start?.meta}
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
        setSession({ key: Date.now(), templateId: template.id, start: null });
      }}
      onCreate={(start) => setSession({ key: Date.now(), templateId: null, start })}
    />
  );
}
