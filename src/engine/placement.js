// @ts-check
/**
 * PLACEMENT — where a block goes, by click or by drag and drop.
 *
 * MJML enforces its hierarchy: body → section → column → content. So:
 *   - a CONTENT block (text, image…) lives in a column. Clicked, it goes into
 *     the selected column, after the selected element in its column, and
 *     otherwise into a new one-column section ("wrap") after the selected
 *     section or at the end of the email. Dropped, it goes where the drop
 *     line shows: over a column, between two of its elements (beside a
 *     shorter column, at its end); over a section's top or bottom padding,
 *     or outside the sections, between two sections (wrapped in a new
 *     section);
 *   - a LAYOUT (a section) lives in the body: after the selected section, or
 *     between two sections where it is dropped.
 *
 * Pure functions over the model and, for drops, over the boxes the canvas
 * measured — testable without a browser.
 */

import { SECTION_TAGS, closestOfTags, findFirst, findNode, pathTo } from './model.js';

/** @typedef {import('./model.js').EmailNode} EmailNode */

/** Containers whose children are content blocks. */
export const CONTENT_CONTAINERS = new Set(['mj-column', 'mj-hero']);

/**
 * @typedef {{parentId: string, index: number, wrap: boolean}} Placement
 *   `wrap`: the content must be wrapped in a new section first.
 */

/**
 * Click placement.
 * @param {EmailNode} root
 * @param {'content'|'layout'} kind
 * @param {string|null} targetId  selected element, if any
 * @returns {Placement}
 */
export function placementFor(root, kind, targetId) {
  const body = findFirst(root, 'mj-body');
  if (!body) throw new Error('The email has no body');
  const target = targetId ? findNode(root, targetId) : null;
  const section = target ? sectionOf(root, target.id, body) : null;
  const afterSection = () =>
    section
      ? { parentId: body.id, index: body.children.findIndex((c) => c.id === section.id) + 1 }
      : { parentId: body.id, index: body.children.length };

  if (kind === 'layout' || !target) return { ...afterSection(), wrap: kind !== 'layout' };

  if (CONTENT_CONTAINERS.has(target.tag)) return { parentId: target.id, index: target.children.length, wrap: false };
  const container = closestOfTags(root, target.id, CONTENT_CONTAINERS);
  if (container && container.id !== target.id) {
    // The container's direct child holding the target: insert after it.
    const path = /** @type {EmailNode[]} */ (pathTo(root, target.id));
    const child = path[path.indexOf(container) + 1];
    return { parentId: container.id, index: container.children.indexOf(child) + 1, wrap: false };
  }
  return { ...afterSection(), wrap: true };
}

/**
 * The body-level section holding a node (itself if it is one).
 * @param {EmailNode} root @param {string} id @param {EmailNode} body
 */
export function sectionOf(root, id, body) {
  const path = pathTo(root, id);
  if (!path) return null;
  const bodyIndex = path.indexOf(body);
  if (bodyIndex === -1 || bodyIndex === path.length - 1) return null;
  return path[bodyIndex + 1];
}

/**
 * @typedef {{top: number, bottom: number, left: number, right: number}} Box
 * @typedef {Placement & {line: {x: number, y: number, width: number}}} DropTarget
 *   `line`: where the canvas draws the drop indicator (frame coordinates).
 */

/**
 * Drop placement for a pointer at (x, y), in canvas frame coordinates.
 *
 * @param {EmailNode} root
 * @param {{kind: 'content'|'layout', nodeId?: string|null}} dragged
 *   `nodeId`: the element being moved (it is skipped when measuring, and
 *   cannot be dropped into itself)
 * @param {{x: number, y: number}} point
 * @param {string|null} hitId  the marked element under the pointer
 * @param {(id: string) => Box|null} boxOf  its box in the frame
 * @returns {DropTarget|null}
 */
export function dropTargetFor(root, dragged, point, hitId, boxOf) {
  const body = findFirst(root, 'mj-body');
  if (!body) return null;
  const skip = dragged.nodeId || null;

  if (dragged.kind === 'content') {
    const column = columnAt(root, point, hitId, boxOf, skip);
    if (column) return withinContainer(column, point, boxOf, skip);
  }
  return betweenSections(body, point, boxOf, skip, dragged.kind === 'content');
}

/**
 * The content container under the pointer: the one holding the hit element,
 * or, over a section's empty area beside a shorter column, the column whose
 * horizontal span holds the pointer.
 * @param {EmailNode} root @param {{x: number, y: number}} point @param {string|null} hitId
 * @param {(id: string) => Box|null} boxOf @param {string|null} skip
 */
function columnAt(root, point, hitId, boxOf, skip) {
  if (!hitId) return null;
  // Over the element being moved: its own column (never inside itself).
  const moved = skip ? findNode(root, skip) : null;
  const overMoved = Boolean(moved && pathTo(moved, hitId));
  if (moved && overMoved && !CONTENT_CONTAINERS.has(moved.tag)) {
    const own = closestOfTags(root, moved.id, CONTENT_CONTAINERS);
    return own && own.id !== moved.id ? own : null;
  }
  const over = moved && overMoved ? moved.id : hitId;
  const direct = closestOfTags(root, over, CONTENT_CONTAINERS);
  if (direct) return direct;
  const section = closestOfTags(root, over, SECTION_TAGS);
  if (!section) return null;
  const columns = [];
  const collect = (/** @type {EmailNode} */ node) => {
    for (const child of node.children) {
      if (CONTENT_CONTAINERS.has(child.tag)) columns.push(child);
      else if (child.tag === 'mj-group') collect(child);
    }
  };
  collect(section);
  // The section's top and bottom paddings (above or below all its columns)
  // are the place BETWEEN sections: the drop makes a section of its own.
  const boxes = columns.map((column) => boxOf(column.id)).filter(Boolean);
  if (!boxes.length) return null;
  const top = Math.min(...boxes.map((b) => /** @type {Box} */ (b).top));
  const bottom = Math.max(...boxes.map((b) => /** @type {Box} */ (b).bottom));
  if (point.y < top || point.y > bottom) return null;
  // Beside a shorter column: that column.
  return columns.find((column) => {
    const box = boxOf(column.id);
    return box && point.x >= box.left && point.x <= box.right;
  }) || null;
}

/**
 * Between two children of a column, by the vertical middle of each.
 * @param {EmailNode} container @param {{x: number, y: number}} point
 * @param {(id: string) => Box|null} boxOf @param {string|null} skip
 * @returns {DropTarget|null}
 */
function withinContainer(container, point, boxOf, skip) {
  const box = boxOf(container.id);
  if (!box) return null;
  const width = box.right - box.left;
  const children = container.children.map((child, index) => ({ child, index })).filter(({ child }) => child.id !== skip);
  for (const { child, index } of children) {
    const childBox = boxOf(child.id);
    if (childBox && point.y < (childBox.top + childBox.bottom) / 2) {
      return { parentId: container.id, index, wrap: false, line: { x: box.left, y: childBox.top, width } };
    }
  }
  const last = children.length ? boxOf(children[children.length - 1].child.id) : null;
  return {
    parentId: container.id,
    index: container.children.length,
    wrap: false,
    line: { x: box.left, y: last ? last.bottom : box.top + Math.min(24, (box.bottom - box.top) / 2), width },
  };
}

/**
 * Between two sections of the body, by the vertical middle of each.
 * @param {EmailNode} body @param {{x: number, y: number}} point
 * @param {(id: string) => Box|null} boxOf @param {string|null} skip @param {boolean} wrap
 * @returns {DropTarget|null}
 */
function betweenSections(body, point, boxOf, skip, wrap) {
  const bodyBox = boxOf(body.id);
  const sections = body.children.map((child, index) => ({ child, index })).filter(({ child }) => child.id !== skip);
  let last = null;
  for (const { child, index } of sections) {
    const box = boxOf(child.id);
    if (!box) continue;
    last = box;
    if (point.y < (box.top + box.bottom) / 2) {
      return { parentId: body.id, index, wrap, line: { x: box.left, y: box.top, width: box.right - box.left } };
    }
  }
  const frame = last || bodyBox;
  if (!frame) return null;
  return {
    parentId: body.id,
    index: body.children.length,
    wrap,
    line: { x: frame.left, y: last ? last.bottom : frame.top + 24, width: frame.right - frame.left },
  };
}
