/** AUTOSAVE: scheduler (simulated clock) and local draft of a new template. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosaveScheduler } from '../../src/features/autosave/scheduler.js';
import { saveLocalDraft, readLocalDraft, clearLocalDraft } from '../../src/features/autosave/localDraft.js';
import { autosaveFeature } from '../../src/features/autosave/index.js';
import { createDocument } from '../../src/core/document.js';

/** Simulated clock and timers. */
function fakeClock() {
  let now = 0;
  let next = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = next++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = until;
    },
  };
}

test('scheduler: idle pause, maximum wait, reset, dispose', () => {
  const clock = fakeClock();
  let runs = 0;
  const s = createAutosaveScheduler({ run: () => (runs += 1), idleMs: 1000, maxWaitMs: 5000, ...clock });

  s.notify();
  clock.advance(900);
  s.notify(); // still typing: the delay restarts
  clock.advance(900);
  assert.equal(runs, 0, 'no save in the middle of typing');
  clock.advance(200);
  assert.equal(runs, 1, 'saved after an idle pause');

  for (let i = 0; i < 10; i += 1) {
    s.notify();
    clock.advance(600);
  }
  assert.equal(runs, 2, 'continuous typing saved at the maximum wait');

  s.notify();
  s.reset();
  clock.advance(10_000);
  assert.equal(runs, 2);
  assert.equal(s.pending, false, 'reset (manual save) cancels the wait');

  s.notify();
  s.dispose();
  clock.advance(10_000);
  assert.equal(runs, 2, 'dispose (unmount) saves nothing more');
});

test('local draft: write, read, expiry, unreadable, clear, full quota', () => {
  const map = new Map();
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
  const document = createDocument({ engine: 'grapesjs-mjml', engineVersion: '0.22.16', project: { pages: [] } });

  assert.equal(readLocalDraft(store), null);
  assert.equal(saveLocalDraft({ document, meta: { name: 'Letter' } }, store), true);
  const draft = readLocalDraft(store);
  assert.equal(draft.meta.name, 'Letter');
  assert.deepEqual(draft.document, document);
  assert.equal(readLocalDraft(store, { now: Date.now() + 8 * 24 * 3600 * 1000 }), null, 'expired after 7 days');
  assert.equal(map.size, 0, 'an expired draft is erased');

  store.setItem('mailblocks:new-template-draft', `{"savedAt":${Date.now()},"document":{"not":"an envelope"}}`);
  assert.equal(readLocalDraft(store), null);
  assert.equal(map.size, 0, 'unreadable → erased, not offered');

  saveLocalDraft({ document, meta: {} }, store);
  clearLocalDraft(store);
  assert.equal(readLocalDraft(store), null);

  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceeded');
    },
    removeItem: () => {},
  };
  assert.equal(saveLocalDraft({ document, meta: {} }, full), false, 'full quota → false, no exception');
});

test('default autosave settings', () => {
  const { idleMs, maxWaitMs } = autosaveFeature.options;
  assert.ok(idleMs >= 5_000 && maxWaitMs > idleMs);
});
