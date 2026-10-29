// ─────────────────────────────────────────────────────────
// AIM: Actor Window - visual effects: sprite particles and pixi-filters on one shared PIXI renderer, copied into
// small 2D canvases (damage type scenes, the window's bursts)
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";

const VFX = `modules/${MODULE_ID}/assets/vfx`;
const FILTERS = `modules/${MODULE_ID}/scripts/vendor/pixi-filters.js`;
const TEXTURES = [
  "circle_02", "circle_03", "circle_05", "dirt_01", "dirt_02", "fire_01", "flame_05", "flame_06", "light_01",
  "light_02", "light_03", "magic_01", "magic_02", "magic_03", "magic_05", "muzzle_01", "muzzle_02", "muzzle_03",
  "muzzle_04", "muzzle_05", "scorch_02", "scratch_01", "slash_01", "slash_03", "smoke_07", "smoke_08", "smoke_09",
  "spark_01", "spark_02", "spark_05", "spark_06", "spark_07", "star_04", "star_05", "star_06", "star_08", "star_09",
  "trace_05", "trace_06", "trace_07", "twirl_01", "twirl_02", "twirl_03"
];
export const STEP = 1 / 60;
export const RAD = Math.PI / 180;

// ── colours ──────────────────────────────────────────────

export const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
export const hex = ([r, g, b]) => (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
export const mix = (a, b, k) => hex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * k));

/** Any CSS colour (tokens may be `color-mix` or oklab) as 0xRRGGBB, read back from one painted pixel. */
let probe;
export function parseColor(value, fallback = 0xc8a85c) {
  const text = String(value ?? "").trim();
  const m = /^#([\da-f]{6})$/i.exec(text);
  if (m) return parseInt(m[1], 16);
  if (!text) return fallback;
  probe ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "#000";
  probe.fillStyle = text;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return a ? hex([r, g, b]) : fallback;
}

/** Dark type colours (dnd5e's bludgeoning is navy) are lifted until they glow on the dark stage. */
export function lift(c) {
  const [r, g, b] = rgb(c).map((v) => v / 255);
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma >= 0.42 ? c : mix(c, 0xffffff, Math.min(0.7, 0.64 - luma));
}

// ── curves and chance ────────────────────────────────────

/** A number, or keys [[t, v], …] over a particle's life (0…1); colours mix channel by channel. */
function keyed(keys, k, between) {
  if (typeof keys === "number") return keys;
  let i = 1;
  while (i < keys.length - 1 && keys[i][0] < k) i++;
  const [t0, v0] = keys[i - 1];
  const [t1, v1] = keys[i];
  return between(v0, v1, Math.min(1, Math.max(0, (k - t0) / (t1 - t0 || 1))));
}
const curve = (keys, k) => keyed(keys, k, (a, b, f) => a + (b - a) * f);
const tint = (keys, k) => keyed(keys, k, mix);

/** Seeded, so a still frame comes out the same every time. */
export function random(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (r) => (Array.isArray(r) ? r[0] + (r[1] - r[0]) * next() : r ?? 0);
  next.pick = (list) => (Array.isArray(list) ? list[Math.floor(next() * list.length)] : list);
  return next;
}

// ── particles ────────────────────────────────────────────

/**
 * One kind of particle. Options: tex (name or names), add (additive, the default), life [s], at(rng) → {x, y, vx?, vy?},
 * dir [deg] and speed [px/s], accel {x, y}, drag, spring {x, y, k} (pulls toward a point: circles at speed r·√k),
 * sway [amp, freq], size [px] with grow (curve), aspect (height to width), rot [deg] and spin [deg/s], align (turns the
 * texture's long side along its motion) with stretch, alpha and color (curves).
 */
export class Particles {
  constructor(layer, kit, o) {
    Object.assign(this, { layer, kit, o, live: [], free: [], carry: 0 });
  }

  spawn(n = 1, at) {
    const { o, kit } = this;
    const rng = kit.rng;
    for (let i = 0; i < n; i++) {
      const sprite = this.free.pop() ?? this.layer.addChild(new PIXI.Sprite());
      sprite.texture = kit.tex(rng.pick(o.tex));
      sprite.anchor.set(0.5);
      // On parchment light would vanish into the paper: particles lay paint on it, unless they insist on light.
      sprite.blendMode = o.add === false || (kit.light && o.add !== "always") ? PIXI.BLEND_MODES.NORMAL : PIXI.BLEND_MODES.ADD;
      sprite.visible = true;
      const p = { ...(at ?? o.at?.(rng, i, n) ?? { x: kit.cx, y: kit.cy }) };
      if (p.vx === undefined) {
        const dir = rng.range(o.dir ?? [0, 360]) * RAD;
        const speed = rng.range(o.speed ?? 0);
        p.vx = Math.cos(dir) * speed;
        p.vy = Math.sin(dir) * speed;
      }
      Object.assign(p, {
        sprite, age: 0, life: rng.range(o.life ?? 1), px: rng.range(o.size ?? 32) / sprite.texture.width,
        rot: rng.range(o.rot ?? [0, 360]) * RAD, spin: rng.range(o.spin ?? 0) * RAD, phase: rng() * 6.283
      });
      this.live.push(p);
      this.draw(p);
    }
  }

  /** Emits at `rate` particles a second, then moves and redraws every live one. */
  update(dt, rate = 0) {
    this.carry += rate * dt;
    if (this.carry >= 1) {
      const n = Math.floor(this.carry);
      this.carry -= n;
      this.spawn(n);
    }
    const { o } = this;
    const drag = o.drag ? Math.exp(-o.drag * dt) : 1;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        this.free.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      let ax = o.accel?.x ?? 0;
      let ay = o.accel?.y ?? 0;
      if (o.spring) {
        ax -= o.spring.k * (p.x - o.spring.x);
        ay -= o.spring.k * (p.y - o.spring.y);
      }
      if (o.sway) ax += o.sway[0] * Math.sin(o.sway[1] * p.age + p.phase);
      p.vx = (p.vx + ax * dt) * drag;
      p.vy = (p.vy + ay * dt) * drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      this.draw(p);
    }
  }

  draw(p) {
    const { o } = this;
    const k = p.age / p.life;
    const s = p.px * curve(o.grow ?? 1, k);
    const sprite = p.sprite;
    sprite.position.set(p.x, p.y);
    sprite.alpha = curve(o.alpha ?? 1, k);
    const tone = tint(o.color ?? 0xffffff, k);
    // White light means nothing on paper: on parchment every tone leans to the colour's ink.
    sprite.tint = this.kit.light ? mix(tone, this.kit.ink, 0.75) : tone;
    if (o.align) {
      const speed = Math.hypot(p.vx, p.vy);
      sprite.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      sprite.scale.set(s, s * (o.aspect ?? 1) * (1 + (o.stretch ?? 0) * speed / 100));
    } else {
      sprite.rotation = p.rot;
      sprite.scale.set(s, s * (o.aspect ?? 1));
    }
  }
}

// ── shapes and curves for the scenes ─────────────────────

export const ring = (cx, cy, r0, r1) => (rng) => {
  const a = rng() * 6.283;
  const r = rng.range([r0, r1]);
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a, r };
};
export const box = (x0, x1, y0, y1) => (rng) => ({ x: rng.range([x0, x1]), y: rng.range([y0, y1]) });
export const fade = (peak = 1, inAt = 0.1, outAt = 0.6) => [[0, 0], [inAt, peak], [outAt, peak * 0.8], [1, 0]];
export const flash = (peak = 1) => [[0, peak], [1, 0]];

// ── the shared renderer ──────────────────────────────────

let textures;
let renderer;
const active = new Set();
let ticking = false;

/** Our copy of pixi-filters keeps to its own global, so a module that brings another version keeps its own. */
function loadFilters() {
  return new Promise((resolve) => {
    if (globalThis.AIMPixiFilters) return resolve(globalThis.AIMPixiFilters);
    const script = document.createElement("script");
    script.src = FILTERS;
    script.onload = () => resolve(globalThis.AIMPixiFilters ?? null);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
}

export function load() {
  textures ??= Promise.all([
    PIXI.Assets.load(TEXTURES.map((name) => `${VFX}/${name}.png`)),
    loadFilters()
  ]).then(([loaded, filters]) => ({
    tex: (name) => loaded[`${VFX}/${name}.png`] ?? PIXI.Texture.WHITE,
    filters
  }));
  return textures;
}

/**
 * Draws a stage into an entry's canvas. The renderer is transparent and only grows: a stage takes its top left corner
 * and the canvas copies that much, so cards and bursts of any size share one WebGL context.
 */
export function paint(entry) {
  const { w, h, ratio } = entry.size;
  renderer ??= new PIXI.Renderer({ width: w, height: h, resolution: ratio, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  const stale = renderer.resolution !== ratio;
  // PIXI 7's resize() takes no resolution: a new pixel ratio (browser zoom, another monitor) is set on its own.
  if (stale) renderer.resolution = ratio;
  // In device pixels: at a fractional ratio the screen size rounds a little below the stage's.
  if (stale || renderer.width < Math.round(w * ratio) || renderer.height < Math.round(h * ratio)) {
    renderer.resize(Math.max(w, renderer.screen.width), Math.max(h, renderer.screen.height));
  }
  renderer.render(entry.stage);
  const { width, height } = entry.canvas;
  entry.ctx.clearRect(0, 0, width, height);
  entry.ctx.drawImage(renderer.view, 0, 0, w * ratio, h * ratio, 0, 0, width, height);
}

/** The base of a scene's or a burst's kit: its size, colours, chance, textures, particles and lone sprites. */
export function makeKit(world, assets, { w, h, colour, rng, light = false }) {
  const kit = {
    w, h, cx: w / 2, cy: h / 2, c: colour, rng, light, tex: assets.tex,
    hot: mix(colour, 0xffffff, 0.45),
    deep: mix(colour, 0x000000, 0.55),
    ink: mix(colour, 0x000000, 0.25),
    fx: (o) => new Particles(world.addChild(new PIXI.Container()), kit, o),
    sprite(name, x, y, px, { tint: colourOf = 0xffffff, alpha = 1, aspect = 1, add = true } = {}) {
      const sprite = world.addChild(new PIXI.Sprite(assets.tex(name)));
      sprite.anchor.set(0.5);
      sprite.position.set(x, y);
      sprite.base = px / sprite.texture.width;
      sprite.scale.set(sprite.base, sprite.base * aspect);
      const additive = add && !(light && add !== "always");
      Object.assign(sprite, { tint: colourOf, alpha, blendMode: additive ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL });
      return sprite;
    }
  };
  return kit;
}

/** A 2D canvas sized for `size` at its pixel ratio. */
export function sizeCanvas(canvas, size) {
  canvas.width = Math.round(size.w * size.ratio);
  canvas.height = Math.round(size.h * size.ratio);
  return canvas.getContext("2d");
}

export const pixelRatio = (doc) => Math.min(2, doc.defaultView?.devicePixelRatio || 1);
export const hasPixi = () => Boolean(globalThis.PIXI?.Renderer);

/** The frame clock of a window on screen: a popped-out window keeps playing while the main tab is hidden. */
const frameWindow = () => [...active].find((entry) => !entry.canvas.ownerDocument.hidden)?.canvas.ownerDocument.defaultView ?? window;

function tick(now) {
  for (const entry of active) {
    if (!entry.canvas.isConnected) { entry.stop(); continue; }
    // Effects pause while the browser tab is hidden (#9).
    if (entry.canvas.ownerDocument.hidden) { entry.last = now; continue; }
    const dt = Math.min(0.05, Math.max(0, (now - (entry.last ?? now)) / 1000));
    entry.last = now;
    const more = entry.update(dt);
    paint(entry);
    if (!more) entry.stop();
  }
  ticking = active.size > 0;
  if (ticking) frameWindow().requestAnimationFrame(tick);
  // Filters keep their work textures in a pool (a long rest's bloom holds tens of MB); idle, the GPU gets them back.
  else renderer?.filter.emptyPool();
}

/**
 * Plays an entry {canvas, ctx, size, stage, update(dt) → keep going, stop} frame by frame; `stop` must call `halt`.
 */
export function run(entry) {
  active.add(entry);
  if (!ticking) { ticking = true; frameWindow().requestAnimationFrame(tick); }
}

export const halt = (entry) => active.delete(entry);
