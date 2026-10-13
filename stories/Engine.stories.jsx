import { useMemo, useState } from 'react';
import { createEmailEditor, emailBlocks, emailBuilderFeatures, EmailCanvas, createMemoryStorage } from '../src/index.js';
import { createNativeAdapter } from '../src/engine/NativeAdapter.js';

/**
 * The ENGINE alone, without network or session.
 *
 * Used by `e2e/engine.stories.spec.js`: the editor mounted here is exposed on
 * `window.__emailEditor` (and a memory storage on `window.__emailStorage`), and
 * the tests drive the `EmailEditor` contract exactly like the interface does
 * (initialize, destroy, blocks, history, document). Not a showcase: the test
 * bench of the adapter.
 */
export default {
  title: 'Engine',
};

function Bench() {
  const adapter = useMemo(() => createNativeAdapter(), []);
  const editor = useMemo(
    () => createEmailEditor({ adapter, blocks: emailBlocks, features: emailBuilderFeatures }),
    [adapter]
  );
  const storage = useMemo(() => createMemoryStorage(), []);
  const [status, setStatus] = useState('initializing');
  const [error, setError] = useState(null);

  window.__emailEditor = editor;
  window.__emailStorage = storage;
  window.__emailAdapter = adapter;

  return (
    <div data-testid="bench" data-status={status}>
      <p style={{ fontSize: 12, color: '#666' }}>
        Status: <span data-testid="bench-status">{status}</span>
        {error ? ` — ${error}` : ''}
      </p>
      <div className="eb-root" style={{ height: 560, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <EmailCanvas
          editor={editor}
          onReady={() => setStatus('ready')}
          onError={(e) => {
            setStatus('error');
            setError(e.message);
          }}
        />
      </div>
    </div>
  );
}

export const Canvas = () => <Bench />;
