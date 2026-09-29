// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Meter motion across re-renders
// ─────────────────────────────────────────────────────────

// Every render replaces the window's DOM, so a CSS transition on a meter's
// width never plays: the new element is born at its final width. The widths
// are read before the render and the change is played on the new elements.

const METER_DURATION_MS = 350;

/**
 * Width percentages of the meters in a rendered window, keyed by `data-meter`.
 * Read from the inline style, so no layout is forced.
 * @param {ParentNode|null|undefined} root
 * @returns {Map<string, number>}
 */
export function readMeterWidths(root) {
  const widths = new Map();
  for (const fill of root?.querySelectorAll?.("[data-meter]") ?? []) {
    const pct = parseFloat(fill.style.width);
    if (Number.isFinite(pct)) widths.set(fill.dataset.meter, pct);
  }
  return widths;
}

/**
 * Should the window keep still? The OS reduced-motion preference and
 * Foundry's low performance mode (a `performance-low` class on the body) both say so.
 * @param {Window|object} [view]
 * @returns {boolean}
 */
export function shouldReduceMotion(view = globalThis) {
  if (view?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return true;
  return Boolean(view?.document?.body?.classList?.contains("performance-low"));
}

/**
 * Slide every meter whose width changed since the previous render.
 * @param {ParentNode} root                 the freshly rendered window
 * @param {Map<string, number>} before      widths read before the render
 * @param {object} [options]
 * @param {boolean} [options.reduce]        skip all motion
 */
export function animateMeterChanges(root, before, { reduce = shouldReduceMotion(root?.ownerDocument?.defaultView) } = {}) {
  if (!before?.size || reduce) return;
  for (const fill of root?.querySelectorAll?.("[data-meter]") ?? []) {
    const from = before.get(fill.dataset.meter);
    const to = parseFloat(fill.style.width);
    if (from === undefined || !Number.isFinite(to) || from === to) continue;
    fill.animate?.([{ width: `${from}%` }, { width: `${to}%` }], { duration: METER_DURATION_MS, easing: "ease-out" });
  }
}
