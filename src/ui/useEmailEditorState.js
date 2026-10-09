'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * React state of an `EmailEditor`: status, selection, undo/redo, device, and
 * "modified since the last clean point".
 *
 * The UI reads the editor ONLY through this hook (and its methods): no
 * component subscribes to the engine.
 *
 * -- "MODIFIED" IS MEASURED, NOT COUNTED ------------------------------------
 * Counting `change` events does not work: the engine also emits them outside
 * any edit (deferred canvas render after a load), and undoing back to the
 * saved state would leave a counter at 2. So the exported MJML is compared to
 * the one of the last clean point (load, or `markClean()` after a save). MJML
 * omits default values: engine noise does not show up in it.
 *
 * `dirty` (display) lags by 150 ms; `checkDirty()` measures RIGHT NOW - it is
 * the one to query before leaving, since a click on "Back" can follow an edit
 * by a few milliseconds.
 *
 * `markDirty()` forces the state until the next clean point (restored
 * version: identical to nothing saved, but still to be saved).
 * `changes` counts modifications: it is used to re-read what depends on them.
 */

const DIRTY_CHECK_MS = 150;

export function useEmailEditorState(editor) {
  const [state, setState] = useState(() => ({
    status: editor?.status || 'idle',
    selection: null,
    canUndo: false,
    canRedo: false,
    device: 'desktop',
    changes: 0,
    dirty: false,
  }));
  const clean = useRef(null);
  const forced = useRef(false);
  const timer = useRef(null);

  const snapshot = useCallback(() => {
    try {
      return editor.status === 'ready' ? editor.exportMjml() : null;
    } catch {
      return null;
    }
  }, [editor]);

  /** Clean point: the given MJML (the one just saved) or the current one. */
  const markClean = useCallback((saved = null) => {
    clean.current = saved ?? snapshot();
    forced.current = false;
    const current = snapshot();
    // Edited WHILE saving: still needs saving.
    setState((s) => ({ ...s, dirty: current !== null && current !== clean.current }));
  }, [snapshot]);

  const checkDirty = useCallback(() => {
    if (forced.current) return true;
    const current = snapshot();
    return current !== null && current !== clean.current;
  }, [snapshot]);

  const markDirty = useCallback(() => {
    forced.current = true;
    setState((s) => ({ ...s, dirty: true }));
  }, []);

  useEffect(() => {
    if (!editor) return undefined;
    const patch = (values) => setState((s) => ({ ...s, ...values }));
    const measure = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const current = snapshot();
        patch({ dirty: forced.current || (current !== null && current !== clean.current) });
      }, DIRTY_CHECK_MS);
    };
    const offs = [
      editor.on('ready', () => {
        clean.current = snapshot();
        forced.current = false;
        patch({
          status: 'ready',
          device: editor.getDevice(),
          canUndo: editor.canUndo(),
          canRedo: editor.canRedo(),
          selection: editor.getSelection(),
          dirty: false,
        });
      }),
      editor.on('destroy', () => patch({ status: 'idle', selection: null, canUndo: false, canRedo: false })),
      editor.on('selection', (selection) => patch({ selection })),
      editor.on('history', ({ canUndo, canRedo }) => patch({ canUndo, canRedo })),
      editor.on('device', (device) => patch({ device })),
      editor.on('change', () => {
        setState((s) => ({ ...s, changes: s.changes + 1 }));
        measure();
      }),
      editor.on('load', () => {
        clearTimeout(timer.current);
        clean.current = snapshot();
        forced.current = false;
        setState((s) => ({ ...s, changes: s.changes + 1, dirty: false }));
      }),
    ];
    return () => {
      clearTimeout(timer.current);
      offs.forEach((off) => off());
    };
  }, [editor, snapshot]);

  return { ...state, markClean, markDirty, checkDirty };
}
