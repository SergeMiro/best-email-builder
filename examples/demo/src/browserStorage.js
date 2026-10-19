/**
 * Demo storage: the memory storage of Best Email Builder, persisted in localStorage,
 * with a preview compiled in the browser by mjml-browser.
 *
 * Demo only. A real application compiles on its server: the browser must never
 * be trusted with the HTML that gets stored or sent.
 *
 * "Proofread", "Write with AI", "Rewrite with AI" and "Suggest subjects" run in the
 * browser too, with the VISITOR's own key (asked once, kept in this browser's
 * localStorage, sent only to the provider they choose). An application can do the same, or call the model on its
 * server, where its own key stays (`best-email-builder/ai/server`, see the README).
 */

import { createMemoryStorage } from 'best-email-builder/builder';
import { prepareMjml } from '../../../src/renderer/prepareMjml.js';
import { applyServiceLinks } from '../../../src/renderer/links.js';
import { DEFAULT_VARIABLES, mergeVariables } from '../../../src/features/variables/catalog.js';
import {
  applyVariables,
  applyVariablesToText,
  sampleValues,
  unknownVariables,
} from '../../../src/features/variables/service.js';
import { qualityReport } from '../../../src/validation/quality.js';
import { validateMjml } from '../../../src/validation/mjmlValidator.js';
import { claudeProvider, createAi } from 'best-email-builder/ai';

const TEMPLATES_KEY = 'best-email-builder-demo:templates';
const VARIABLES_KEY = 'best-email-builder-demo:variables';
const BRAND_KEY = 'best-email-builder-demo:brand';
/** MJML's own warnings, read back to the model so it fixes them. */
async function compileWarnings(mjml) {
  const { default: mjml2html } = await import('mjml-browser');
  const result = await mjml2html(mjml, { validationLevel: 'soft' });
  return { warnings: (result.errors || []).map((e) => ({ message: e.formattedMessage || e.message })) };
}

/** Claude through Anthropic's SDK, loaded only when a visitor chooses it. */
const claude = claudeProvider({
  client: async (apiKey) => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  },
});

/**
 * The demo's AI module: the visitor's own key, with the provider they choose
 * in the builder's Connect dialog (`askKey: true`). The key stays in this
 * browser and goes only to that provider. Gemini and Mistral have free plans
 * that answer in seconds; OpenRouter's free models take minutes.
 */
export function createBrowserAi() {
  try {
    // The Anthropic key an earlier version of the demo kept: no longer used.
    localStorage.removeItem('best-email-builder-demo:anthropic-key');
  } catch {
    // Private window.
  }
  return createAi({ provider: ['openai', claude, 'mistral', 'gemini', 'openrouter', 'openai-compatible'], askKey: true, compile: compileWarnings });
}

const read = (key, empty = []) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? empty;
  } catch {
    return empty;
  }
};

/** Memory storage + localStorage persistence + in-browser preview. */
export function createDemoStorage() {
  let storage;

  async function render({ mjml, subject, preheader }) {
    const check = validateMjml(mjml);
    if (!check.ok) throw new Error(check.issues.map((i) => i.message).join('; '));
    const catalog = mergeVariables(DEFAULT_VARIABLES, await storage.listVariables());
    const { default: mjml2html } = await import('mjml-browser');
    // MJML 5 compiles asynchronously.
    const result = await mjml2html(prepareMjml(mjml, { title: subject, preheader, emptyImages: 'keep' }), { validationLevel: 'soft' });
    const values = sampleValues(catalog);
    const html = applyServiceLinks(applyVariables(result.html, values, catalog), { unsubscribeUrl: '#' });
    const quality = qualityReport({ mjml, html: result.html, subject });
    const unknown = unknownVariables([mjml, subject || '', preheader || ''].join('\n'), catalog);
    if (unknown.length) {
      quality.push({
        code: 'UNKNOWN_VARIABLE',
        level: 'warning',
        message: `Unknown variables (rendered empty): ${unknown.map((k) => `{{${k}}}`).join(', ')}`,
      });
    }
    return {
      html,
      subject: applyVariablesToText(subject || '', values, catalog),
      preheader: applyVariablesToText(preheader || '', values, catalog),
      warnings: (result.errors || []).map((e) => ({ message: e.formattedMessage || e.message })),
      quality,
    };
  }

  // The brand is kept too; reading it from a website needs a server, so the
  // demo has no "Get my brand" field.
  storage = createMemoryStorage({ render, brand: read(BRAND_KEY, null) });
  const index = new Map(); // memory id → saved entry

  const ready = (async () => {
    for (const variable of read(VARIABLES_KEY)) {
      await storage.saveVariable(variable, { create: true }).catch(() => {});
    }
    for (const entry of read(TEMPLATES_KEY)) {
      const { template } = await storage.create({ ...entry.payload });
      index.set(String(template.id), entry);
    }
  })();

  // The memory storage counts time in test ticks: the demo keeps real dates beside it.
  const withDates = (template) => {
    const entry = template && index.get(String(template.id));
    return entry?.createdAt ? { ...template, createdAt: entry.createdAt, updatedAt: entry.updatedAt ?? null } : template;
  };

  const persistTemplate = async (id) => {
    const template = await storage.load(id);
    const previous = index.get(String(id));
    const at = new Date().toISOString();
    index.set(String(id), {
      createdAt: previous?.createdAt || at,
      updatedAt: previous ? at : null,
      payload: {
        name: template.name,
        subject: template.subject,
        preheader: template.preheader,
        description: template.description,
        document: template.document,
        mjml: template.mjml,
      },
    });
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify([...index.values()]));
  };
  const persistVariables = async () => {
    localStorage.setItem(VARIABLES_KEY, JSON.stringify(await storage.listVariables()));
  };

  return {
    ...storage,
    ready,
    async listVariables() {
      await ready;
      return storage.listVariables();
    },
    async saveBrand(brand) {
      const saved = await storage.saveBrand(brand);
      try {
        localStorage.setItem(BRAND_KEY, JSON.stringify(saved));
      } catch {
        // Private window: the brand lives for this page only.
      }
      return saved;
    },
    async saveVariable(variable, options) {
      const saved = await storage.saveVariable(variable, options);
      await persistVariables();
      return saved;
    },
    async deleteVariable(key) {
      await storage.deleteVariable(key);
      await persistVariables();
    },
    async list() {
      await ready;
      return (await storage.list())
        .map(withDates)
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
    },
    async load(id) {
      await ready;
      return withDates(await storage.load(id));
    },
    async create(payload) {
      const result = await storage.create(payload);
      await persistTemplate(result.template.id);
      return result;
    },
    async duplicate(id) {
      const result = await storage.duplicate(id);
      await persistTemplate(result.template.id);
      return result;
    },
    async save(id, payload) {
      const result = await storage.save(id, payload);
      await persistTemplate(id);
      return result;
    },
    async remove(id) {
      await storage.remove(id);
      index.delete(String(id));
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify([...index.values()]));
    },
  };
}
