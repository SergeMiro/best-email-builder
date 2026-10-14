/**
 * Lists the translatable strings of the source and checks a locale against
 * them.
 *
 *   node scripts/i18n-keys.mjs            keys found in src/
 *   node scripts/i18n-keys.mjs fr         keys missing from the `fr` locale
 *
 * A key is the first argument of a `t('…')` call, or a user-visible field of
 * the block, variable and feature registries (label, description, group,
 * placeholder, option labels), the purposes of "Generate" and its error
 * messages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

export async function collectKeys() {
  const keys = new Set();
  for (const file of walk(path.join(root, 'src'))) {
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
    [block.label, block.description].filter(Boolean).forEach((k) => keys.add(k));
    for (const property of block.properties || []) {
      [property.label, property.group, property.placeholder].filter((k) => k && /[a-z]/i.test(k) && k !== 'https://').forEach((k) => keys.add(k));
      for (const option of property.options || []) if (/[a-z]/i.test(option.label) && !option.value.includes(',')) keys.add(option.label);
    }
  }
  const { DEFAULT_VARIABLES } = await import(pathToUrl('src/features/variables/catalog.js'));
  for (const variable of DEFAULT_VARIABLES) [variable.label, variable.group].forEach((k) => keys.add(k));
  const { EMAIL_PURPOSES, PURPOSE_CATEGORIES } = await import(pathToUrl('src/features/generate/purposes.js'));
  for (const entry of [...EMAIL_PURPOSES, ...PURPOSE_CATEGORIES]) keys.add(entry.label);
  const { GENERATION_ERRORS } = await import(pathToUrl('src/features/generate/draft.js'));
  for (const error of Object.values(GENERATION_ERRORS)) keys.add(error.message);
  return [...keys].sort();
}

function pathToUrl(relative) {
  return new URL(`file:///${path.join(root, relative).replace(/\\/g, '/')}`).href;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const keys = await collectKeys();
  const locale = process.argv[2];
  if (!locale) {
    console.log(keys.join('\n'));
  } else {
    const { LOCALES } = await import(pathToUrl('src/i18n/index.js'));
    const messages = LOCALES[locale] || {};
    const missing = keys.filter((k) => !(k in messages));
    const unused = Object.keys(messages).filter((k) => !keys.includes(k));
    console.log(JSON.stringify({ total: keys.length, missing, unused }, null, 2));
    if (missing.length) process.exitCode = 1;
  }
}
