// ─────────────────────────────────────────────────────────
// AIM: Actor Window - a redrawn part patched in place: only the nodes that differ change, so the browser restyles and
// lays out only them, not the ten thousand nodes of a full inventory (#9)
// ─────────────────────────────────────────────────────────

// Rows and cards carry one of these; a keyed node keeps its element when its siblings move.
const keyOf = (node) => (node.nodeType === Node.ELEMENT_NODE && (node.dataset.key || node.dataset.itemId || node.id)) || null;

function syncAttributes(from, to) {
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const { name, value } of to.attributes) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

// A field's attributes are its defaults; what it shows is a property. The focused field keeps what is being typed.
function syncField(from, to) {
  if (from === from.ownerDocument.activeElement) return;
  if ("checked" in from && from.checked !== to.checked) from.checked = to.checked;
  if ("value" in from && from.type !== "file" && from.value !== to.value) from.value = to.value;
}

function morphChildren(from, to) {
  const keyed = new Map();
  for (const child of from.childNodes) {
    const key = keyOf(child);
    if (key) keyed.has(key) ? keyed.get(key).push(child) : keyed.set(key, [child]);
  }
  let cursor = from.firstChild;
  for (const next of [...to.childNodes]) {
    const key = keyOf(next);
    const match = key ? keyed.get(key)?.shift() : cursor && !keyOf(cursor) && cursor.nodeName === next.nodeName ? cursor : null;
    if (!match) {
      from.insertBefore(next, cursor);
      continue;
    }
    if (match === cursor) cursor = cursor.nextSibling;
    else from.insertBefore(match, cursor);
    morph(match, next);
  }
  while (cursor) {
    const rest = cursor.nextSibling;
    cursor.remove();
    cursor = rest;
  }
}

/**
 * Makes `from` (in the document) match `to` (freshly rendered, detached), keeping every element that stays. A custom
 * element (the biography's editor) builds its own content and is swapped whole.
 * @param {Node} from
 * @param {Node} to
 */
export function morph(from, to) {
  if (from.nodeType !== Node.ELEMENT_NODE) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return;
  }
  if (from.isEqualNode(to)) return;
  if (from.nodeName !== to.nodeName) return from.replaceWith(to);
  if (from.localName.includes("-")) {
    // An editor being typed in keeps its element: a new one would drop the text not yet saved.
    if (from.hasAttribute("open") || from.contains(from.ownerDocument.activeElement)) return;
    return from.replaceWith(to);
  }
  syncAttributes(from, to);
  morphChildren(from, to);
  syncField(from, to);
}
