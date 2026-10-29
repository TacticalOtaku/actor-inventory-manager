const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

/** A localized string, formatted when it has data. */
export const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

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
 * Drop the `<secret-block>` wrappers enrichHTML puts around each secret: the element draws a «Reveal» button that
 * only document sheets wire up, so in our window it would do nothing. The secret section itself stays.
 * @param {string} html  enriched HTML
 */
export function unwrapSecrets(html) {
  return String(html ?? "").replace(/<\/?secret-block\b[^>]*>/g, "");
}
