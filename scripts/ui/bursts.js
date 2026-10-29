// ─────────────────────────────────────────────────────────
// AIM: Actor Window - bursts: short particle effects over one element, on the shared effects renderer (ui/vfx.js)
// ─────────────────────────────────────────────────────────

import { box, fade, flash, halt, hasPixi, load, makeKit, mix, paint, parseColor, pixelRatio, random, run, sizeCanvas } from "./vfx.js";

const WHITE = 0xffffff;

/** The spot `at` (0…1 along the element) or the element's centre, still: particles there start from rest. */
const spot = (a, at) => ({ x: a.x + a.w * (at ?? 0.5), y: a.cy, vx: 0, vy: 0 });

/**
 * Each burst: pad (px of canvas around the element), time (s it lasts), token (the colour it takes by default), and
 * build(k) → update(t, dt). `k.a` is the element's box on the canvas {x, y, w, h, cx, cy}; `k.at` is where along it.
 */
const BURSTS = {
  /** HP lost: a flash at the end of the fill, sparks and shards thrown off it. */
  hit: {
    pad: 48, time: 0.9, token: "--hp",
    build(k) {
      const { a, c, hot } = k;
      const p = spot(a, k.at);
      const flare = k.fx({ tex: "star_06", life: 0.28, size: 56, rot: 0, grow: [[0, 1.2], [1, 0.5]], alpha: flash(0.85), color: [[0, hot], [1, c]] });
      const sparks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.3, 0.6], dir: [190, 350], speed: [90, 230], accel: { x: 0, y: 380 }, drag: 1.2,
        align: true, stretch: 0.5, size: [13, 21], alpha: flash(), color: [[0, WHITE], [0.35, hot], [1, c]] });
      const shards = k.fx({ tex: "trace_05", life: [0.45, 0.8], dir: [200, 340], speed: [60, 150], accel: { x: 0, y: 420 }, spin: [-480, 480],
        size: [15, 24], alpha: [[0, 1], [0.7, 0.9], [1, 0]], color: [[0, hot], [1, c]] });
      flare.spawn(1, p);
      sparks.spawn(16, { x: p.x, y: p.y });
      shards.spawn(8, { x: p.x, y: p.y });
      return (t, dt) => { flare.update(dt); sparks.update(dt); shards.update(dt); };
    }
  },

  /** HP regained: green motes rise off the bar, a soft glow and a few glints. */
  heal: {
    pad: 52, time: 1.4, token: "--heal",
    build(k) {
      const { a, c } = k;
      const glow = k.fx({ tex: "circle_05", life: 0.7, size: a.w * 1.15, rot: 0, aspect: 0.32, alpha: flash(0.45), color: c });
      const motes = k.fx({ tex: ["circle_05", "star_04"], life: [0.7, 1.2], at: box(a.x, a.x + a.w, a.y, a.y + a.h), dir: [-100, -80],
        speed: [25, 60], sway: [30, 4], size: [5, 11], alpha: fade(1, 0.15, 0.6), color: [[0, WHITE], [0.4, mix(c, WHITE, 0.4)], [1, c]] });
      const glints = k.fx({ tex: "star_06", life: [0.5, 0.8], at: box(a.x, a.x + a.w, a.y - 14, a.y + a.h), dir: [-95, -85], speed: [8, 20],
        size: [12, 20], rot: 0, alpha: fade(1, 0.4, 0.5), color: [[0, WHITE], [1, c]] });
      glow.spawn(1, spot(a));
      glints.spawn(5);
      return (t, dt) => { glow.update(dt); motes.update(dt, t < 0.45 ? 55 : 0); glints.update(dt); };
    }
  },

  /** Back from 0 HP: a column of light, a flash and motes rising from the card. */
  revive: {
    pad: 60, time: 1.4, token: "--heal",
    build(k) {
      const { a, c, hot } = k;
      const column = k.fx({ tex: "trace_07", life: 1, size: Math.max(40, a.w * 0.3), rot: 0, aspect: 3.2, grow: [[0, 0.6], [0.3, 1], [1, 1.1]],
        alpha: [[0, 0], [0.15, 0.9], [1, 0]], color: [[0, WHITE], [1, c]] });
      const flare = k.fx({ tex: "star_06", life: 0.4, size: 96, rot: 0, grow: [[0, 0.6], [1, 1.2]], alpha: flash(0.85), color: [[0, hot], [1, c]] });
      const motes = k.fx({ tex: ["circle_05", "star_04"], life: [0.8, 1.3], at: box(a.x, a.x + a.w, a.y + a.h * 0.5, a.y + a.h), dir: [-100, -80],
        speed: [40, 90], sway: [24, 3], size: [5, 11], alpha: fade(1, 0.15, 0.6), color: [[0, WHITE], [1, c]] });
      column.spawn(1, spot(a));
      flare.spawn(1, spot(a));
      return (t, dt) => { column.update(dt); flare.update(dt); motes.update(dt, t < 0.6 ? 40 : 0); };
    }
  },

  /** Temporary HP gained: motes close in on the card from a ring around it, a wave and a flash as they arrive. */
  shieldUp: {
    pad: 42, time: 1, token: "--temp",
    build(k) {
      const { a, c } = k;
      const flat = a.h / a.w;
      const motes = k.fx({ tex: ["star_04", "circle_05"], life: [0.45, 0.6], spring: { x: a.cx, y: a.cy, k: 16 }, drag: 3.2,
        at: (rng) => {
          const angle = rng() * 6.283;
          return { x: a.cx + Math.cos(angle) * (a.w / 2 + 34), y: a.cy + Math.sin(angle) * (a.h / 2 + 28), vx: 0, vy: 0 };
        },
        size: [6, 13], alpha: fade(1, 0.2, 0.7), color: [[0, WHITE], [1, c]] });
      const wave = k.fx({ tex: "circle_02", life: 0.6, size: a.w * 1.15, rot: 0, aspect: flat, grow: [[0, 1.25], [1, 0.98]],
        alpha: [[0, 0], [0.35, 0.8], [1, 0]], color: [[0, mix(c, WHITE, 0.4)], [1, c]] });
      const glow = k.fx({ tex: "circle_05", life: 0.5, size: a.w * 1.1, rot: 0, aspect: flat * 1.2, alpha: flash(0.4), color: c });
      motes.spawn(24);
      wave.spawn(1, spot(a));
      let flashed = false;
      return (t, dt) => {
        if (!flashed && t > 0.42) { flashed = true; glow.spawn(1, spot(a)); }
        motes.update(dt);
        wave.update(dt);
        glow.update(dt);
      };
    }
  },

  /** Damage soaked by temporary HP: the band flashes and throws blue shards. */
  absorb: {
    pad: 36, time: 0.7, token: "--temp",
    build(k) {
      const { a, c } = k;
      const glow = k.fx({ tex: "circle_05", life: 0.4, size: a.w * 1.6, rot: 0, aspect: 0.5, alpha: flash(0.8), color: [[0, WHITE], [1, c]] });
      const shards = k.fx({ tex: "trace_05", life: [0.3, 0.5], at: () => ({ x: a.cx, y: a.cy }), speed: [70, 150], drag: 3, align: true,
        stretch: 0.3, size: [11, 18], alpha: flash(), color: [[0, WHITE], [1, c]] });
      glow.spawn(1, spot(a));
      shards.spawn(10);
      return (t, dt) => { glow.update(dt); shards.update(dt); };
    }
  },

  /** The last temporary HP lost: the shield shatters, a flash, a ring and shards flying everywhere. */
  shieldBreak: {
    pad: 72, time: 1.1, token: "--temp",
    build(k) {
      const { a, c, hot } = k;
      const flare = k.fx({ tex: "star_06", life: 0.3, size: 88, rot: 0, grow: [[0, 1.1], [1, 0.5]], alpha: flash(0.85), color: [[0, hot], [1, c]] });
      const ring = k.fx({ tex: "circle_03", life: 0.55, size: 40, rot: 0, grow: [[0, 0.5], [1, 4]], alpha: flash(0.9), color: [[0, WHITE], [1, c]] });
      const shards = k.fx({ tex: ["trace_05", "star_04"], life: [0.5, 0.9], at: () => ({ x: a.cx, y: a.cy }), speed: [120, 280], accel: { x: 0, y: 260 },
        drag: 1, spin: [-540, 540], size: [14, 26], alpha: [[0, 1], [0.7, 0.8], [1, 0]], color: [[0, WHITE], [0.3, hot], [1, c]] });
      flare.spawn(1, spot(a));
      ring.spawn(1, spot(a));
      shards.spawn(26);
      return (t, dt) => { flare.update(dt); ring.update(dt); shards.update(dt); };
    }
  },

  /** A death save success: green motes rise and glint. */
  deathSuccess: {
    pad: 38, time: 1, token: "--heal",
    build(k) {
      const { a, c } = k;
      const glow = k.fx({ tex: "circle_05", life: 0.6, size: a.w * 1.1, rot: 0, aspect: Math.max(0.3, a.h / a.w), alpha: flash(0.5), color: c });
      const motes = k.fx({ tex: ["circle_05", "star_04"], life: [0.6, 1], at: box(a.x, a.x + a.w, a.y, a.y + a.h), dir: [-110, -70], speed: [30, 70],
        size: [8, 15], alpha: fade(1, 0.15, 0.6), color: [[0, WHITE], [1, c]] });
      const glints = k.fx({ tex: "star_06", life: [0.4, 0.7], at: box(a.x, a.x + a.w, a.y, a.y + a.h), size: [14, 22], rot: 0, alpha: fade(1, 0.4, 0.5), color: [[0, WHITE], [1, c]] });
      glow.spawn(1, spot(a));
      motes.spawn(16);
      glints.spawn(5);
      return (t, dt) => { glow.update(dt); motes.update(dt); glints.update(dt); };
    }
  },

  /** A death save failure: red sparks thrown off the block. */
  deathFail: {
    pad: 38, time: 0.8, token: "--hp",
    build(k) {
      const { a, c, hot } = k;
      const flare = k.fx({ tex: "star_06", life: 0.25, size: 48, rot: 0, alpha: flash(0.85), color: [[0, hot], [1, c]] });
      const sparks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.3, 0.55], at: () => ({ x: a.cx, y: a.cy }), speed: [90, 200], accel: { x: 0, y: 300 },
        drag: 1.4, align: true, stretch: 0.5, size: [13, 21], alpha: flash(), color: [[0, WHITE], [0.35, hot], [1, c]] });
      flare.spawn(1, spot(a));
      sparks.spawn(14);
      return (t, dt) => { flare.update(dt); sparks.update(dt); };
    }
  },

  /** Inspiration turned on: a golden star flares and throws stars. */
  inspired: {
    pad: 50, time: 1.1, token: "--warn",
    build(k) {
      const { a, c, hot } = k;
      const flare = k.fx({ tex: "star_08", life: 0.45, size: 72, rot: 0, spin: 90, grow: [[0, 0.6], [1, 1.2]], alpha: flash(), color: [[0, WHITE], [1, hot]] });
      const ring = k.fx({ tex: "circle_02", life: 0.5, size: 30, rot: 0, grow: [[0, 0.5], [1, 3.4]], alpha: flash(0.8), color: [[0, WHITE], [1, c]] });
      const stars = k.fx({ tex: ["star_06", "star_04"], life: [0.6, 1], at: () => ({ x: a.cx, y: a.cy }), speed: [60, 150], drag: 2.6, spin: [-200, 200],
        size: [9, 18], alpha: [[0, 1], [0.6, 0.9], [1, 0]], color: [[0, WHITE], [0.4, hot], [1, c]] });
      flare.spawn(1, spot(a));
      ring.spawn(1, spot(a));
      stars.spawn(18);
      return (t, dt) => { flare.update(dt); ring.update(dt); stars.update(dt); };
    }
  },

  /** A spell slot gem spent: a flash, a ring and sparks in the school's colour. */
  gem: {
    pad: 36, time: 0.8, token: "--arcane",
    build(k) {
      const { a, c, hot } = k;
      const flare = k.fx({ tex: "star_08", life: 0.35, size: 50, rot: 0, grow: [[0, 1.2], [1, 0.6]], alpha: flash(), color: [[0, WHITE], [1, c]] });
      const ring = k.fx({ tex: "circle_02", life: 0.45, size: 20, rot: 0, grow: [[0, 0.4], [1, 3]], alpha: flash(0.9), color: [[0, WHITE], [1, c]] });
      const sparks = k.fx({ tex: "trace_06", life: [0.3, 0.55], at: () => ({ x: a.cx, y: a.cy }), speed: [70, 160], drag: 2.5, align: true, stretch: 0.4,
        size: [10, 18], alpha: flash(), color: [[0, WHITE], [0.4, hot], [1, c]] });
      flare.spawn(1, spot(a));
      ring.spawn(1, spot(a));
      sparks.spawn(12);
      return (t, dt) => { flare.update(dt); ring.update(dt); sparks.update(dt); };
    }
  },

  /** A hit die spent: a short flash and a few sparks. */
  die: {
    pad: 30, time: 0.6, token: "--accent",
    build(k) {
      const { a, c } = k;
      const flare = k.fx({ tex: "star_08", life: 0.3, size: 38, rot: 0, alpha: flash(), color: [[0, WHITE], [1, c]] });
      const sparks = k.fx({ tex: "trace_06", life: [0.25, 0.45], at: () => ({ x: a.cx, y: a.cy }), speed: [60, 120], drag: 2.5, align: true, stretch: 0.4,
        size: [10, 16], alpha: flash(), color: [[0, WHITE], [1, c]] });
      flare.spawn(1, spot(a));
      sparks.spawn(7);
      return (t, dt) => { flare.update(dt); sparks.update(dt); };
    }
  },

  /** A coin's count changed: golden glints around it. */
  coin: {
    pad: 22, time: 0.9, token: "--warn",
    build(k) {
      const { a, c, hot } = k;
      const glow = k.fx({ tex: "star_08", life: 0.35, size: Math.max(a.w, a.h) * 1.8, rot: 0, alpha: flash(0.8), color: [[0, WHITE], [1, hot]] });
      const glints = k.fx({ tex: "star_06", life: [0.45, 0.7], at: box(a.x - 4, a.x + a.w + 4, a.y - 4, a.y + a.h + 4), size: [12, 18], rot: 0,
        alpha: fade(1, 0.4, 0.5), color: [[0, WHITE], [1, c]] });
      glow.spawn(1, spot(a));
      let given = 0;
      return (t, dt) => {
        // Four glints, one after another.
        while (given < 4 && t > given * 0.12) { glints.spawn(1); given++; }
        glow.update(dt);
        glints.update(dt);
      };
    }
  },

  /** A long rest: stars come out over the window at night, then dawn throws warm rays up from below. */
  night: {
    pad: 0, time: 1.55, token: "--warn",
    build(k) {
      const { a } = k;
      const count = Math.min(60, Math.round((a.w * a.h) / 2600));
      const stars = k.fx({ tex: ["star_06", "star_05", "star_06"], add: "always", life: [0.8, 1.2], at: box(a.x, a.x + a.w, a.y, a.y + a.h * 0.7),
        size: [9, 20], rot: 0, alpha: [[0, 0], [0.3, 1], [0.55, 0.55], [0.75, 1], [1, 0]], color: 0xdfe6ff });
      const rays = k.fx({ tex: "trace_07", life: [0.8, 1], at: box(a.x, a.x + a.w, a.y + a.h * 0.75, a.y + a.h), rot: [-32, -18],
        size: Math.max(60, a.w * 0.22), aspect: 4, alpha: fade(0.35, 0.3, 0.6), color: 0xffc58a });
      const dawn = k.fx({ tex: "circle_05", life: 0.9, size: a.w * 1.3, rot: 0, aspect: 0.4, alpha: fade(0.5, 0.3, 0.5), color: 0xffb070 });
      let rose = false;
      return (t, dt) => {
        if (!rose && t > 0.72) {
          rose = true;
          rays.spawn(5);
          dawn.spawn(1, { x: a.cx, y: a.y + a.h, vx: 0, vy: 0 });
        }
        stars.update(dt, t < 0.5 ? count * 2 : 0);
        rays.update(dt);
        dawn.update(dt);
      };
    }
  }
};

/** Starts loading textures and filters early, so the first burst plays at once. */
export const preloadBursts = () => (hasPixi() ? load().catch(() => null) : null);

/**
 * Plays a burst over an element of a window. Bursts are particles: «Все» only; «Сдержанно» keeps the pulses and numbers.
 * Its canvas sits on the window, ignores the pointer and goes once the burst is over.
 * @param {HTMLElement} root    the window element
 * @param {HTMLElement} anchor  the element it plays over
 * @param {string} kind         a key of BURSTS
 * @param {{token?: string, at?: number}} [options]  the colour token instead of the burst's own; where along it (0…1)
 */
export function playBurst(root, anchor, kind, { token, at } = {}) {
  const def = BURSTS[kind];
  if (!def || !root || !anchor || root.dataset.motion !== "full" || !hasPixi()) return;
  const doc = root.ownerDocument;
  const frame = root.getBoundingClientRect();
  const el = anchor.getBoundingClientRect();
  if (!el.width && !el.height) return;
  const { pad } = def;
  const size = { w: Math.round(el.width + pad * 2), h: Math.round(el.height + pad * 2), ratio: pixelRatio(doc) };
  const canvas = doc.createElement("canvas");
  canvas.className = "aim-burst";
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { left: `${el.left - frame.left - pad}px`, top: `${el.top - frame.top - pad}px`, width: `${size.w}px`, height: `${size.h}px` });
  const ctx = sizeCanvas(canvas, size);
  root.append(canvas);
  const style = getComputedStyle(anchor);
  const colour = parseColor(style.getPropertyValue(token ?? def.token), 0xc8a85c);
  const light = root.closest("[data-theme]")?.dataset.theme === "parchment";
  load().then((assets) => {
    if (!canvas.isConnected) return;
    const stage = new PIXI.Container();
    stage.filterArea = new PIXI.Rectangle(0, 0, size.w, size.h);
    const world = stage.addChild(new PIXI.Container());
    // Light glows on the dark theme; on parchment it would wash the paper out.
    const Bloom = !light && assets.filters?.AdvancedBloomFilter;
    const bloom = Bloom ? new Bloom({ threshold: 0.45, bloomScale: 0.9, brightness: 1, blur: 5, quality: 4 }) : null;
    if (bloom) { bloom.resolution = size.ratio; stage.filters = [bloom]; }
    const kit = makeKit(world, assets, { w: size.w, h: size.h, colour, rng: random(Date.now()), light });
    kit.a = { x: pad, y: pad, w: el.width, h: el.height, cx: pad + el.width / 2, cy: pad + el.height / 2 };
    kit.at = at;
    const update = def.build(kit);
    let t = 0;
    const entry = {
      canvas, ctx, size, stage,
      update(dt) {
        t += dt;
        update(t, dt);
        return t < def.time;
      },
      stop() {
        halt(entry);
        stage.destroy({ children: true });
        bloom?.destroy();
        canvas.remove();
      }
    };
    paint(entry);
    run(entry);
  }).catch((error) => {
    console.warn(`AIM | burst «${kind}» failed`, error);
    canvas.remove();
  });
}
