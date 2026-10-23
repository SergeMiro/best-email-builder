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
    '}' }));
  if (backgrounds.length) head.children.push(createNode('mj-style', { attributes: { inline: 'inline' }, content: backgrounds.join('') }));
  return serializeMjml(root);
}
