// @ts-check
/**
 * MORPH — updates the canvas DOM to a newly compiled email in place.
 *
 * Replacing the whole page at every change would reload the images (the
 * email jumps while they come back), lose the scroll position and the caret
 * of a text being typed. Nodes are compared position by position instead:
 * same kind of node → its attributes and children are updated, otherwise it
 * is replaced. An unchanged image keeps its element, so it never reloads.
 *
 * `skip(element)`: an element left exactly as it is, children included (the
 * text being edited: the browser owns it until the edit ends).
 */

/**
 * @param {Element} from @param {Element} to
 */
export function syncAttributes(from, to) {
  for (const attribute of [...from.attributes]) {
    if (!to.hasAttribute(attribute.name)) from.removeAttribute(attribute.name);
  }
  for (const attribute of [...to.attributes]) {
    if (from.getAttribute(attribute.name) !== attribute.value) from.setAttribute(attribute.name, attribute.value);
  }
}

/**
 * @param {Node} from @param {Node} to
 */
function sameKind(from, to) {
  if (from.nodeType !== to.nodeType) return false;
  if (from.nodeType !== 1) return true;
  return /** @type {Element} */ (from).tagName === /** @type {Element} */ (to).tagName;
}

/**
 * Makes `from`'s children match `to`'s.
 * @param {Node} from @param {Node} to @param {(element: Element) => boolean} [skip]
 */
export function morphChildren(from, to, skip = () => false) {
  const document = /** @type {Document} */ (from.ownerDocument || from);
  const targets = [...to.childNodes];
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const current = from.childNodes[i];
    if (!current) {
      from.appendChild(document.importNode(target, true));
    } else if (!sameKind(current, target)) {
      from.replaceChild(document.importNode(target, true), current);
    } else if (current.nodeType === 1) {
      const element = /** @type {Element} */ (current);
      if (skip(element)) continue;
      syncAttributes(element, /** @type {Element} */ (target));
      morphChildren(element, target, skip);
    } else if (current.nodeValue !== target.nodeValue) {
      current.nodeValue = target.nodeValue;
    }
  }
  while (from.childNodes.length > targets.length) {
    /** @type {ChildNode} */ (from.lastChild).remove();
  }
}
