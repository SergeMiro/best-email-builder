/**
 * Demo storage: the memory storage of Best Email Builder, persisted in localStorage,
 * with a preview compiled in the browser by mjml-browser.
 *
 * Demo only. A real application compiles on its server: the browser must never
 * be trusted with the HTML that gets stored or sent.
 *
 * "Generate" and "Rewrite with AI" run in the browser too, with the VISITOR's
 * own Anthropic key (asked once, kept in this browser's localStorage, sent only
 * to Anthropic). A real application calls the model on its server, where its
 * key stays (`createEmailGenerator` + `claudeEmailModel`, see the README).
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
import { createEmailGenerator } from '../../../src/features/generate/generator.js';
import { claudeEmailModel } from '../../../src/features/generate/claude.js';

const TEMPLATES_KEY = 'best-email-builder-demo:templates';
const VARIABLES_KEY = 'best-email-builder-demo:variables';
const AI_KEY = 'best-email-builder-demo:anthropic-key';

/** The visitor's Anthropic key, '' when none. */
export function readAiKey() {
  try {
    return localStorage.getItem(AI_KEY) || '';
  } catch {
    return '';
  }
}

/** Stores the key, or forgets it with ''. */
export function writeAiKey(key) {
  try {
    if (key) localStorage.setItem(AI_KEY, key);
    else localStorage.removeItem(AI_KEY);
  } catch {
    // Private window: the key lives for this page only.
  }
}

/** MJML's own warnings, read back to the model so it fixes them. */
async function compileWarnings(mjml) {
  const { default: mjml2html } = await import('mjml-browser');
  const result = await mjml2html(mjml, { validationLevel: 'soft' });
  return { warnings: (result.errors || []).map((e) => ({ message: e.formattedMessage || e.message })) };
}

/**
 * `generate` and `rewrite` of the demo storage: one key, one client.
 * @param {{askKey: () => string, onKey: (key: string) => void, messages: () => Record<string, string>}} options
 *   `askKey`: asks the visitor for a key ('' when they decline);
 *   `messages`: the demo's own error texts, in the page's current language.
 */
export function createBrowserAi({ askKey, onKey, messages }) {
  /** @param {(generator: ReturnType<typeof createEmailGenerator>) => Promise<any>} call */
  const withClaude = async (call) => {
    let apiKey = readAiKey();
    if (!apiKey) {
      apiKey = askKey().trim();
      if (!apiKey) throw new Error(messages().keyNeeded);
      writeAiKey(apiKey);
      onKey(apiKey);
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
    // `low`: a visitor waits less; a server would keep the default.
    const generator = createEmailGenerator({ model: claudeEmailModel({ client, effort: 'low' }), compile: compileWarnings });
    try {
      return await call(generator);
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        writeAiKey('');
        onKey('');
        throw new Error(messages().keyRefused, { cause: error });
      }
      if (error?.status === 429 || error?.status === 529 || error?.status >= 500) throw new Error(messages().busy, { cause: error });
      throw error;
    }
  };
  return {
    generate: (input, { signal } = {}) => withClaude((generator) => generator.generate(input, { signal })),
    rewrite: (input, { signal } = {}) => withClaude((generator) => generator.rewrite(input, { signal })),
  };
}

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};

/** Memory storage + localStorage persistence + in-browser preview (and AI, when given). */
export function createDemoStorage({ generate, rewrite } = {}) {
  let storage;

  async function render({ mjml, subject, preheader }) {
    const check = validateMjml(mjml);
    if (!check.ok) throw new Error(check.issues.map((i) => i.message).join('; '));
    const catalog = mergeVariables(DEFAULT_VARIABLES, await storage.listVariables());
    const { default: mjml2html } = await import('mjml-browser');
    // MJML 5 compiles asynchronously.
    const result = await mjml2html(prepareMjml(mjml, { title: subject, preheader }), { validationLevel: 'soft' });
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

  storage = createMemoryStorage({ render, generate, rewrite });
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
