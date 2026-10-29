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

/** Boxes of the matching elements by their `data-key`, to glide them after a redraw replaces them. */
export function measure(container, selector) {
  return new Map([...container.querySelectorAll(selector)].map((el) => [el.dataset.key, el.getBoundingClientRect()]));
}

/** After a redraw, each element with a key measured before glides from its old box; new ones fade in. */
export function glideFrom(container, selector, before) {
  for (const el of container.querySelectorAll(selector)) {
    const from = before.get(el.dataset.key);
    const to = el.getBoundingClientRect();
    if (!to.width && !to.height) continue;
    if (!from) {
      el.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: SETTLE });
      continue;
    }
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 420, easing: SETTLE });
  }
}

/** Entries come in one after another, 18 ms apart; a cascade stops at 24 (#9). */
export function cascade(container, selector) {
  const items = [...container.querySelectorAll(selector)].filter((el) => el.offsetParent).slice(0, 24);
  items.forEach((el, i) => el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
    { duration: 260, delay: i * 18, easing: SETTLE, fill: "backwards" }));
}

/** Cards and buttons that light up under the cursor; presses on them and on the buttons send a ripple. */
const SPOT = '.aim-ability, .aim-rest-btn, .aim-stat, [data-panel="overview"] .aim-card';
const PRESS = `${SPOT}, .aim-btn, .aim-ibtn`;

/**
 * The cursor light and the press ripple, delegated once on the window: «Все» and «Сдержанно», none with motion off.
 * The light is a glow moved by a transform and the ripple a scaled circle, so both stay on the compositor (#9).
 * @param {HTMLElement} root  the window element
 */
export function bindPointerFx(root) {
  root.addEventListener("pointermove", (event) => {
    const host = root.dataset.motion !== "off" && event.target.closest?.(SPOT);
    if (!host) return;
    const box = host.getBoundingClientRect();
    host.classList.add("aim-spot");
    host.style.setProperty("--mx", `${event.clientX - box.left}px`);
    host.style.setProperty("--my", `${event.clientY - box.top}px`);
  }, { passive: true });
  root.addEventListener("pointerdown", (event) => {
    const host = root.dataset.motion !== "off" && event.button === 0 && event.target.closest?.(PRESS);
    if (!host || host.disabled) return;
    const box = host.getBoundingClientRect();
    const size = Math.max(box.width, box.height) * 2;
    const ripple = root.ownerDocument.createElement("span");
    ripple.className = "aim-ripple";
    Object.assign(ripple.style, { width: `${size}px`, height: `${size}px`, left: `${event.clientX - box.left - size / 2}px`, top: `${event.clientY - box.top - size / 2}px` });
    host.classList.add("aim-ripple-host");
    host.append(ripple);
    ripple.animate([{ transform: "scale(0)", opacity: 0.22 }, { transform: "scale(1)", opacity: 0 }], { duration: 560, easing: SETTLE })
      .finished.finally(() => ripple.remove());
  });
}
