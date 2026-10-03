// ─────────────────────────────────────────────────────────
// Tactile motion: the design system's eases and gestures on a private GSAP instance.
// ─────────────────────────────────────────────────────────

import { gsap } from "../vendor/gsap/index.js";
import { CustomEase } from "../vendor/gsap/CustomEase.js";
import { Flip } from "../vendor/gsap/Flip.js";

// The vendored plugins do not self-register into a global: hand them this private core explicitly.
gsap.registerPlugin(CustomEase, Flip);
CustomEase.create("tactile", "0.32, 0.72, 0, 1");
// Settle: a 4 % overshoot that comes to rest — the material "lands".
CustomEase.create("settle", "M0,0 C0.18,0.9 0.3,1.04 0.52,1.02 0.7,1 0.84,1 1,1");

export const EASE = "tactile";
export const SETTLE = "settle";
export const DURATION = Object.freeze({ micro: 0.16, short: 0.24, base: 0.38, long: 0.7 });
const SAFETY_MS = 2200;
const FLIP_SELECTOR = "[data-flip-id]";

/** Window entrance: the shell settles, its zones follow 40 ms apart, the big number counts last. */
export function openWindow(root, { reduce }) {
  if (!root) return;
  if (reduce) {
    gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, clearProps: "opacity,visibility" });
    return;
  }
  const parts = root.querySelectorAll("[data-part]");
  const hp = root.querySelector('[data-count="hp"]');
  const to = Number(hp?.textContent) || 0;
  const tl = gsap.timeline();
  tl.fromTo(root, { autoAlpha: 0, scale: 0.965, y: 10 },
    { autoAlpha: 1, scale: 1, y: 0, duration: DURATION.long, ease: SETTLE, clearProps: "opacity,visibility,transform" });
  if (parts.length) {
    tl.fromTo(parts, { autoAlpha: 0, y: 8 },
      { autoAlpha: 1, y: 0, duration: 0.45, ease: EASE, stagger: 0.04, clearProps: "opacity,visibility,transform" }, 0.12);
  }
  if (hp) {
    const o = { v: 0 };
    tl.to(o, { v: to, duration: 0.9, ease: EASE, onUpdate: () => { hp.textContent = String(Math.round(o.v)); } }, 0.4);
  }
  // Background tabs throttle frames: finish anyway so the window is never left translucent.
  setTimeout(() => { if (tl.progress() < 1) tl.progress(1); }, SAFETY_MS);
}

/** Count a number from its previous value to the new one. */
export function countTo(el, from, to, { reduce }) {
  if (!el) return;
  if (reduce || from === to || !Number.isFinite(from) || !Number.isFinite(to)) { el.textContent = String(to); return; }
  el.textContent = String(from);
  const o = { v: from };
  gsap.to(o, { v: to, duration: DURATION.long, ease: EASE, onUpdate: () => { el.textContent = String(Math.round(o.v)); } });
}

/** Something landed here: a short settle from slightly smaller. */
export function pop(el, { reduce }) {
  if (!el || reduce) return;
  gsap.fromTo(el, { scale: 0.86 }, { scale: 1, duration: 0.6, ease: SETTLE, clearProps: "transform" });
}

/** A rule said no: a small horizontal shake. */
export function refuse(el, { reduce }) {
  if (!el || reduce) return;
  gsap.fromTo(el, { x: -4 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.3)", clearProps: "transform" });
}

/** A drawer arrives from the rail side. */
export function slideIn(el, { reduce }) {
  if (!el) return;
  if (reduce) { gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15, clearProps: "opacity,visibility" }); return; }
  gsap.fromTo(el, { autoAlpha: 0, x: 18 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: SETTLE, clearProps: "opacity,visibility,transform" });
}

/** Record where list rows are before a re-render replaces them. */
export function captureFlip(root) {
  const targets = root?.querySelectorAll?.(FLIP_SELECTOR);
  return targets?.length ? Flip.getState(targets) : null;
}

/**
 * Move the new rows from where the old ones were. Old and new elements are paired by their data-flip-id.
 * Pass the freshly rendered scope as `root`: without it Flip re-measures the elements recorded in `state`,
 * which a re-render has already detached, so nothing would move.
 */
export function playFlip(state, { reduce, root } = {}) {
  if (!state || reduce) return;
  const targets = root ? root.querySelectorAll?.(FLIP_SELECTOR) : undefined;
  if (root && !targets?.length) return;
  Flip.from(state, {
    targets, duration: DURATION.base, ease: EASE, nested: true, prune: true,
    onEnter: els => gsap.fromTo(els, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: EASE, clearProps: "opacity,visibility,transform" })
  });
}

/** Buttons sink into the material on press and spring back. One delegated listener per element. */
export function bindPress(root, isReduced) {
  root.addEventListener("pointerdown", event => {
    const button = event.target.closest?.("button, .tc-press");
    if (!button || button.disabled || isReduced()) return;
    gsap.to(button, { scale: 0.96, y: 1, duration: 0.12, ease: "power2.out" });
    const release = () => {
      gsap.to(button, { scale: 1, y: 0, duration: 0.45, ease: SETTLE, clearProps: "transform" });
      button.removeEventListener("pointerup", release);
      button.removeEventListener("pointerleave", release);
      button.removeEventListener("pointercancel", release);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    // Touch scrolling cancels the pointer without an up or leave: release then too.
    button.addEventListener("pointercancel", release);
  });
}
