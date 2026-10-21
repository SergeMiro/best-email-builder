// @ts-check
/**
 * Merge tags in the words of an element — `{{contact.firstname}}`,
 * `{{ unsubscribe }}`, `{{name | default: "there"}}` — where they are, and
 * how one is taken out (the × on a tag in the canvas).
 *
 * The same syntax as the variables feature (`features/variables/service.js`),
 * which the engine does not import.
 */

const MERGE_TAG = /\{\{\s*[A-Za-z][\w.]*\s*(?:\|[^{}]*)?\}\}/g;

const SPACE = /[ \u00a0]/;
/** What may follow a word directly: the tag's space goes with the tag. */
const CLOSING = /[.,;:!?)\]\u00bb\u201d'"]/;

/**
 * The merge tags of a text, in order.
 * @param {string} text
 * @returns {{start: number, end: number}[]}
 */
export function findTags(text) {
  return [...String(text).matchAll(MERGE_TAG)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

/**
 * What to delete to take a tag out: the tag, and one space beside it so that
 * no double space or space before a comma is left. "Hello {{name}}, welcome"
 * gives "Hello, welcome"; "{{name}} Smith" gives "Smith".
 * @param {string} text @param {number} start @param {number} end
 */
export function removalSpan(text, start, end) {
  const before = text[start - 1] || '';
  const after = text[end] || '';
  if (SPACE.test(before) && (!after || SPACE.test(after) || CLOSING.test(after))) return { start: start - 1, end };
  if ((!before || before === '\n') && SPACE.test(after)) return { start, end: end + 1 };
  return { start, end };
}

/**
 * A plain text (a button's label) without its `index`-th tag.
 * @param {string} text @param {number} index
 */
export function withoutTagInText(text, index) {
  const tag = findTags(text)[index];
  if (!tag) return text;
  const span = removalSpan(text, tag.start, tag.end);
  return text.slice(0, span.start) + text.slice(span.end);
}

/**
 * The text nodes under `root`, flattened: their joined text, and where each
 * one starts in it. `skip`: elements whose text does not count (the canvas's
 * preview of an AI answer).
 * @param {Node} root @param {(element: Element) => boolean} [skip]
 */
export function textMap(root, skip = () => false) {
  /** @type {{node: Text, start: number}[]} */
  const nodes = [];
  let text = '';
  const walk = (/** @type {Node} */ node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        nodes.push({ node: /** @type {Text} */ (child), start: text.length });
        text += /** @type {Text} */ (child).data;
      } else if (child.nodeType === 1 && !skip(/** @type {Element} */ (child))) walk(child);
    }
  };
  walk(root);
  /** Text node and offset of a position in the joined text. @param {number} at @param {boolean} [end] */
  const pointOf = (at, end = false) => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const { node, start } = nodes[i];
      if (end ? at > start || (at === start && i === 0) : at >= start) return { node, offset: Math.min(at - start, node.data.length) };
    }
    return null;
  };
  return { text, nodes, pointOf };
}

/**
 * Rich text (a text block's HTML) without its `index`-th tag. Elements the
 * cut leaves empty go too.
 * @param {string} html @param {number} index @param {Document} document
 */
export function withoutTag(html, index, document) {
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const map = textMap(template.content);
  const tag = findTags(map.text)[index];
  if (!tag) return html;
  const span = removalSpan(map.text, tag.start, tag.end);
  for (const { node, start } of map.nodes) {
    const from = Math.max(span.start, start) - start;
    const to = Math.min(span.end, start + node.data.length) - start;
    if (to <= from) continue;
    node.data = node.data.slice(0, from) + node.data.slice(to);
    /** @type {Node|null} */
    let empty = node.data ? null : node;
    while (empty && empty.parentNode && empty.parentNode !== template.content) {
      const parent = empty.parentNode;
      parent.removeChild(empty);
      empty = parent.childNodes.length ? null : parent;
    }
    if (empty && empty.parentNode) empty.parentNode.removeChild(empty);
  }
  return template.innerHTML;
}
