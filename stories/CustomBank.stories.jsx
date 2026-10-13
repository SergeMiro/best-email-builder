import { useEffect, useMemo, useState } from 'react';
// Block B ALONE: the builder entry, nothing of the template bank.
import { EmailBuilder, createMemoryStorage, createStarterMjml } from '../src/builder.js';

/**
 * Block B with the host's OWN bank (block A replaced): a plain list read from
 * `storage.list()`, opening the editor on a template (`templateId`), on new
 * content (`initialMjml`, `initialMeta`) or empty, and back on `onClose`.
 * Driven by `e2e/custom-bank.stories.spec.js`.
 */
export default {
  title: 'Custom bank',
};

const SENDER = { name: 'Example Inc.', address: '1 Main Street, Springfield' };
const frame = { height: 760, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' };

function MyBank({ storage, onOpen, onNew, onFromStarter }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    storage.list().then(setRows);
  }, [storage]);
  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', fontSize: 14 }} data-testid="my-bank">
      <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>My templates</h2>
      <button type="button" onClick={onNew}>
        Blank email
      </button>{' '}
      <button type="button" onClick={onFromStarter}>
        From my starter
      </button>
      <ul style={{ paddingLeft: 18 }}>
        {(rows || []).map((row) => (
          <li key={row.id}>
            {row.name}{' '}
            <button type="button" onClick={() => onOpen(row.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      {rows && rows.length === 0 && <p>No template yet.</p>}
    </div>
  );
}

export const Builder = () => {
  const storage = useMemo(() => createMemoryStorage(), []);
  /** null = my bank; else what the editor opens. */
  const [open, setOpen] = useState(null);
  window.__emailStorage = storage;

  return (
    <div style={frame}>
      {open ? (
        <EmailBuilder
          key={open.key}
          storage={storage}
          sender={SENDER}
          templates={[]}
          templateId={open.templateId ?? null}
          initialMjml={open.mjml}
          initialMeta={open.meta}
          onSaved={(template) => (window.__lastSaved = template)}
          onClose={() => setOpen(null)}
        />
      ) : (
        <MyBank
          storage={storage}
          onOpen={(templateId) => setOpen({ key: `t${templateId}`, templateId })}
          onNew={() => setOpen({ key: `new${Date.now()}` })}
          onFromStarter={() =>
            setOpen({
              key: `starter${Date.now()}`,
              mjml: createStarterMjml({ sender: SENDER }),
              meta: { subject: 'Hello from my bank', preheader: 'Opened by the host' },
            })
          }
        />
      )}
    </div>
  );
};
