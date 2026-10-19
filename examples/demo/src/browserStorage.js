/**
 * Demo storage: the memory storage of Best Email Builder, persisted in localStorage,
 * with a preview compiled in the browser by mjml-browser.
 *
 * Demo only. A real application compiles on its server: the browser must never
 * be trusted with the HTML that gets stored or sent.
 *
 * A first visit finds five templates of the gallery in the library, three of
 * them tagged, so the bank does not open empty. Tags are kept like templates.
 *
 * "Proofread", "Write with AI", "Rewrite with AI" and "Suggest subjects" run in the
 * browser too, with the VISITOR's own key (asked once, kept in this browser's
 * localStorage, sent only to the provider they choose). An application can do the same, or call the model on its
 * server, where its own key stays (`best-email-builder/ai/server`, see the README).
 */

import { buildGallery, createMemoryStorage, translatorFor } from 'best-email-builder/builder';
import { createDocument } from '../../../src/core/document.js';
import { ENGINE_NAME, ENGINE_VERSION } from '../../../src/engine/NativeAdapter.js';
import { parseMjml } from '../../../src/engine/mjml.js';
import { toProject } from '../../../src/engine/model.js';
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
const TAGS_KEY = 'best-email-builder-demo:tags';
/** Set once the first visit's templates are in: deleting them all must not bring them back. */
const SEEDED_KEY = 'best-email-builder-demo:seeded';

/** The first visit's tags, in the page's language. */
const SEED_TAGS = {
  en: { marketing: 'Marketing', onboarding: 'Onboarding', events: 'Events' },
  fr: { marketing: 'Marketing', onboarding: 'Accueil', events: 'Événements' },
  de: { marketing: 'Marketing', onboarding: 'Onboarding', events: 'Veranstaltungen' },
  es: { marketing: 'Marketing', onboarding: 'Bienvenida', events: 'Eventos' },
  pt: { marketing: 'Marketing', onboarding: 'Boas-vindas', events: 'Eventos' },
  ru: { marketing: 'Маркетинг', onboarding: 'Приветствие', events: 'События' },
  zh: { marketing: '营销', onboarding: '欢迎', events: '活动' },
};
const SEED_COLORS = { marketing: 'blue', onboarding: 'green', events: 'violet' };
/** The gallery's templates, newest first, and their tags. */
const SEED = [
  ['newsletter', ['marketing']],
  ['promotion', ['marketing']],
  ['welcome', ['onboarding']],
  ['event', ['events', 'marketing']],
  ['simple', []],
];

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
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window: the change lives for this page only.
  }
};

/** What the editor would save for this MJML. */
const documentOf = (mjml) => createDocument({ engine: ENGINE_NAME, engineVersion: ENGINE_VERSION, project: toProject(parseMjml(mjml)) });

/**
 * Memory storage + localStorage persistence + in-browser preview.
 * @param {{locale?: string, sender?: object}} [options]  the first visit's templates and tags
 */
export function createDemoStorage({ locale = 'en', sender = {} } = {}) {
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

  /** The HTML a server would keep: no sample values, empty images dropped. */
  const compiled = new Map(); // `${id}@${revision}` → html
  async function htmlOf(template) {
    const key = `${template.id}@${template.revision}`;
    if (!compiled.has(key)) {
      const { default: mjml2html } = await import('mjml-browser');
      const prepared = prepareMjml(template.mjml, { title: template.subject, preheader: template.preheader, lang: locale.slice(0, 2) });
      compiled.set(key, (await mjml2html(prepared, { validationLevel: 'soft' })).html);
    }
    return compiled.get(key);
  }

  // The brand is kept too; reading it from a website needs a server, so the
  // demo has no "Get my brand" field.
  storage = createMemoryStorage({ render, brand: read(BRAND_KEY, null) });
  const index = new Map(); // memory id → saved entry

  /** The gallery's templates and three tags, once. */
  async function seed() {
    const names = SEED_TAGS[locale.slice(0, 2)] || SEED_TAGS.en;
    const existing = await storage.listTags();
    const tagIds = {};
    for (const [key, label] of Object.entries(names)) {
      const same = existing.find((tag) => tag.label === label);
      tagIds[key] = same ? same.id : (await storage.saveTag({ label, color: SEED_COLORS[key] }, { create: true })).id;
    }
    const gallery = new Map(buildGallery({ sender, t: translatorFor(locale) }).map((base) => [base.id, base]));
    const start = Date.now();
    for (const [i, [baseId, tags]] of SEED.entries()) {
      const base = gallery.get(baseId);
      if (!base) continue;
      const { template } = await storage.create({
        name: base.name,
        description: base.description,
        subject: base.subject,
        preheader: base.preheader,
        mjml: base.mjml,
        document: documentOf(base.mjml),
      });
      await storage.setTemplateTags(template.id, tags.map((key) => tagIds[key]));
      index.set(String(template.id), { createdAt: new Date(start - (i + 1) * 3_600_000).toISOString(), updatedAt: null });
    }
    write(SEEDED_KEY, true);
  }

  const ready = (async () => {
    for (const variable of read(VARIABLES_KEY)) {
      await storage.saveVariable(variable, { create: true }).catch(() => {});
    }
    // The memory storage numbers the tags again: saved id → its id now.
    const tagIds = new Map();
    for (const tag of read(TAGS_KEY)) {
      const saved = await storage.saveTag({ label: tag.label, color: tag.color }, { create: true }).catch(() => null);
      if (saved) tagIds.set(String(tag.id), saved.id);
    }
    for (const entry of read(TEMPLATES_KEY)) {
      const { tags = [], ...payload } = entry.payload;
      const { template } = await storage.create(payload);
      const ids = tags.map((id) => tagIds.get(String(id))).filter(Boolean);
      if (ids.length) await storage.setTemplateTags(template.id, ids).catch(() => {});
      index.set(String(template.id), entry);
    }
    if (!read(SEEDED_KEY, false)) await seed();
    // Saved again with the ids they have now.
    await persistTags();
    for (const id of index.keys()) await persistTemplate(id, { edited: false });
  })();

  // The memory storage counts time in test ticks: the demo keeps real dates beside it.
  const withDates = (template) => {
    const entry = template && index.get(String(template.id));
    return entry?.createdAt ? { ...template, createdAt: entry.createdAt, updatedAt: entry.updatedAt ?? null } : template;
  };

  /** `edited: false` — its tags changed, not the template: its date stays. */
  async function persistTemplate(id, { edited = true } = {}) {
    const template = await storage.load(id);
    const previous = index.get(String(id));
    const at = new Date().toISOString();
    index.set(String(id), {
      createdAt: previous?.createdAt || at,
      updatedAt: edited && previous?.payload ? at : (previous?.updatedAt ?? null),
      payload: {
        name: template.name,
        subject: template.subject,
        preheader: template.preheader,
        description: template.description,
        document: template.document,
        mjml: template.mjml,
        tags: template.tags,
      },
    });
    write(TEMPLATES_KEY, [...index.values()]);
  }
  async function persistTags() {
    write(TAGS_KEY, await storage.listTags());
  }
  const persistVariables = async () => {
    write(VARIABLES_KEY, await storage.listVariables());
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
      write(BRAND_KEY, saved);
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
      const template = withDates(await storage.load(id));
      return { ...template, html: await htmlOf(template).catch(() => undefined) };
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
      write(TEMPLATES_KEY, [...index.values()]);
    },
    async listTags() {
      await ready;
      return storage.listTags();
    },
    async saveTag(tag, options) {
      const saved = await storage.saveTag(tag, options);
      await persistTags();
      return saved;
    },
    async deleteTag(id) {
      await storage.deleteTag(id);
      await persistTags();
      for (const templateId of index.keys()) await persistTemplate(templateId, { edited: false });
    },
    async setTemplateTags(id, tagIds) {
      const ids = await storage.setTemplateTags(id, tagIds);
      await persistTemplate(id, { edited: false });
      return ids;
    },
  };
}
