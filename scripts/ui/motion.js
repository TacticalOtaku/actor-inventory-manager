// ─────────────────────────────────────────────────────────
// AIM: Actor Window - motion helpers (Web Animations, no library)
// ─────────────────────────────────────────────────────────

export const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * FLIP: measure the matching elements, run the change, then play each one from its old box to its new one.
 * Elements that appear fade and scale in from 92%.
 * @param {HTMLElement} container
 * @param {string} selector
 * @param {Function} mutate
 */
export function glide(container, selector, mutate) {
  const before = new Map([...container.querySelectorAll(selector)].map((el) => [el, el.getBoundingClientRect()]));
  mutate();
  for (const el of container.querySelectorAll(selector)) {
    const from = before.get(el);
    const to = el.getBoundingClientRect();
    if (!to.width && !to.height) continue;
    if (!from || (!from.width && !from.height)) {
      el.animate([{ opacity: 0, transform: "scale(0.92)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: SETTLE });
      continue;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    el.animate(
      [{ transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "top left", transform: "none" }],
      { duration: 420, easing: SETTLE }
    );
  }
}
