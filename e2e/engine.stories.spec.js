import { test, expect } from '@playwright/test';

/**
 * The `EmailEditor` contract on the REAL engine (GrapesJS + MJML), in a real
 * browser, without network or session.
 *
 * The `Engine / Canvas` story mounts the editor and exposes it on
 * `window.__emailEditor`; each test drives the contract like the interface
 * does. Unit tests (tests/unit/core.test.mjs) cover the core with a fake
 * engine; these prove the GrapesJS adapter keeps the same promises.
 *
 * Run: npm run test:stories
 */

const STORY = '/?story=engine--canvas&mode=preview';

async function openBench(page) {
  await page.goto(STORY);
  const bench = page.getByTestId('bench');
  await expect(bench).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  return bench;
}

/** Runs a function against the editor, inside the page. */
function withEditor(page, fn, arg) {
  return page.evaluate(
    ({ source, arg: value }) => {
      const run = new Function('editor', 'arg', `return (${source})(editor, arg);`);
      return run(window.__emailEditor, value);
    },
    { source: fn.toString(), arg }
  );
}

test.describe('Engine', () => {
  test('initialize: the canvas is mounted and the editor ready', async ({ page }) => {
    await openBench(page);

    const state = await withEditor(page, (editor) => ({
      status: editor.status,
      adapter: editor.adapterName,
      device: editor.getDevice(),
    }));
    expect(state).toEqual({ status: 'ready', adapter: 'grapesjs-mjml', device: 'desktop' });

    // The canvas fills the area: no column kept for the engine's own panels
    // (85 % by default without our settings).
    const canvas = page.getByTestId('eb-canvas');
    const frame = page.locator('.gjs-cv-canvas');
    const [host, inner] = await Promise.all([canvas.boundingBox(), frame.boundingBox()]);
    expect(Math.abs(host.width - inner.width)).toBeLessThanOrEqual(1);

    // No engine panel is visible.
    await expect(page.locator('.gjs-pn-panel:visible')).toHaveCount(0);
  });

  test('an empty email exports to MJML then HTML without error', async ({ page }) => {
    await openBench(page);
    const out = await withEditor(page, (editor) => ({
      mjml: editor.exportMjml(),
      html: editor.exportHtml(),
    }));
    expect(out.mjml).toMatch(/^<mjml>\s*<mj-body[^>]*>/);
    expect(out.html.errors).toEqual([]);
    expect(out.html.html).toMatch(/<!doctype html>/i);
  });

  test('destroy frees the engine; a new initialize starts from scratch', async ({ page }) => {
    await openBench(page);

    const afterDestroy = await withEditor(page, (editor) => {
      editor.destroy();
      let refused = null;
      try {
        editor.exportMjml();
      } catch (error) {
        refused = error.message;
      }
      return {
        status: editor.status,
        refused,
        engineNodes: document.querySelectorAll('.gjs-editor').length,
        frames: document.querySelectorAll('.gjs-frame').length,
      };
    });
    expect(afterDestroy.status).toBe('idle');
    expect(afterDestroy.refused).toMatch(/before the editor was initialized/);
    expect(afterDestroy.engineNodes).toBe(0);
    expect(afterDestroy.frames).toBe(0);

    const again = await withEditor(page, async (editor) => {
      await editor.initialize({ container: document.querySelector('[data-testid=eb-canvas]') });
      return { status: editor.status, mjml: editor.exportMjml() };
    });
    expect(again.status).toBe('ready');
    expect(again.mjml).toContain('<mj-body');
  });

  test('destroy while the engine loads: no ghost editor', async ({ page }) => {
    await openBench(page);
    const result = await withEditor(page, async (editor) => {
      const container = document.querySelector('[data-testid=eb-canvas]');
      editor.destroy();
      const pending = editor.initialize({ container });
      editor.destroy();
      await pending;
      const ghost = document.querySelectorAll('.gjs-editor').length;
      await editor.initialize({ container });
      return { ghost, status: editor.status, engines: document.querySelectorAll('.gjs-editor').length };
    });
    expect(result.ghost).toBe(0);
    expect(result.status).toBe('ready');
    expect(result.engines).toBe(1);
  });
});

/** Reference email: one of each block, in two columns. */
const SAMPLE_MJML = `<mjml><mj-body background-color="#eceff4">
  <mj-section background-color="#ffffff" padding="24px 16px">
    <mj-column>
      <mj-image src="https://example.com/logo.png" width="170px" alt="Logo"></mj-image>
      <mj-text font-family="Arial, Helvetica, sans-serif" font-size="22px" color="#212e5a">Bonjour {{contact.firstname}}</mj-text>
      <mj-divider border-color="#dfe6f0" border-width="1px"></mj-divider>
      <mj-spacer height="32px"></mj-spacer>
    </mj-column>
  </mj-section>
  <mj-section background-color="#ffffff">
    <mj-column><mj-text font-family="Arial, Helvetica, sans-serif">Colonne <b>gauche</b></mj-text></mj-column>
    <mj-column><mj-button href="https://example.com/contact/" background-color="#212e5a">Write to us</mj-button></mj-column>
  </mj-section>
</mj-body></mjml>`;

test.describe('Save and reload', () => {
  test('create → save → destroy → reload: the email is identical', async ({ page }) => {
    await openBench(page);

    const result = await withEditor(
      page,
      async (editor, sample) => {
        const storage = window.__emailStorage;
        editor.loadMjml(sample);
        const before = { mjml: editor.exportMjml(), html: editor.exportHtml().html };
        const { template } = await storage.create({
          name: 'Banc phase 2',
          document: editor.getDocument(),
          mjml: before.mjml,
        });

        // The editor goes away (screen closed) then comes back on the template.
        const container = document.querySelector('[data-testid=eb-canvas]');
        editor.destroy();
        const loaded = await storage.load(template.id);
        await editor.initialize({ container, document: loaded.document });

        return {
          before,
          after: { mjml: editor.exportMjml(), html: editor.exportHtml().html },
          storedMjml: loaded.mjml,
          canUndo: editor.canUndo(),
        };
      },
      SAMPLE_MJML
    );

    expect(result.after.mjml).toBe(result.before.mjml);
    expect(result.after.html).toBe(result.before.html);
    expect(result.storedMjml).toBe(result.before.mjml);
    // A reloaded template has no history to undo.
    expect(result.canUndo).toBe(false);
    // Nothing lost on the way: every block and its non-default attributes.
    for (const fragment of [
      'width="170px"',
      'font-size="22px"',
      '{{contact.firstname}}',
      'border-color="#dfe6f0"',
      'height="32px"',
      'href="https://example.com/contact/"',
      '<b>gauche</b>',
    ]) {
      expect(result.after.mjml).toContain(fragment);
    }
    expect((result.after.mjml.match(/<mj-column/g) || []).length).toBe(3);
  });

  test('loadDocument on an open editor, then back to a version', async ({ page }) => {
    await openBench(page);

    const result = await withEditor(
      page,
      async (editor, sample) => {
        const storage = window.__emailStorage;
        editor.loadMjml(sample);
        const original = editor.exportMjml();
        const { template } = await storage.create({
          name: 'Versions',
          document: editor.getDocument(),
          mjml: original,
        });

        editor.loadMjml('<mjml><mj-body><mj-section><mj-column><mj-text>Autre</mj-text></mj-column></mj-section></mj-body></mjml>');
        const changed = editor.exportMjml();
        const saved = await storage.save(template.id, {
          document: editor.getDocument(),
          mjml: changed,
          revision: template.revision,
          createVersion: true,
        });

        const versions = await storage.listVersions(template.id);
        const first = await storage.getVersion(template.id, versions[versions.length - 1].id);
        editor.loadDocument(first.document);
        return {
          original,
          changed,
          restored: editor.exportMjml(),
          versionNumbers: versions.map((v) => v.versionNumber),
          savedVersion: saved.version.versionNumber,
        };
      },
      SAMPLE_MJML
    );

    expect(result.changed).not.toBe(result.original);
    expect(result.savedVersion).toBe(2);
    expect(result.versionNumbers).toEqual([2, 1]);
    expect(result.restored).toBe(result.original);
  });

  test('a document from another engine or a future schema is refused without touching the email', async ({ page }) => {
    await openBench(page);
    const result = await withEditor(
      page,
      (editor, sample) => {
        editor.loadMjml(sample);
        const before = editor.exportMjml();
        const doc = editor.getDocument();
        const errors = [];
        for (const bad of [{ ...doc, engine: 'other-engine' }, { ...doc, schemaVersion: 99 }, '{broken json']) {
          try {
            editor.loadDocument(bad);
          } catch (error) {
            errors.push(error.message);
          }
        }
        return { errors, untouched: editor.exportMjml() === before };
      },
      SAMPLE_MJML
    );
    expect(result.errors).toHaveLength(3);
    expect(result.untouched).toBe(true);
  });
});

/**
 * Test value of a property: never MJML's default value (the engine would not
 * export it, and the test would prove nothing).
 */
function sampleFor(property, current) {
  switch (property.type) {
    case 'color':
      return '#123456';
    case 'size':
      return `${Math.min(property.max ?? 40, Math.max(property.min ?? 0, 2) + 7)}px`;
    case 'spacing':
      return '12px 18px 14px 16px';
    case 'url':
      return 'https://example.com/essai';
    case 'image':
      return 'https://example.com/essai.png';
    case 'text':
    case 'textarea':
      return 'Sample text';
    default: {
      const options = (property.options || []).map((o) => o.value).filter((v) => v && v !== current);
      return options[options.length - 1];
    }
  }
}

/** Expected MJML for a value (longhand paddings). */
function expectedFragments(property, value) {
  if (property.key === 'padding') {
    const [t, r, b, l] = value.split(' ');
    return [`padding-top="${t}"`, `padding-right="${r}"`, `padding-bottom="${b}"`, `padding-left="${l}"`];
  }
  return [`${property.key}="${value}"`];
}

const CONTENT_BLOCKS = ['text', 'image', 'button', 'divider', 'spacer'];

test.describe('Blocks', () => {
  for (const blockId of CONTENT_BLOCKS) {
    test(`block "${blockId}": add, placement, properties, undo`, async ({ page }) => {
      await openBench(page);

      // 1. Added without selection: wrapped in a white section, selected.
      const added = await withEditor(
        page,
        (editor, id) => {
          editor.loadMjml('<mjml><mj-body background-color="#eceff4"></mj-body></mjml>');
          const newId = editor.addBlock(id);
          const selection = editor.getSelection();
          return {
            newId,
            selection,
            block: editor.getBlock(id),
            mjml: editor.exportMjml(),
            errors: editor.exportHtml().errors,
          };
        },
        blockId
      );
      expect(added.newId).toBeTruthy();
      expect(added.selection.id).toBe(added.newId);
      expect(added.selection.blockId).toBe(blockId);
      expect(added.mjml).toContain('<mj-section background-color="#ffffff"');
      expect(added.mjml).toContain(`<${added.block.tagName}`);
      expect(added.errors).toEqual([]);

      // 2. Column selected: the block goes INSIDE (no new section).
      const placed = await withEditor(
        page,
        (editor, id) => {
          editor.loadMjml(
            '<mjml><mj-body><mj-section><mj-column><mj-spacer height="8px"></mj-spacer></mj-column><mj-column></mj-column></mj-section></mj-body></mjml>'
          );
          const engine = window.__emailEngine();
          const columns = engine.getWrapper().findType('mj-column');
          editor.select(columns[1].getId());
          editor.addBlock(id);
          const first = engine.getWrapper().findType('mj-spacer')[0];
          editor.select(first.getId());
          editor.addBlock(id);
          return {
            sections: engine.getWrapper().findType('mj-section').length,
            inColumn2: columns[1].components().length,
            afterSpacer: columns[0].components().at(1)?.get('type'),
          };
        },
        blockId
      );
      expect(placed.sections).toBe(1);
      expect(placed.inColumn2).toBe(1);
      expect(placed.afterSpacer).toBe(added.block.tagName);

      // 3. Each property: value set → exported, read back, compilable.
      const block = added.block;
      for (const property of block.properties) {
        const value = sampleFor(property, added.selection.values[property.key]);
        const out = await withEditor(
          page,
          (editor, { id, key, value: v }) => {
            editor.loadMjml('<mjml><mj-body></mj-body></mjml>');
            editor.addBlock(id);
            editor.updateProperties({ [key]: v });
            return {
              value: editor.getSelection().values[key],
              mjml: editor.exportMjml(),
              errors: editor.exportHtml().errors,
            };
          },
          { id: blockId, key: property.key, value }
        );
        expect(out.value, `${blockId}.${property.key} relu`).toBe(property.key === 'padding' ? value : value);
        for (const fragment of expectedFragments(property, value)) {
          expect(out.mjml, `${blockId}.${property.key} exported`).toContain(fragment);
        }
        expect(out.errors, `${blockId}.${property.key} compilable`).toEqual([]);
      }

      // 4. The canvas follows, and undo goes back.
      const undo = await withEditor(
        page,
        async (editor, id) => {
          // Two gestures = two event-loop turns: the engine groups everything
          // that happens in the same turn into ONE undo step.
          const tick = () => new Promise((r) => setTimeout(r, 30));
          editor.loadMjml('<mjml><mj-body></mj-body></mjml>');
          await tick();
          editor.addBlock(id);
          await tick();
          const before = editor.exportMjml();
          editor.updateProperties({ 'background-color': '#123456', 'container-background-color': '#123456' });
          await new Promise((r) => setTimeout(r, 150));
          const frame = document.querySelector('.gjs-frame').contentDocument;
          const painted = [...frame.querySelectorAll('[data-gjs-type] *')].some((el) =>
            /rgb\(18, 52, 86\)/.test(getComputedStyle(el).backgroundColor)
          );
          editor.undo();
          return { painted, restored: editor.exportMjml() === before, canRedo: editor.canRedo() };
        },
        blockId
      );
      expect(undo.painted).toBe(true);
      expect(undo.restored).toBe(true);
      expect(undo.canRedo).toBe(true);
    });
  }
});

test.describe('Image', () => {
  test('image without file: placeholder in the canvas, nothing from the engine in the export or the project', async ({ page }) => {
    await openBench(page);
    const out = await withEditor(page, async (editor) => {
      editor.loadMjml('<mjml><mj-body></mj-body></mjml>');
      editor.addBlock('image');
      await new Promise((r) => setTimeout(r, 150));
      const frame = document.querySelector('.gjs-frame').contentDocument;
      const img = frame.querySelector('[data-gjs-type="mj-image"] img');
      return {
        mjml: editor.exportMjml(),
        project: JSON.stringify(editor.getDocument()),
        src: editor.getSelection().values.src,
        canvasSrc: img?.getAttribute('src') || '',
        canvasHeight: img ? img.getBoundingClientRect().height : 0,
        html: editor.exportHtml(),
      };
    });
    expect(out.mjml).not.toContain('<svg');
    expect(out.mjml).not.toContain('data:image');
    expect(out.mjml).not.toMatch(/\ssrc=/);
    expect(out.project).not.toContain('<svg');
    expect(out.project).not.toContain('data:image/svg');
    expect(out.src).toBe('');
    expect(out.html.errors).toEqual([]);
    // The canvas shows the "choose an image" placeholder, at the column width.
    expect(out.canvasSrc).toMatch(/^data:image\/svg\+xml,/);
    expect(out.canvasHeight).toBeGreaterThan(100);
  });

  test('image set then read back after saving: URL, link, alt text', async ({ page }) => {
    await openBench(page);
    const out = await withEditor(page, async (editor) => {
      editor.loadMjml('<mjml><mj-body></mj-body></mjml>');
      editor.addBlock('image');
      editor.updateProperties({
        src: 'https://example.com/logo.png',
        alt: 'Logo',
        href: 'https://example.com/',
        width: '170px',
      });
      await new Promise((r) => setTimeout(r, 150));
      const document_ = editor.getDocument();
      const container = document.querySelector('[data-testid=eb-canvas]');
      editor.destroy();
      await editor.initialize({ container, document: document_ });
      await new Promise((r) => setTimeout(r, 150));
      const frame = document.querySelector('.gjs-frame').contentDocument;
      return {
        mjml: editor.exportMjml(),
        canvasSrc: frame.querySelector('[data-gjs-type="mj-image"] img')?.getAttribute('src'),
      };
    });
    expect(out.mjml).toContain('src="https://example.com/logo.png"');
    expect(out.mjml).toContain('alt="Logo"');
    expect(out.mjml).toContain('href="https://example.com/"');
    expect(out.mjml).toContain('width="170px"');
    expect(out.canvasSrc).toContain('example.com/logo.png');
  });
});

test.describe('Button', () => {
  test('label typed in the panel: plain text escaped, read back, exported', async ({ page }) => {
    await openBench(page);
    const out = await withEditor(page, async (editor) => {
      editor.loadMjml('<mjml><mj-body></mj-body></mjml>');
      editor.addBlock('button');
      const initial = editor.getSelection().content;
      editor.setContent('Book <my> seat & come');
      await new Promise((r) => setTimeout(r, 100));
      const frame = document.querySelector('.gjs-frame').contentDocument;
      return {
        initial,
        content: editor.getSelection().content,
        mjml: editor.exportMjml(),
        html: editor.exportHtml(),
        canvas: frame.querySelector('[data-gjs-type="mj-button"]')?.textContent.trim(),
      };
    });
    expect(out.initial).toBe('Learn more');
    expect(out.content).toBe('Book <my> seat & come');
    expect(out.mjml).toContain('>Book &lt;my&gt; seat &amp; come</mj-button>');
    expect(out.html.errors).toEqual([]);
    expect(out.html.html).toContain('Book &lt;my&gt; seat &amp; come');
    expect(out.canvas).toBe('Book <my> seat & come');
  });
});

test.describe('Columns and structure', () => {
  for (const count of [1, 2, 3]) {
    test(`${count}-column layout: placed after the current section, stacked on mobile`, async ({ page }) => {
      await openBench(page);
      const out = await withEditor(
        page,
        async (editor, n) => {
          editor.loadMjml(
            '<mjml><mj-body><mj-section><mj-column><mj-text>A</mj-text></mj-column></mj-section>' +
              '<mj-section><mj-column><mj-text>Z</mj-text></mj-column></mj-section></mj-body></mjml>'
          );
          const engine = window.__emailEngine();
          const firstText = engine.getWrapper().findType('mj-text')[0];
          editor.select(firstText.getId());
          editor.addBlock(`columns-${n}`);
          const selection = editor.getSelection();
          const sections = engine.getWrapper().findType('mj-section');
          const added = sections[1];
          const tops = async () => {
            await new Promise((r) => setTimeout(r, 400));
            const frame = document.querySelector('.gjs-frame').contentDocument;
            const ids = added.components().map((c) => c.getId());
            return ids.map((id) => Math.round(frame.getElementById(id)?.getBoundingClientRect().top ?? -1));
          };
          const desktop = await tops();
          editor.setDevice('mobile');
          const mobile = await tops();
          const frameWidth = document.querySelector('.gjs-frame').getBoundingClientRect().width;
          editor.setDevice('desktop');
          return {
            selection,
            order: sections.map((s) => s.findType('mj-text').map((t) => t.getInnerHTML()).join('|')),
            columns: added.components().length,
            desktop,
            mobile,
            frameWidth,
            errors: editor.exportHtml().errors,
          };
        },
        count
      );
      expect(out.selection.blockId).toBe('section');
      expect(out.columns).toBe(count);
      // Inserted BETWEEN the section of "A" and the one of "Z".
      expect(out.order[0]).toBe('A');
      expect(out.order[2]).toBe('Z');
      expect(out.errors).toEqual([]);
      expect(Math.round(out.frameWidth)).toBe(375);
      if (count > 1) {
        // Desktop: side by side; mobile: stacked.
        expect(new Set(out.desktop).size).toBe(1);
        expect(new Set(out.mobile).size).toBe(count);
      }
    });
  }

  const STRUCTURES = [
    { id: 'section', type: 'mj-section' },
    { id: 'column', type: 'mj-column' },
    { id: 'body', type: 'mj-body' },
  ];
  for (const structure of STRUCTURES) {
    test(`structure "${structure.id}": every property exports and compiles`, async ({ page }) => {
      await openBench(page);
      const block = await withEditor(page, (editor, id) => editor.getBlock(id), structure.id);
      for (const property of block.properties) {
        const value = sampleFor(property, '');
        const out = await withEditor(
          page,
          (editor, { type, key, value: v }) => {
            editor.loadMjml(
              '<mjml><mj-body><mj-section><mj-column><mj-text>A</mj-text></mj-column></mj-section></mj-body></mjml>'
            );
            const target = window.__emailEngine().getWrapper().findType(type)[0];
            editor.select(target.getId());
            editor.updateProperties({ [key]: v });
            return {
              blockId: editor.getSelection().blockId,
              value: editor.getSelection().values[key],
              mjml: editor.exportMjml(),
              errors: editor.exportHtml().errors,
            };
          },
          { type: structure.type, key: property.key, value }
        );
        expect(out.blockId).toBe(structure.id);
        expect(out.value, `${structure.id}.${property.key} relu`).toBe(value);
        for (const fragment of expectedFragments(property, value)) {
          expect(out.mjml, `${structure.id}.${property.key} exported`).toContain(fragment);
        }
        expect(out.errors, `${structure.id}.${property.key} compilable`).toEqual([]);
      }
    });
  }
});
