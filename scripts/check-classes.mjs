/**
 * Every `mb:` utility used in the source must exist in the built stylesheet —
 * a typo or an unknown token would silently style nothing.
 *
 *   node scripts/check-classes.mjs dist/styles.css
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssFile = process.argv[2] || path.join(root, 'dist', 'styles.css');
const css = fs.readFileSync(cssFile, 'utf8');

/** Escapes a class name the way Tailwind writes it in a selector. */
const escape = (name) => name.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const missing = new Map();
for (const file of walk(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const [token] of source.matchAll(/\bmb:[^\s'"`]+/g)) {
    // `group/name` markers and peers produce no rule of their own.
    if (/^mb:(group|peer)(\/[\w-]+)?$/.test(token)) continue;
    if (!css.includes(`.${escape(token)}`)) {
      if (!missing.has(token)) missing.set(token, path.relative(root, file));
    }
  }
}
if (missing.size) {
  console.error(`${missing.size} utilities produce no CSS:`);
  for (const [token, file] of missing) console.error(`  ${token}  (${file})`);
  process.exitCode = 1;
} else {
  console.log('all utilities found in the stylesheet');
}
