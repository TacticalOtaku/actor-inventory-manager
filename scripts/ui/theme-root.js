// ─────────────────────────────────────────────────────────
// AIM: the theme attributes every module window root carries
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { effectiveMotion, normalizeAccent, resolveTheme } from "../core/actor-window.js";

/** Caps the OS and Foundry put on motion (#9). */
export function readMotionCaps() {
  return {
    reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    performanceLow: document.body.classList.contains("performance-low")
  };
}

/** Foundry resolves its application colour scheme (or the browser's) into a body class. */
export const schemeIsLight = () => document.body.classList.contains("theme-light");

/**
 * Theme, accent, density, motion and fonts as data attributes on a window root carrying `.aim-root`.
 * @param {HTMLElement} el
 * @param {{fonts?: boolean}} [options]  fonts as loaded with the page (the setting applies after a reload)
 */
export function stampTheme(el, { fonts } = {}) {
  if (!el) return;
  const get = (key) => game.settings.get(MODULE_ID, key);
  el.dataset.theme = resolveTheme(get("windowTheme"), schemeIsLight());
  el.dataset.accent = normalizeAccent(get("windowAccent"));
  el.dataset.density = get("windowDensity");
  el.dataset.motion = effectiveMotion(get("motionLevel"), readMotionCaps());
  el.dataset.fonts = (fonts ?? get("useWebFonts")) ? "web" : "system";
}
