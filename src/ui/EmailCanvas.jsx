import { useEffect, useRef } from 'react';
import { cn } from './primitives/cn.js';

/**
 * Canvas area: the node where the editor mounts its engine.
 *
 * Only knows `EmailEditor`: `initialize` on mount, `destroy` on unmount.
 * React strict mode's double mount is absorbed by the editor (an
 * initialization made stale by a `destroy` never reports ready).
 *
 * `document` is only read on mount: reloading a document goes through
 * `editor.loadDocument`, not through a new render.
 */
export default function EmailCanvas({ editor, document = null, onReady, onError, className }) {
  const ref = useRef(null);
  const documentRef = useRef(document);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  useEffect(() => {
    if (!editor || !ref.current) return undefined;
    let alive = true;
    editor
      .initialize({ container: ref.current, document: documentRef.current })
      .then(() => {
        if (alive && editor.status === 'ready') callbacks.current.onReady?.(editor);
      })
      .catch((error) => {
        if (alive) callbacks.current.onError?.(error);
      });
    return () => {
      alive = false;
      editor.destroy();
    };
  }, [editor]);

  return <div ref={ref} className={cn('eb-canvas mb:h-full mb:w-full', className)} data-testid="eb-canvas" />;
}
