/**
 * Demo storage: the memory storage of Best Email Builder, persisted in localStorage,
 * with a preview compiled in the browser by mjml-browser.
 *
 * Demo only. A real application compiles on its server: the browser must never
 * be trusted with the HTML that gets stored or sent.
 */

import { createMemoryStorage } from 'best-email-builder';
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

const TEMPLATES_KEY = 'best-email-builder-demo:templates';
const VARIABLES_KEY = 'best-email-builder-demo:variables';

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
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
    const result = mjml2html(prepareMjml(mjml, { title: subject, preheader }), { validationLevel: 'soft' });
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

  storage = createMemoryStorage({ render });
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

  const persistTemplate = async (id) => {
    const template = await storage.load(id);
    index.set(String(id), {
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
      const out = [];
      for (const id of index.keys()) out.push(await storage.load(id));
      return out;
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
      index.delete(String(id));
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify([...index.values()]));
    },
  };
}
