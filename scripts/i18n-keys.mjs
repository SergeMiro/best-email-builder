/**
 * Lists the translatable strings of the source and checks a locale against
 * them.
 *
 *   node scripts/i18n-keys.mjs            keys found in src/
 *   node scripts/i18n-keys.mjs fr         keys missing from the `fr` locale
 *
 * A key is the first argument of a `t('…')` call, or a user-visible field of
 * the block, variable and feature registries (label, description, group,
 * placeholder, option labels), the purposes of "Generate", the rewrite
 * actions, the error messages and the brand messages.
 *
 * Two dictionaries per locale: the core's (`src/i18n/`) and the AI module's
 * (`src/ai/i18n/`), which an application without the AI never loads. A key
 * the core uses lives in the core's; a key only the AI uses lives in the
 * AI's, and nowhere else — the check fails otherwise.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AI_DIR = path.join(root, 'src', 'ai') + path.sep;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(js|jsx)$/.test(entry.name) && !full.includes(`${path.sep}i18n${path.sep}`)) out.push(full);
  }
  return out;
}

const CALL = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
/** Interface objects whose `label` the fields translate (`label: 'Label'`). */
const UI_LABEL = /\blabel:\s*'([^'\\]+)'/g;

/** @returns {Promise<{core: string[], ai: string[]}>} the keys of the core, and those of the AI module */
export async function collectKeys() {
  const core = new Set();
  const ai = new Set();
  for (const file of walk(path.join(root, 'src'))) {
    const keys = file.startsWith(AI_DIR) ? ai : core;
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(CALL)) {
      if (match[1] === '`' && match[2].includes('${')) continue;
      keys.add(match[2].replace(/\\(['"`\\])/g, '$1'));
    }
    if (file.includes(`${path.sep}ui${path.sep}`)) {
      for (const match of source.matchAll(UI_LABEL)) if (/[a-z]/i.test(match[1])) keys.add(match[1]);
    }
  }
  // Registry data rendered through t().
  const { emailBlocks } = await import(pathToUrl('src/blocks/index.js'));
  for (const block of emailBlocks.list()) {
    [block.label, block.description].filter(Boolean).forEach((k) => core.add(k));
    for (const property of block.properties || []) {
      [property.label, property.group, property.placeholder].filter((k) => k && /[a-z]/i.test(k) && k !== 'https://').forEach((k) => core.add(k));
      for (const option of property.options || []) if (/[a-z]/i.test(option.label) && !option.value.includes(',')) core.add(option.label);
    }
  }
  const { DEFAULT_VARIABLES } = await import(pathToUrl('src/features/variables/catalog.js'));
  for (const variable of DEFAULT_VARIABLES) [variable.label, variable.group].forEach((k) => core.add(k));
  const { BRAND_IMPORT_ERRORS, BRAND_NOTES } = await import(pathToUrl('src/features/brand/messages.js'));
  for (const [, message] of Object.values(BRAND_IMPORT_ERRORS)) core.add(message);
  for (const message of Object.values(BRAND_NOTES)) core.add(message);

  const { EMAIL_PURPOSES, PURPOSE_CATEGORIES } = await import(pathToUrl('src/ai/purposes.js'));
  for (const entry of [...EMAIL_PURPOSES, ...PURPOSE_CATEGORIES]) ai.add(entry.label);
  const { REWRITE_ACTIONS } = await import(pathToUrl('src/ai/rewrite.js'));
  for (const action of REWRITE_ACTIONS) ai.add(action.label);
  const { GENERATION_ERRORS } = await import(pathToUrl('src/ai/draft.js'));
  for (const error of Object.values(GENERATION_ERRORS)) ai.add(error.message);
  const { AI_PROVIDERS } = await import(pathToUrl('src/ai/providers.js'));
  for (const provider of Object.values(AI_PROVIDERS)) if (provider.free) ai.add(provider.free);
  // A key both use is the core's: the AI's dictionary only adds.
  for (const key of core) ai.delete(key);
  return { core: [...core].sort(), ai: [...ai].sort() };
}

function pathToUrl(relative) {
  return new URL(`file:///${path.join(root, relative).replace(/\\/g, '/')}`).href;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = await collectKeys();
  const locale = process.argv[2];
  if (!locale) {
    console.log([...keys.core, ...keys.ai].sort().join('\n'));
  } else {
    const { LOCALES } = await import(pathToUrl('src/i18n/index.js'));
    const { AI_MESSAGES } = await import(pathToUrl('src/ai/i18n/index.js'));
    const coreMessages = LOCALES[locale] || {};
    const aiMessages = AI_MESSAGES[locale] || {};
    const report = {
      total: keys.core.length + keys.ai.length,
      missing: keys.core.filter((k) => !(k in coreMessages)),
      missingAi: keys.ai.filter((k) => !(k in aiMessages)),
      // AI-only texts in the core's dictionary: shipped to applications without the AI.
      aiKeysInCore: keys.ai.filter((k) => k in coreMessages),
      // Core texts in the AI's dictionary: missing from applications without the AI.
      coreKeysInAi: keys.core.filter((k) => k in aiMessages),
      unused: Object.keys(coreMessages).filter((k) => !keys.core.includes(k) && !keys.ai.includes(k)),
      unusedAi: Object.keys(aiMessages).filter((k) => !keys.ai.includes(k) && !keys.core.includes(k)),
    };
    console.log(JSON.stringify(report, null, 2));
    if (report.missing.length || report.missingAi.length || report.aiKeysInCore.length || report.coreKeysInAi.length) process.exitCode = 1;
  }
}
