// @ts-check
/**
 * THE EMAIL MODEL — the builder's own document, an MJML tree with ids.
 *
 *   { id, tag: 'mj-text', attributes: { color: '#2b3038' }, children: [], content: 'Hello' }
 *
 * One node per MJML element. "Ending" elements (`mj-text`, `mj-button`…)
 * keep their inner HTML in `content`; the others hold `children`. Ids are
 * opaque, unique within a tree, made of `[a-z0-9]` so they can live in a CSS
 * class (the canvas finds an element by them, see `canvasMjml.js`).
 *
 * Every operation is PURE: it returns a new tree and never changes the one it
 * got, sharing the untouched branches. The undo history is then just a list
 * of trees.
 *
 * Dependency-free: runs in the browser, on the server and in unit tests.
 */

/**
 * @typedef {{
 *   id: string,
 *   tag: string,
 *   attributes: Record<string, string>,
 *   children: EmailNode[],
 *   content: string|null,
 * }} EmailNode
 */

/** MJML elements whose inner content is HTML (MJML calls them "ending tags"). */
export const ENDING_TAGS = new Set([
  'mj-text',
  'mj-button',
  'mj-navbar-link',
  'mj-social-element',
  'mj-table',
  'mj-raw',
  'mj-title',
  'mj-preview',
  'mj-style',
  'mj-accordion-title',
  'mj-accordion-text',
]);

/** Elements that hold a whole section's place in the body. */
export const SECTION_TAGS = new Set(['mj-section', 'mj-wrapper', 'mj-hero']);

/** Elements that are never removed, moved or duplicated. */
export const LOCKED_TAGS = new Set(['mjml', 'mj-head', 'mj-body']);

let counter = 0;

/** A fresh id: short, unique for the page's lifetime, `[a-z0-9]` only. */
export function createId() {
  counter = (counter + 1) % 1679616; // 36^4
  return `n${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(4, '0')}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, '0')}`;
}

/**
 * @param {string} tag
 * @param {{attributes?: Record<string, string>, children?: EmailNode[], content?: string|null, id?: string}} [parts]
 * @returns {EmailNode}
 */
export function createNode(tag, { attributes = {}, children = [], content = null, id = createId() } = {}) {
  return { id, tag, attributes: { ...attributes }, children: [...children], content: ENDING_TAGS.has(tag) ? String(content ?? '') : null };
}

/**
 * Deep copy with NEW ids everywhere (duplicate, paste, insert a block twice).
 * @param {EmailNode} node
 * @returns {EmailNode}
 */
export function cloneWithNewIds(node) {
  return {
    id: createId(),
    tag: node.tag,
    attributes: { ...node.attributes },
    children: node.children.map(cloneWithNewIds),
    content: node.content,
  };
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

/**
 * The node with this id and its ancestors (root first), or null.
 * @param {EmailNode} root @param {string} id
 * @returns {EmailNode[]|null}
 */
export function pathTo(root, id) {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const path = pathTo(child, id);
    if (path) return [root, ...path];
  }
  return null;
}

/** @param {EmailNode} root @param {string|null|undefined} id */
export function findNode(root, id) {
  if (!id) return null;
  const path = pathTo(root, id);
  return path ? path[path.length - 1] : null;
}

/** @param {EmailNode} root @param {string} id */
export function parentOf(root, id) {
  const path = pathTo(root, id);
  return path && path.length > 1 ? path[path.length - 2] : null;
}

/**
 * Closest node (itself included) whose tag is one of `tags`.
 * @param {EmailNode} root @param {string} id @param {Set<string>|string[]} tags
 */
export function closestOfTags(root, id, tags) {
  const set = tags instanceof Set ? tags : new Set(tags);
  const path = pathTo(root, id);
  if (!path) return null;
  for (let i = path.length - 1; i >= 0; i -= 1) if (set.has(path[i].tag)) return path[i];
  return null;
}

/** First node of a tag, depth first. @param {EmailNode} root @param {string} tag @returns {EmailNode|null} */
export function findFirst(root, tag) {
  if (root.tag === tag) return root;
  for (const child of root.children) {
    const found = findFirst(child, tag);
    if (found) return found;
  }
  return null;
}

/** Every node, depth first. @param {EmailNode} root @param {(node: EmailNode) => void} visit */
export function walk(root, visit) {
  visit(root);
  for (const child of root.children) walk(child, visit);
}

/* ── Writing (pure) ──────────────────────────────────────────────────────── */

/**
 * The tree with the node `id` replaced by `update(node)`.
 * @param {EmailNode} root @param {string} id @param {(node: EmailNode) => EmailNode} update
 * @returns {EmailNode}
 */
export function updateNode(root, id, update) {
  if (root.id === id) return update(root);
  let changed = false;
  const children = root.children.map((child) => {
    const next = updateNode(child, id, update);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

/**
 * Sets (string) or removes (null, '') attributes.
 * @param {EmailNode} root @param {string} id @param {Record<string, string|null|undefined>} attributes
 */
export function setAttributes(root, id, attributes) {
  return updateNode(root, id, (node) => {
    const next = { ...node.attributes };
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === '') delete next[key];
      else next[key] = String(value);
    }
    return { ...node, attributes: next };
  });
}

/** @param {EmailNode} root @param {string} id @param {string} content */
export function setContent(root, id, content) {
  return updateNode(root, id, (node) => (node.content === null ? node : { ...node, content: String(content ?? '') }));
}

/**
 * Inserts nodes into `parentId` at `index` (clamped).
 * @param {EmailNode} root @param {string} parentId @param {number} index @param {EmailNode[]} nodes
 */
export function insertNodes(root, parentId, index, nodes) {
  return updateNode(root, parentId, (parent) => {
    const at = Math.max(0, Math.min(index, parent.children.length));
    const children = [...parent.children];
    children.splice(at, 0, ...nodes);
    return { ...parent, children };
  });
}

/** @param {EmailNode} root @param {string} id */
export function removeNode(root, id) {
  const parent = parentOf(root, id);
  if (!parent) return root;
  return updateNode(root, parent.id, (p) => ({ ...p, children: p.children.filter((c) => c.id !== id) }));
}

/**
 * Moves a node under `parentId` at `index`, where `index` counts the target's
 * children BEFORE the node leaves its place (what a drop indicator shows).
 * @param {EmailNode} root @param {string} id @param {string} parentId @param {number} index
 */
export function moveNode(root, id, parentId, index) {
  const node = findNode(root, id);
  const from = parentOf(root, id);
  if (!node || !from) return root;
  // A node cannot go inside itself.
  if (pathTo(node, parentId)) return root;
  let at = index;
  if (from.id === parentId) {
    const current = from.children.findIndex((c) => c.id === id);
    if (current < at) at -= 1;
    if (current === at) return root;
  }
  return insertNodes(removeNode(root, id), parentId, at, [node]);
}

/**
 * Index of a node among its siblings, and their count.
 * @param {EmailNode} root @param {string} id
 */
export function positionOf(root, id) {
  const parent = parentOf(root, id);
  if (!parent) return { parent: null, index: -1, count: 0 };
  return { parent, index: parent.children.findIndex((c) => c.id === id), count: parent.children.length };
}

/* ── Snapshot (the stored project) ───────────────────────────────────────── */

/** Shape version of the stored project (`{ format, root }`). */
export const PROJECT_FORMAT = 1;

/** @param {EmailNode} root */
export function toProject(root) {
  return { format: PROJECT_FORMAT, root: strip(root) };
}

/** @param {EmailNode} node @returns {any} */
function strip(node) {
  /** @type {any} */
  const out = { id: node.id, tag: node.tag };
  if (Object.keys(node.attributes).length) out.attributes = { ...node.attributes };
  if (node.content !== null) out.content = node.content;
  if (node.children.length) out.children = node.children.map(strip);
  return out;
}

/**
 * Reads a stored project back into a tree. Ids are kept when they are valid
 * and unique, replaced otherwise. Throws on anything that is not a project of
 * this format.
 * @param {unknown} project
 * @returns {EmailNode}
 */
export function fromProject(project) {
  const value = /** @type {any} */ (project);
  if (!value || typeof value !== 'object' || value.format !== PROJECT_FORMAT || !value.root) {
    throw new Error('Not a project of this builder');
  }
  const seen = new Set();
  /** @param {any} raw @returns {EmailNode} */
  const read = (raw) => {
    if (!raw || typeof raw !== 'object' || typeof raw.tag !== 'string' || !/^(mjml|mj-[a-z-]+)$/.test(raw.tag)) {
      throw new Error('Invalid element in the project');
    }
    let id = typeof raw.id === 'string' && /^[a-z0-9]{1,40}$/.test(raw.id) ? raw.id : createId();
    if (seen.has(id)) id = createId();
    seen.add(id);
    /** @type {Record<string, string>} */
    const attributes = {};
    for (const [k, v] of Object.entries(raw.attributes || {})) {
      if (/^[a-z][a-z0-9-]*$/i.test(k) && v !== null && v !== undefined) attributes[k] = String(v);
    }
    return createNode(raw.tag, {
      id,
      attributes,
      content: ENDING_TAGS.has(raw.tag) ? String(raw.content ?? '') : null,
      children: ENDING_TAGS.has(raw.tag) ? [] : (Array.isArray(raw.children) ? raw.children : []).map(read),
    });
  };
  const root = read(value.root);
  if (root.tag !== 'mjml' || !findFirst(root, 'mj-body')) throw new Error('The project has no email body');
  return root;
}
