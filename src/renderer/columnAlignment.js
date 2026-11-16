// @ts-check
import { parseMjml, serializeMjml } from '../engine/mjml.js';
import { createNode, findFirst, walk } from '../engine/model.js';

/**
 * MJML uses inline blocks outside Outlook. They have independent heights,
 * and mixed middle/top alignment uses a text baseline instead of the row.
 * Use equal-height table cells for every desktop row with multiple columns.
 * Outlook keeps MJML's native conditional table. Mobile stacking is unchanged.
 * This runs inside the compiler, after validation, so callers cannot supply
 * arbitrary raw HTML or CSS through the document.
 * @param {string} source
 */
export function prepareColumnAlignment(source) {
  if ((source.match(/<mj-(?:column|group)\b/g) || []).length < 2 || source.includes('eb-va-row')) return source;
  const root = parseMjml(source);
  let changed = false;
  const backgrounds = [];
  let count = 0;
  walk(root, (node) => {
    if (!['mj-section', 'mj-group'].includes(node.tag)) return;
    const columns = node.children.filter((child) => child.tag === 'mj-column' || child.tag === 'mj-group');
    if (columns.length < 2) return;
    changed = true;
    for (const column of columns) {
      column.attributes['css-class'] = `${column.attributes['css-class'] || ''} eb-va-col`.trim();
      const color = column.attributes['background-color'] || '';
      if (/^(?:#[\da-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(color) && !column.attributes['css-class'].includes('eb-render-box-')) {
        const marker = `eb-va-bg-${count++}`;
        column.attributes['css-class'] += ` ${marker}`;
        backgrounds.push(`.${marker} {background-color:${color};}`);
      }
    }
    node.children = [
      createNode('mj-raw', { content: '<!--[if !mso]><!--><div class="eb-va-row"><!--<![endif]-->' }),
      ...node.children,
      createNode('mj-raw', { content: '<!--[if !mso]><!--></div><!--<![endif]-->' }),
    ];
  });
  if (!changed) return source;
  let head = findFirst(root, 'mj-head');
  if (!head) {
    head = createNode('mj-head');
    root.children.unshift(head);
  }
  const width = findFirst(head, 'mj-breakpoint')?.attributes.width || '';
  const breakpoint = /^\d+(?:\.\d+)?px$/.test(width) ? width : '480px';
  head.children.push(createNode('mj-style', { content:
    `@media only screen and (min-width:${breakpoint}) {` +
    '.eb-va-row {display:table;width:100%;table-layout:fixed;}' +
    '.eb-va-row > .eb-va-col {display:table-cell!important;}' +
    '}' +
    // Undo the inline px cap of `capColumnWidths` on phones: columns stack full width.
    `@media only screen and (max-width:${Number.parseFloat(breakpoint) - 1}px) {.eb-va-col {max-width:100%!important;}}` }));
  if (backgrounds.length) head.children.push(createNode('mj-style', { attributes: { inline: 'inline' }, content: backgrounds.join('') }));
  return serializeMjml(root);
}

/**
 * Columns side by side without media queries (new Outlook, Outlook on the web,
 * webmails that drop `<style>`): MJML gives a stacked column `width:100%` and
 * only widens it from the breakpoint up. Capping it inline at its pixel width
 * lets the columns sit side by side at the email's width and wrap on their own
 * on a narrow screen.
 *
 * The cap is the exact width rounded down: the row (section `max-width` minus
 * the padding and borders of its cell) × the column's share. Outlook's cell
 * width is no cap: MJML rounds it, three thirds of 560 px are 187 + 187 + 187
 * = 561 px and the third wraps. When the markup cannot be read, or disagrees
 * with that cell by more than 1 px, the cell width minus half a pixel, floored.
 * @param {string} html
 */
export function capColumnWidths(html) {
  let section = NaN;
  let row = NaN;
  return html.replace(
    /<div\s+style="[^"]*?margin:0px auto;max-width:(\d+(?:\.\d+)?)px;|<td\s+style="([^"]*?\bdirection:(?:ltr|rtl);font-size:0px;[^"]*)"|(<td\b[^>]*?\bstyle="[^"]*?\bwidth:(\d+(?:\.\d+)?)px;[^"]*"[^>]*>(?:\s*<!\[endif\]-->)?\s*<div\s+class="[^"]*?\bmj-column-(per|px)-(\d+(?:-\d+)?)\b[^"]*\beb-va-col\b[^"]*"\s+style="[^"]*?)(?<![-\w])width:\s*100%;?/g,
    (match, sectionWidth, sectionCell, before, cell, unit, size) => {
      if (sectionWidth) {
        section = Number(sectionWidth);
        return match;
      }
      if (sectionCell) {
        row = section - horizontal(sectionCell);
        return match;
      }
      const share = Number(size.replace('-', '.'));
      const exact = unit === 'px' ? share : Math.floor((row * share) / 100 + 1e-6);
      const cap = Number.isFinite(exact) && Math.abs(exact - Number(cell)) <= 1 ? exact : Math.floor(Number(cell) - 0.5);
      return `${before}width:100%;max-width:${cap}px;`;
    }
  );
}

/** Left + right padding and borders of a section cell, read as MJML does; NaN if not in px. @param {string} style */
function horizontal(style) {
  let left = NaN;
  let right = NaN;
  let borderLeft = 0;
  let borderRight = 0;
  for (const declaration of style.split(';')) {
    const [property, value = ''] = declaration.split(':').map((part) => part.trim());
    if (property === 'padding') {
      const sides = value.split(/\s+/).map(px);
      [left, right] = [sides[sides.length === 4 ? 3 : 1] ?? sides[0], sides[1] ?? sides[0]];
    } else if (property === 'padding-left') left = px(value);
    else if (property === 'padding-right') right = px(value);
    else if (property === 'border') borderLeft = borderRight = px(value.split(/\s+/)[0]) || 0;
    else if (property === 'border-left') borderLeft = px(value.split(/\s+/)[0]) || 0;
    else if (property === 'border-right') borderRight = px(value.split(/\s+/)[0]) || 0;
  }
  return left + right + borderLeft + borderRight;
}

/** `20px` or `0` → 20 or 0; anything else → NaN. @param {string} value */
const px = (value) => (/^\d+(?:\.\d+)?(?:px)?$/.test(value) ? Number.parseFloat(value) : NaN);
