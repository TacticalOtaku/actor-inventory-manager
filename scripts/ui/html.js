const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

/**
 * Escape text for interpolation into an HTML string (dialog content).
 * Item names, slot ids and imported JSON are user-controlled.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => HTML_ESCAPES[character]);
}

/**
 * Quote a path for a CSS `url("...")` value.
 * @param {string} path
 * @returns {string}
 */
export function cssUrl(path) {
  return `url("${String(path ?? "").replace(/["\\\n\r]/g, character => `\\${character === "\n" ? "a " : character === "\r" ? "d " : character}`)}")`;
}

/**
 * Is a slot icon an image path rather than Font Awesome classes?
 * @param {string} icon
 * @returns {boolean}
 */
export function isImagePath(icon) {
  const value = String(icon ?? "").trim();
  return Boolean(value) && (value.includes("/") || /\.(png|webp|svg|jpe?g|gif|avif)$/i.test(value));
}
