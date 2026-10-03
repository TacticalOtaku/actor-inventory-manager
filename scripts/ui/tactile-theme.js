// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Tactile theme on a window root
// ─────────────────────────────────────────────────────────
// Tactile tokens are scoped to `.tc-root`: the theme is a `data-theme` attribute and the accent
// hue/chroma are custom properties on the window element, never on :root.

import { MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { resolveAccent } from "../tactile/palette.js";
import { resolveThemeContext } from "./inventory-context.js";

/**
 * Resolved theme for this client.
 * @returns {"light"|"dark"}
 */
export function currentTheme() {
  const prefersLight = Boolean(globalThis.matchMedia?.("(prefers-color-scheme: light)")?.matches);
  const setting = game.settings.get(MODULE_ID, "theme") ?? "dark";
  return resolveThemeContext(setting, prefersLight, key => game.i18n.localize(key)).theme;
}

/**
 * Stamp the theme and the accent on a Tactile window root.
 * @param {HTMLElement|null} element
 * @param {string} [theme]
 */
export function applyTactileTheme(element, theme = currentTheme()) {
  if (!element) return;
  element.setAttribute("data-theme", theme);
  const { h, c } = resolveAccent(game.settings.get(MODULE_ID, "accent"));
  element.style.setProperty("--tc-acc-h", String(h));
  element.style.setProperty("--tc-acc-c", String(c));
}

/**
 * Stamp the Tactile theme and accent on an editor window. A theme swap suppresses
 * transitions for two frames (as the inventory window does), so every token lands at once.
 * @param {HTMLElement|null} element
 */
export function stampEditorTheme(element) {
  if (!element) return;
  const theme = currentTheme();
  const changed = element.hasAttribute("data-theme") && element.getAttribute("data-theme") !== theme;
  if (changed) element.classList.add("aim-no-transitions");
  applyTactileTheme(element, theme);
  if (!changed) return;
  void element.offsetHeight; // flush the suppressed styles before re-enabling
  requestAnimationFrame(() => requestAnimationFrame(() => element.classList.remove("aim-no-transitions")));
}

/**
 * Re-stamp the theme whenever the theme or accent setting changes (they fire REFRESH_HOOK).
 * @param {foundry.applications.api.ApplicationV2} app
 * @returns {number} hook id, for Hooks.off
 */
export function watchEditorTheme(app) {
  return Hooks.on(REFRESH_HOOK, () => {
    if (app.rendered) stampEditorTheme(app.element);
  });
}
