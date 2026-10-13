/**
 * Every class in a `className` string must be a prefixed utility (`eb:…`) or
 * one of the package's own class names (`eb-…`): an unprefixed
 * Tailwind class would silently produce no CSS.
 *
 *   node scripts/check-unprefixed.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = /^(eb:|eb-)/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.jsx')) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of walk(path.join(root, 'src'))) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/className="([^"]*)"/g)) {
    for (const token of match[1].split(/\s+/).filter(Boolean)) {
      if (!ALLOWED.test(token)) problems.push(`${path.relative(root, file)}: "${token}"`);
    }
  }
}
if (problems.length) {
  console.error(`${problems.length} unprefixed classes:\n  ${problems.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log('no unprefixed class');
}
