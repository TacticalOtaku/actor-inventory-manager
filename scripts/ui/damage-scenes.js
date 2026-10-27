// ─────────────────────────────────────────────────────────
// AIM: Actor Window - damage type scenes: one per dnd5e type, on the shared effects renderer (ui/vfx.js)
// ─────────────────────────────────────────────────────────

import { sceneFor, scenePlan } from "../core/damage-scenes.js";
import { RAD, STEP, box, fade, flash, halt, hasPixi, hex, lift, load, makeKit, mix, paint, parseColor, pixelRatio, random, rgb, ring, run, sizeCanvas } from "./vfx.js";

const BG = 0x090b10;

/**
 * Each scene: period (s) of its loop, warm (s simulated before the first frame), still (the moment that tells its
 * story best, for a still frame), bloom settings, and build(kit) → update(t, dt, ev), where ev(at) is true on the
 * step that crosses `at` seconds into a loop.
 */
const SCENES = {
  fire: {
    period: 2, warm: 1.2, still: 0.9, bloom: { threshold: 0.32, bloomScale: 1.35, blur: 7 },
    build(k) {
      const { h, cx, c, hot, deep } = k;
      const base = () => (rng) => ({ x: cx + (rng() + rng() + rng() - 1.5) * 80, y: h + 8 });
      const glow = k.sprite("circle_05", cx, h + 8, 300, { tint: c, alpha: 0.4, aspect: 0.55 });
      const core = k.fx({ tex: "fire_01", life: [0.6, 1], at: base(), dir: [-95, -85], speed: [24, 50], size: [80, 120], spin: [-40, 40],
        grow: [[0, 0.6], [1, 1]], alpha: fade(0.45, 0.2, 0.45), color: [[0, hot], [0.6, c], [1, deep]] });
      const tongues = k.fx({ tex: ["muzzle_01", "muzzle_03"], life: [0.5, 0.75], at: base(), dir: [-94, -86], speed: [30, 60], sway: [40, 6],
        size: [60, 92], rot: [-10, 10], spin: [-16, 16], grow: [[0, 0.5], [0.3, 1], [1, 0.4]], alpha: [[0, 0], [0.2, 0.65], [0.85, 0]],
        color: [[0, mix(hot, 0xffffff, 0.3)], [0.4, c], [1, deep]] });
      const flames = k.fx({ tex: ["flame_05", "flame_06", "muzzle_02", "muzzle_04", "muzzle_05"], life: [0.6, 1.05], at: base(),
        dir: [-96, -84], speed: [50, 95], accel: { x: 0, y: -50 }, drag: 0.4, sway: [70, 9], size: [40, 70], rot: [-8, 8],
        spin: [-24, 24], grow: [[0, 0.5], [0.3, 1], [1, 0.35]], alpha: [[0, 0], [0.12, 0.85], [0.45, 0.5], [0.75, 0]],
        color: [[0, mix(hot, 0xffffff, 0.3)], [0.3, hot], [0.7, c]] });
      const embers = k.fx({ tex: ["star_04", "star_05"], life: [1, 2], at: base(), dir: [-120, -60], speed: [40, 96],
        accel: { x: 0, y: -18 }, sway: [240, 7], size: [6, 13], alpha: [[0, 1], [0.6, 0.9], [1, 0]],
        color: [[0, 0xffffff], [0.3, hot], [1, c]] });
      return (t, dt) => {
        glow.alpha = 0.34 + 0.08 * Math.sin(t * 13) * Math.sin(t * 5.3);
        core.update(dt, 26);
        tongues.update(dt, 14);
        flames.update(dt, 96);
        embers.update(dt, 15);
      };
    }
  },

  cold: {
    period: 2.6, warm: 3, still: 0.75, bloom: { threshold: 0.35, bloomScale: 1.2, blur: 6 },
    build(k) {
      const { w, h, cx, cy, c } = k;
      const frost = mix(c, 0xffffff, 0.55);
      k.sprite("circle_05", cx, cy, 220, { tint: c, alpha: 0.16 });
      const crystal = k.sprite("magic_05", cx, cy, 64, { tint: frost, alpha: 0.8 });
      const mist = k.fx({ tex: ["smoke_07", "smoke_08"], life: [3, 4.2], at: box(-20, w + 20, h - 22, h + 4), dir: [-10, 10],
        speed: [4, 14], size: [80, 120], spin: [-10, 10], alpha: fade(0.13, 0.3, 0.7), color: frost });
      const snow = k.fx({ tex: "circle_05", life: [4, 6], at: box(0, w, -10, h * 0.3), dir: [70, 110], speed: [10, 24],
        sway: [24, 2], size: [3, 6], alpha: fade(0.8, 0.15, 0.8), color: 0xffffff });
      const shards = k.fx({ tex: ["trace_05", "trace_06"], life: [1.7, 2.1], at: () => ({ x: cx, y: cy }), speed: [130, 210],
        drag: 3.6, align: true, stretch: 0.25, size: [40, 64], alpha: [[0, 1], [0.75, 0.85], [1, 0]],
        color: [[0, 0xffffff], [0.25, frost], [1, c]] });
      const flare = k.fx({ tex: ["star_06", "magic_05"], life: 0.55, size: 110, rot: 0, grow: [[0, 0.5], [1, 1.3]], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      const wave = k.fx({ tex: "circle_02", life: 0.7, size: 40, grow: [[0, 0.6], [1, 4.4]], alpha: flash(0.85), color: [[0, 0xffffff], [1, c]] });
      const glints = k.fx({ tex: ["star_06", "star_04"], life: [0.4, 0.8], at: ring(cx, cy, 18, 78), size: [8, 18], rot: 0,
        alpha: fade(1, 0.45, 0.5), color: 0xffffff });
      return (t, dt, ev) => {
        if (ev(0.1)) { shards.spawn(26); flare.spawn(); wave.spawn(); }
        const settled = (t % 2.6) < 1.9;
        crystal.alpha = 0.6 + 0.25 * Math.sin(t * 3.1);
        crystal.rotation = Math.sin(t * 0.7) * 0.1;
        mist.update(dt, 5);
        snow.update(dt, 9);
        shards.update(dt);
        flare.update(dt);
        wave.update(dt);
        glints.update(dt, settled ? 10 : 2);
      };
    }
  },

  lightning: {
    period: 1.6, warm: 1.6, still: 0.05, bloom: { threshold: 0.3, bloomScale: 1.6, blur: 9 },
    build(k) {
      const { w, h, cx, c, hot } = k;
      const ground = { x: cx, y: h - 12 };
      const clouds = k.fx({ tex: ["smoke_07", "smoke_08"], life: [3, 4], at: box(-20, w + 20, -20, 14), dir: [-5, 5], speed: [4, 10],
        size: [110, 150], spin: [-6, 6], add: false, alpha: fade(0.5, 0.3, 0.7), color: mix(c, 0x000000, 0.75) });
      const sky = k.sprite("circle_05", cx, 0, 520, { tint: c, alpha: 0, aspect: 0.4 });
      const bolt = k.fx({ tex: ["spark_05", "spark_06"], life: 0.2, size: [150, 170], rot: [-4, 4],
        alpha: [[0, 1], [0.25, 0.35], [0.45, 1], [1, 0]], color: [[0, 0xffffff], [1, hot]] });
      const halo = k.fx({ tex: ["spark_05", "spark_06"], life: 0.24, size: [190, 210], rot: [-4, 4], alpha: [[0, 0.7], [1, 0]], color: c });
      const impact = k.fx({ tex: "star_09", life: 0.3, size: 130, rot: 0, grow: [[0, 1.2], [1, 0.6]], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      const arc = k.fx({ tex: "spark_07", life: 0.4, size: [180, 220], rot: [-3, 3], aspect: 0.6, alpha: [[0, 1], [0.3, 0.4], [0.5, 0.9], [1, 0]], color: [[0, 0xffffff], [1, c]] });
      const sparks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.35, 0.8], dir: [195, 345], speed: [120, 280], accel: { x: 0, y: 420 }, drag: 0.8,
        align: true, stretch: 0.5, size: [7, 12], alpha: flash(), color: [[0, 0xffffff], [0.4, hot], [1, c]] });
      const afterglow = k.fx({ tex: "circle_05", life: 1, size: 150, rot: 0, aspect: 0.32, alpha: flash(0.7), color: c });
      const crackle = k.fx({ tex: ["spark_01", "spark_02"], life: 0.12, at: box(cx - 70, cx + 70, 18, h - 30), size: [38, 60], alpha: flash(0.8), color: hot });
      return (t, dt, ev) => {
        if (ev(0) || ev(0.11)) {
          const x = cx + (k.rng() - 0.5) * 30;
          bolt.spawn(1, { x, y: h / 2 - 8, vx: 0, vy: 0 });
          halo.spawn(1, { x, y: h / 2 - 8, vx: 0, vy: 0 });
          impact.spawn(1, { ...ground, vx: 0, vy: 0 });
          sparks.spawn(14, { ...ground });
          k.shake(2.5, 0.25);
        }
        if (ev(0.02)) {
          arc.spawn(1, { ...ground, vx: 0, vy: 0 });
          afterglow.spawn(1, { ...ground, vx: 0, vy: 0 });
        }
        const since = t % 1.6;
        sky.alpha = since < 0.3 ? 0.4 * (1 - since / 0.3) * (since < 0.11 ? 1 : 0.7) : 0;
        clouds.update(dt, 2);
        bolt.update(dt);
        halo.update(dt);
        impact.update(dt);
        arc.update(dt);
        afterglow.update(dt);
        sparks.update(dt);
        crackle.update(dt, since > 0.5 ? 5 : 0);
      };
    }
  },

  acid: {
    period: 2.4, warm: 2.6, still: 0.42, bloom: { threshold: 0.35, bloomScale: 1.2, blur: 6 },
    build(k) {
      const { h, cx, c, hot } = k;
      const floor = h - 14;
      k.sprite("circle_05", cx, floor + 6, 340, { tint: c, alpha: 0.5, aspect: 0.18 });
      k.sprite("circle_05", cx, floor + 4, 200, { tint: hot, alpha: 0.35, aspect: 0.12 });
      const fumes = k.fx({ tex: "circle_05", life: [2.2, 3], at: box(cx - 110, cx + 110, floor - 10, floor), dir: [-100, -80],
        speed: [10, 22], sway: [10, 1.5], size: [60, 100], grow: [[0, 0.6], [1, 1.5]], alpha: fade(0.16, 0.3, 0.6), color: c });
      const bubbles = k.fx({ tex: "circle_02", life: [0.5, 1], at: box(cx - 120, cx + 120, floor - 3, floor + 5), dir: [-95, -85], speed: [3, 10],
        size: [6, 13], grow: [[0, 0.3], [0.85, 1], [1, 1.6]], aspect: 0.8, alpha: [[0, 1], [0.85, 0.9], [1, 0]], color: mix(hot, 0xffffff, 0.3) });
      const drop = k.fx({ tex: "circle_05", life: 0.33, align: true, stretch: 0.8, size: 16, alpha: 1, accel: { x: 0, y: 600 }, color: mix(hot, 0xffffff, 0.3) });
      const splash = k.fx({ tex: "circle_05", life: [0.45, 0.75], dir: [205, 335], speed: [80, 170], accel: { x: 0, y: 520 }, align: true, stretch: 0.3,
        size: [6, 10], alpha: [[0, 1], [1, 0.2]], color: [[0, 0xffffff], [0.3, hot], [1, c]] });
      const sizzle = k.fx({ tex: "circle_05", life: 0.9, size: 80, rot: 0, aspect: 0.4, alpha: flash(0.8), color: hot });
      const ripple = k.fx({ tex: "circle_02", life: 0.8, size: 30, rot: 0, aspect: 0.28, grow: [[0, 0.4], [1, 3.6]], alpha: flash(1), color: [[0, 0xffffff], [1, c]] });
      const hiss = k.fx({ tex: ["smoke_07", "smoke_08"], life: [0.8, 1.2], dir: [-120, -60], speed: [20, 40], size: [30, 46],
        grow: [[0, 0.5], [1, 1.6]], alpha: fade(0.5, 0.15, 0.4), color: [[0, hot], [1, c]] });
      const xs = [cx - 64, cx + 18, cx + 76];
      return (t, dt, ev) => {
        xs.forEach((x, i) => {
          const at = i * 0.7;
          if (ev(at)) drop.spawn(1, { x, y: -10, vx: 0, vy: 250 });
          if (ev(at + 0.33)) {
            splash.spawn(16, { x, y: floor });
            ripple.spawn(1, { x, y: floor, vx: 0, vy: 0 });
            sizzle.spawn(1, { x, y: floor, vx: 0, vy: 0 });
            hiss.spawn(3, { x, y: floor - 6 });
          }
        });
        fumes.update(dt, 6);
        bubbles.update(dt, 9);
        drop.update(dt);
        splash.update(dt);
        ripple.update(dt);
        sizzle.update(dt);
        hiss.update(dt);
      };
    }
  },

  thunder: {
    period: 2.2, warm: 2.2, still: 0.3, bloom: { threshold: 0.35, bloomScale: 1.3, blur: 7 }, shockwave: true,
    build(k) {
      const { w, h, cx, cy, c, hot } = k;
      const air = k.fx({ tex: ["smoke_07", "smoke_08"], life: [3, 4], at: box(0, w, 0, h), dir: [0, 360], speed: [2, 6], size: [90, 130],
        spin: [-8, 8], alpha: fade(0.12, 0.3, 0.7), color: c });
      const rings = k.fx({ tex: ["light_03", "circle_03"], life: [0.75, 0.95], size: 40, grow: [[0, 0.3], [1, 6.5]], rot: [0, 360],
        alpha: [[0, 1], [0.5, 0.5], [1, 0]], color: [[0, 0xffffff], [0.3, hot], [1, c]] });
      const core = k.fx({ tex: "star_09", life: 0.28, size: 130, rot: 0, grow: [[0, 0.7], [1, 1.3]], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      const dust = k.fx({ tex: ["smoke_07", "smoke_08"], add: false, life: [1, 1.5], drag: 2.6, size: [44, 70],
        grow: [[0, 0.5], [1, 1.7]], spin: [-40, 40], alpha: fade(0.45, 0.08, 0.4), color: mix(c, 0x6b6b6b, 0.6) });
      const motes = k.fx({ tex: "circle_05", life: [0.6, 1], dir: [0, 360], speed: [90, 200], drag: 2.2, size: [3, 6], alpha: flash(), color: hot });
      let wave = -1;
      return (t, dt, ev) => {
        if (ev(0)) {
          rings.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
          core.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
          dust.spawn(7, { x: cx, y: h - 8, vx: -170, vy: -8 });
          dust.spawn(7, { x: cx, y: h - 8, vx: 170, vy: -8 });
          motes.spawn(18, { x: cx, y: cy });
          k.shake(4, 0.4);
          wave = 0;
        }
        if (ev(0.12) || ev(0.24)) rings.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
        if (wave >= 0) {
          wave += dt;
          k.shock(cx, cy, wave, 260);
          if (wave > 1) { wave = -1; k.shock(null); }
        }
        air.update(dt, 3);
        rings.update(dt);
        core.update(dt);
        dust.update(dt);
        motes.update(dt);
      };
    }
  },

  necrotic: {
    period: 3, warm: 3, still: 0.6, bloom: { threshold: 0.3, bloomScale: 1.25, blur: 7 }, twist: true,
    build(k) {
      const { cx, cy, c, deep } = k;
      const pale = mix(c, 0xffffff, 0.55);
      const pit = k.sprite("smoke_09", cx, cy, 170, { tint: 0x000000, alpha: 0.85, add: false });
      const rim = k.sprite("circle_05", cx, cy, 160, { tint: c, alpha: 0.3 });
      const swirls = k.fx({ tex: ["twirl_01", "twirl_02", "twirl_03"], life: [1.4, 2], at: () => ({ x: cx, y: cy }), size: [90, 150],
        spin: [-220, -140], grow: [[0, 1.3], [1, 0.45]], alpha: fade(0.75, 0.25, 0.6), color: [[0, pale], [0.5, c], [1, deep]] });
      const motes = k.fx({ tex: ["star_05", "circle_05"], life: [1.2, 1.8], spring: { x: cx, y: cy, k: 9 }, drag: 1.4,
        at: (rng) => {
          const p = ring(cx, cy, 70, 140)(rng);
          const v = p.r * 3 * 0.95;
          return { x: p.x, y: p.y, vx: -Math.sin(p.a) * v, vy: Math.cos(p.a) * v };
        },
        size: [7, 13], alpha: fade(1, 0.2, 0.7), color: [[0, pale], [1, c]] });
      const drain = k.fx({ tex: "circle_02", life: 0.9, size: 60, grow: [[0, 3.6], [1, 0.3]], alpha: [[0, 0], [0.3, 0.8], [1, 0]], color: [[0, pale], [1, c]] });
      return (t, dt, ev) => {
        if (ev(0)) drain.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
        pit.rotation = -t * 0.6;
        rim.alpha = 0.26 + 0.08 * Math.sin(t * 2.1);
        k.twist(cx, cy, 90, -1.6 - 0.4 * Math.sin(t * 1.3));
        swirls.update(dt, 3.4);
        motes.update(dt, 26);
        drain.update(dt);
      };
    }
  },

  radiant: {
    period: 2.6, warm: 3, still: 0.5, bloom: { threshold: 0.42, bloomScale: 1.2, blur: 9 },
    build(k) {
      const { h, cx, c, hot } = k;
      const sun = { x: cx, y: 22 };
      const warm = mix(hot, 0xffffff, 0.5);
      const rays = k.fx({ tex: ["trace_06", "trace_07"], life: [2.2, 3.2], at: (rng) => ({ x: sun.x + (rng() - 0.5) * 220, y: h * 0.55 }),
        speed: 0, rot: [-22, 22], size: [50, 90], aspect: 2.2, alpha: fade(0.28, 0.35, 0.65), color: hot });
      const aura = k.sprite("light_02", sun.x, sun.y, 110, { tint: warm, alpha: 0.45 });
      const halo = k.sprite("circle_05", sun.x, sun.y, 240, { tint: c, alpha: 0.22 });
      const star = k.sprite("star_08", sun.x, sun.y, 80, { tint: 0xffffff, alpha: 0.75 });
      const bloomRing = k.fx({ tex: "circle_02", life: 1.3, size: 40, grow: [[0, 0.6], [1, 4.4]], alpha: flash(0.7), color: [[0, 0xffffff], [1, c]] });
      const sparkles = k.fx({ tex: ["star_06", "star_04"], life: [1.6, 2.6], at: (rng) => ({ x: sun.x + (rng() - 0.5) * 160, y: sun.y + rng() * 20 }),
        dir: [80, 100], speed: [16, 34], sway: [30, 2], size: [7, 15], rot: 0, alpha: [[0, 0], [0.15, 1], [0.5, 0.4], [0.7, 1], [1, 0]],
        color: [[0, 0xffffff], [1, hot]] });
      const dust = k.fx({ tex: "circle_05", life: [2, 3], at: box(cx - 120, cx + 120, h * 0.4, h), dir: [-100, -80], speed: [5, 12],
        sway: [10, 2], size: [2, 4], alpha: fade(0.7, 0.3, 0.6), color: warm });
      return (t, dt, ev) => {
        if (ev(0)) bloomRing.spawn(1, { ...sun, vx: 0, vy: 0 });
        aura.rotation = t * 0.25;
        star.rotation = Math.sin(t * 0.8) * 0.12;
        star.alpha = 0.65 + 0.15 * Math.sin(t * 3);
        halo.alpha = 0.2 + 0.05 * Math.sin(t * 1.7);
        rays.update(dt, 3.2);
        bloomRing.update(dt);
        sparkles.update(dt, 10);
        dust.update(dt, 8);
      };
    }
  },

  poison: {
    period: 3, warm: 4, still: 0.5, bloom: { threshold: 0.3, bloomScale: 1.3, blur: 7 },
    build(k) {
      const { h, cx, c, hot, deep } = k;
      const area = (rng) => ({ x: cx + (rng() - 0.5) * 180, y: h * 0.62 + (rng() - 0.5) * 40 });
      const body = k.fx({ tex: ["smoke_07", "smoke_08"], add: false, life: [3, 4.2], at: area, dir: [-120, -60], speed: [4, 12],
        size: [70, 120], grow: [[0, 0.6], [1, 1.5]], spin: [-14, 14], alpha: fade(0.5, 0.3, 0.6), color: deep });
      const glow = k.fx({ tex: ["smoke_07", "smoke_08"], life: [2.6, 3.6], at: area, dir: [-120, -60], speed: [6, 14],
        size: [60, 100], grow: [[0, 0.6], [1, 1.4]], spin: [-20, 20], alpha: fade(0.42, 0.3, 0.6), color: c });
      const bubbles = k.fx({ tex: "circle_02", life: [0.8, 1.4], at: area, dir: [-100, -80], speed: [10, 22], sway: [20, 3],
        size: [7, 15], grow: [[0, 0.4], [0.85, 1], [1, 1.8]], alpha: [[0, 0], [0.2, 1], [0.85, 0.9], [1, 0]], color: mix(hot, 0xffffff, 0.3) });
      const spores = k.fx({ tex: "circle_05", life: [2, 3], at: area, dir: [0, 360], speed: [6, 18], sway: [30, 1.4], size: [3, 6],
        alpha: fade(0.9, 0.2, 0.7), color: mix(hot, 0xffffff, 0.3) });
      const puff = k.fx({ tex: ["smoke_07", "smoke_08"], life: [1.2, 1.6], at: () => ({ x: cx, y: h * 0.62 }), dir: [0, 360], speed: [30, 60],
        drag: 1.6, size: [40, 60], grow: [[0, 0.5], [1, 1.6]], spin: [-30, 30], alpha: fade(0.35, 0.1, 0.4), color: hot });
      return (t, dt, ev) => {
        if (ev(0)) puff.spawn(6);
        body.update(dt, 4);
        glow.update(dt, 4);
        bubbles.update(dt, 9);
        spores.update(dt, 7);
        puff.update(dt);
      };
    }
  },

  psychic: {
    period: 2.4, warm: 2.4, still: 0.45, bloom: { threshold: 0.3, bloomScale: 1.35, blur: 8 }, split: true,
    build(k) {
      const { cx, cy, c, c2 } = k;
      const outer = k.sprite("magic_02", cx, cy, 118, { tint: c, alpha: 0.75 });
      const inner = k.sprite("magic_01", cx, cy, 78, { tint: c2, alpha: 0.75 });
      const eye = k.sprite("light_01", cx, cy, 60, { tint: mix(c, 0xffffff, 0.3), alpha: 0.7 });
      const waves = k.fx({ tex: ["light_03", "circle_02"], life: 1.3, size: 40, grow: [[0, 0.5], [1, 6]], rot: [0, 360],
        alpha: [[0, 0], [0.12, 0.85], [1, 0]] });
      const motes = k.fx({ tex: ["star_04", "star_05"], life: [1.6, 2.4], spring: { x: cx, y: cy, k: 4 },
        at: (rng) => {
          const p = ring(cx, cy, 30, 58)(rng);
          const v = p.r * 2;
          return { x: p.x, y: p.y, vx: -Math.sin(p.a) * v, vy: Math.cos(p.a) * v * 0.45 };
        },
        size: [6, 12], alpha: fade(1, 0.2, 0.7), color: [[0, c2], [1, c]] });
      return (t, dt, ev) => {
        [0, 0.8, 1.6].forEach((at, i) => {
          if (!ev(at)) return;
          waves.o.color = i % 2 ? [[0, 0xffffff], [1, c2]] : [[0, 0xffffff], [1, c]];
          waves.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
        });
        outer.rotation = t * 0.5;
        inner.rotation = -t * 0.8;
        const beat = Math.pow(Math.max(0, Math.cos((t % 0.8) / 0.8 * Math.PI)), 6);
        eye.scale.set(eye.base * (1 + 0.25 * beat));
        k.split(1 + 1.5 * beat, t);
        waves.update(dt);
        motes.update(dt, 8);
      };
    }
  },

  force: {
    period: 2, warm: 2, still: 1.16, bloom: { threshold: 0.3, bloomScale: 1.45, blur: 8 }, shockwave: true,
    build(k) {
      const { cx, cy, c, hot } = k;
      const runes = k.sprite("magic_02", cx, cy, 130, { tint: c, alpha: 0.6 });
      const orb = k.sprite("circle_05", cx, cy, 70, { tint: hot, alpha: 0.9 });
      const shell = k.sprite("light_02", cx, cy, 80, { tint: c, alpha: 0.8 });
      const gather = k.fx({ tex: ["star_04", "circle_05"], life: [0.5, 0.8], spring: { x: cx, y: cy, k: 22 }, drag: 2,
        at: (rng) => ({ ...ring(cx, cy, 60, 100)(rng), vx: 0, vy: 0 }), size: [4, 8], alpha: fade(1, 0.3, 0.7), color: hot });
      const cross = k.fx({ tex: "magic_03", life: 0.6, size: 90, rot: [0, 90], spin: 160, grow: [[0, 0.6], [1, 1.9]], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      const rings = k.fx({ tex: "circle_03", life: 0.6, size: 40, grow: [[0, 0.5], [1, 5]], alpha: flash(0.9), color: [[0, 0xffffff], [1, c]] });
      const streaks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.3, 0.55], speed: [220, 360], drag: 2.5, align: true, stretch: 0.4,
        at: () => ({ x: cx, y: cy }), size: [8, 14], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      let wave = -1;
      return (t, dt, ev) => {
        const phase = t % 2;
        // It gathers for a second, then lets go.
        const squeeze = phase < 1 ? 1 - 0.35 * phase : 0.65 + 0.35 * Math.min(1, (phase - 1) / 0.6);
        orb.scale.set(orb.base * squeeze);
        shell.scale.set(shell.base * (0.8 + 0.3 * squeeze));
        runes.rotation = t * (phase < 1 ? 0.6 + phase * 2.5 : 0.6);
        if (ev(1)) {
          cross.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
          rings.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
          streaks.spawn(18);
          k.shake(2, 0.2);
          wave = 0;
        }
        if (ev(1.1)) rings.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
        if (wave >= 0) {
          wave += dt;
          k.shock(cx, cy, wave, 220);
          if (wave > 0.8) { wave = -1; k.shock(null); }
        }
        gather.update(dt, phase < 0.85 ? 26 : 0);
        cross.update(dt);
        rings.update(dt);
        streaks.update(dt);
      };
    }
  },

  slashing: {
    period: 1.6, warm: 1.6, still: 0.46, bloom: { threshold: 0.3, bloomScale: 1.4, blur: 7 },
    build(k) {
      const { cx, cy, c, hot } = k;
      const slash = k.fx({ tex: ["slash_01", "slash_03"], life: 0.4, size: 150, grow: [[0, 0.8], [1, 1.12]],
        alpha: [[0, 0], [0.08, 1], [0.4, 0.7], [1, 0]], color: [[0, 0xffffff], [0.3, hot], [1, c]] });
      const glow = k.fx({ tex: ["slash_01", "slash_03"], life: 0.5, size: 190, alpha: [[0, 0], [0.1, 0.5], [1, 0]], color: c });
      const scar = k.fx({ tex: "scratch_01", life: 1, size: 120, rot: 32, grow: [[0, 0.9], [1, 1]], alpha: [[0, 0], [0.06, 0.9], [0.5, 0.5], [1, 0]],
        color: [[0, 0xffffff], [0.2, hot], [1, c]] });
      const sparks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.25, 0.5], speed: [160, 320], drag: 3.2, accel: { x: 0, y: 260 }, align: true,
        stretch: 0.5, size: [7, 11], alpha: flash(), color: [[0, 0xffffff], [0.4, hot], [1, c]] });
      const cuts = [{ at: 0.1, rot: -28 }, { at: 0.26, rot: 154 }, { at: 0.42, rot: 8 }];
      return (t, dt, ev) => {
        for (const cut of cuts) {
          if (!ev(cut.at)) continue;
          const x = cx + (k.rng() - 0.5) * 30;
          const y = cy + (k.rng() - 0.5) * 16;
          slash.o.rot = cut.rot;
          glow.o.rot = cut.rot;
          slash.spawn(1, { x, y, vx: 0, vy: 0 });
          glow.spawn(1, { x, y, vx: 0, vy: 0 });
          const dir = (cut.rot + 90) * RAD;
          for (let i = 0; i < 9; i++) {
            const a = dir + (k.rng() - 0.5) * 0.9 + (i % 2 ? Math.PI : 0);
            const v = k.rng.range([160, 320]);
            sparks.spawn(1, { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
          }
        }
        if (ev(0.44)) scar.spawn(1, { x: cx, y: cy, vx: 0, vy: 0 });
        slash.update(dt);
        glow.update(dt);
        scar.update(dt);
        sparks.update(dt);
      };
    }
  },

  piercing: {
    period: 1.8, warm: 1.8, still: 0.2, bloom: { threshold: 0.3, bloomScale: 1.4, blur: 7 }, zoom: true,
    build(k) {
      const { w, cy, c, hot } = k;
      const target = { x: w * 0.7, y: cy };
      const flight = 0.18;
      const from = -40;
      const reticle = k.sprite("magic_03", target.x, target.y, 84, { tint: c, alpha: 0.3 });
      const head = k.sprite("trace_07", from, cy, 18, { tint: 0xffffff, alpha: 0, aspect: 4 });
      head.rotation = Math.PI / 2;
      const trail = k.fx({ tex: ["trace_05", "trace_06"], life: [0.18, 0.3], size: [12, 18], aspect: 3, rot: 90, alpha: flash(0.7), color: [[0, hot], [1, c]] });
      const impact = k.fx({ tex: "star_08", life: 0.3, size: 110, rot: [0, 30], grow: [[0, 1.2], [1, 0.6]], alpha: flash(), color: [[0, 0xffffff], [1, c]] });
      const ripple = k.fx({ tex: "circle_02", life: 0.5, size: 30, grow: [[0, 0.4], [1, 3.6]], alpha: flash(0.9), color: [[0, 0xffffff], [1, c]] });
      const sparks = k.fx({ tex: ["trace_06", "trace_07"], life: [0.25, 0.55], dir: [130, 230], speed: [120, 280], drag: 3, accel: { x: 0, y: 200 },
        align: true, stretch: 0.5, size: [7, 11], alpha: flash(), color: [[0, 0xffffff], [0.4, hot], [1, c]] });
      let zoom = -1;
      return (t, dt, ev) => {
        const phase = t % 1.8;
        reticle.rotation = t * 0.4;
        reticle.alpha = phase < flight ? 0.3 + phase * 2 : 0.3;
        if (phase < flight) {
          const x = from + (target.x - from) * (phase / flight);
          head.position.set(x, cy);
          head.alpha = 1;
          trail.spawn(2, { x: x - 10, y: cy + (k.rng() - 0.5) * 2, vx: 0, vy: 0 });
        } else head.alpha = 0;
        if (ev(flight)) {
          impact.spawn(1, { ...target, vx: 0, vy: 0 });
          ripple.spawn(1, { ...target, vx: 0, vy: 0 });
          sparks.spawn(16, { ...target });
          k.shake(2, 0.18);
          zoom = 0;
        }
        if (zoom >= 0) {
          zoom += dt;
          k.zoom(target.x, target.y, Math.max(0, 0.22 * (1 - zoom / 0.3)));
          if (zoom > 0.3) zoom = -1;
        }
        trail.update(dt);
        impact.update(dt);
        ripple.update(dt);
        sparks.update(dt);
      };
    }
  },

  bludgeoning: {
    period: 2, warm: 2, still: 0.2, bloom: { threshold: 0.33, bloomScale: 1.3, blur: 7 },
    build(k) {
      const { h, cx, c, hot } = k;
      const ground = { x: cx, y: h - 22 };
      const crater = k.fx({ tex: "scorch_02", life: 1.6, size: 110, rot: 0, aspect: 0.35, alpha: [[0, 0.9], [0.5, 0.5], [1, 0]], color: [[0, hot], [1, c]] });
      const flare = k.fx({ tex: "star_09", life: 0.24, size: 96, rot: 0, grow: [[0, 1.1], [1, 0.5]], alpha: flash(0.9), color: [[0, 0xffffff], [1, c]] });
      const ripple = k.fx({ tex: "circle_02", life: 0.6, size: 40, rot: 0, aspect: 0.3, grow: [[0, 0.4], [1, 6]], alpha: flash(0.9), color: [[0, 0xffffff], [1, c]] });
      const dust = k.fx({ tex: ["smoke_07", "smoke_08"], add: false, life: [1, 1.6], drag: 2.6, size: [44, 72],
        grow: [[0, 0.5], [1, 1.8]], spin: [-40, 40], alpha: fade(0.38, 0.12, 0.4), color: mix(c, 0x4a4a4a, 0.6) });
      const debris = k.fx({ tex: ["dirt_01", "dirt_02"], add: false, life: [0.6, 0.95], dir: [230, 310], speed: [130, 230], accel: { x: 0, y: 620 },
        size: [12, 20], spin: [-360, 360], alpha: [[0, 0.85], [0.8, 0.85], [1, 0]], color: mix(c, 0x999999, 0.5) });
      const chips = k.fx({ tex: "circle_05", life: [0.4, 0.7], dir: [200, 340], speed: [120, 260], accel: { x: 0, y: 500 }, align: true,
        stretch: 0.3, size: [4, 7], alpha: flash(), color: [[0, 0xffffff], [1, hot]] });
      return (t, dt, ev) => {
        if (ev(0)) {
          crater.spawn(1, { ...ground, y: ground.y + 6, vx: 0, vy: 0 });
          flare.spawn(1, { ...ground, vx: 0, vy: 0 });
          ripple.spawn(1, { ...ground, y: ground.y + 6, vx: 0, vy: 0 });
          dust.spawn(7, { ...ground, vx: -190, vy: -10 });
          dust.spawn(7, { ...ground, vx: 190, vy: -10 });
          debris.spawn(10, { ...ground });
          chips.spawn(14, { ...ground });
          k.shake(5, 0.4);
        }
        crater.update(dt);
        flare.update(dt);
        ripple.update(dt);
        dust.update(dt);
        debris.update(dt);
        chips.update(dt);
      };
    }
  },

  generic: {
    period: 2.4, warm: 2.4, still: 1, bloom: { threshold: 0.3, bloomScale: 1.3, blur: 8 },
    build(k) {
      const { cx, cy, c, hot } = k;
      const halo = k.sprite("circle_05", cx, cy, 150, { tint: c, alpha: 0.4 });
      const core = k.sprite("light_01", cx, cy, 64, { tint: hot, alpha: 0.9 });
      const motes = k.fx({ tex: ["star_05", "star_04"], life: [1.6, 2.4], spring: { x: cx, y: cy, k: 3 },
        at: (rng) => {
          const p = ring(cx, cy, 34, 60)(rng);
          const v = p.r * 1.73;
          return { x: p.x, y: p.y, vx: -Math.sin(p.a) * v, vy: Math.cos(p.a) * v * 0.5 };
        },
        size: [6, 12], alpha: fade(1, 0.2, 0.7), color: [[0, 0xffffff], [1, c]] });
      return (t, dt) => {
        const beat = 0.5 + 0.5 * Math.sin(t * 2.6);
        halo.alpha = 0.3 + 0.15 * beat;
        core.scale.set(core.base * (0.92 + 0.12 * beat));
        core.rotation = t * 0.3;
        motes.update(dt, 9);
      };
    }
  }
};

// ── a scene on its stage ─────────────────────────────────

/** Builds a scene on a stage of its own; its filters are optional, a scene without them still draws. */
function buildScene(key, assets, size, colour) {
  const { w, h, ratio } = size;
  const def = SCENES[key];
  const stage = new PIXI.Container();
  stage.filterArea = new PIXI.Rectangle(0, 0, w, h);
  stage.addChild(new PIXI.Graphics().beginFill(BG).drawRect(0, 0, w, h).endFill());
  const world = stage.addChild(new PIXI.Container());
  const c = lift(colour);
  const rng = random([...key].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7));
  const F = assets.filters;
  const filters = [];
  const made = (Filter, ...args) => {
    if (!Filter) return null;
    const filter = new Filter(...args);
    filter.resolution = ratio;
    filter.enabled = false;
    filters.push(filter);
    return filter;
  };
  const shock = def.shockwave ? made(F?.ShockwaveFilter, [w / 2, h / 2], { amplitude: 14, wavelength: 70, speed: 300, brightness: 1.15, radius: -1 }) : null;
  const twist = def.twist ? made(F?.TwistFilter, { radius: 90, angle: -1.6, padding: 0 }) : null;
  const zoom = def.zoom ? made(F?.ZoomBlurFilter, { strength: 0, center: [w / 2, h / 2], innerRadius: 12 }) : null;
  const split = def.split ? made(F?.RGBSplitFilter, [-2, 0], [0, 1], [2, 0]) : null;
  const bloom = made(F?.AdvancedBloomFilter, { brightness: 1, quality: 6, ...def.bloom });
  if (bloom) bloom.enabled = true;
  if (twist) twist.enabled = true;
  if (split) split.enabled = true;
  stage.filters = filters;
  let shaking = null;
  const kit = Object.assign(makeKit(world, assets, { w, h, colour: c, rng }), {
    // The psychic scene splits between the type's colour and a turned one.
    c2: lift(hex([rgb(c)[1], rgb(c)[2], rgb(c)[0]])),
    shake: (amp, time) => { shaking = { amp, time, left: time }; },
    shock(x, y, time, radius) {
      if (!shock) return;
      shock.enabled = x !== null;
      if (x === null) return;
      Object.assign(shock, { center: [x, y], time, radius });
    },
    twist(x, y, radius, angle) {
      if (twist) Object.assign(twist, { offset: new PIXI.Point(x, y), radius, angle });
    },
    zoom(x, y, strength) {
      if (!zoom) return;
      zoom.enabled = strength > 0.001;
      Object.assign(zoom, { center: [x, y], strength });
    },
    split(px, t) {
      if (!split) return;
      split.red = [-px * Math.cos(t * 1.7), px * 0.4 * Math.sin(t * 2.3)];
      split.blue = [px * Math.cos(t * 1.7), -px * 0.4 * Math.sin(t * 2.3)];
    }
  });
  const update = def.build(kit);
  let t = -def.warm;
  let last = t - 1e-6;
  const ev = (at) => Math.floor((t - at) / def.period) > Math.floor((last - at) / def.period);
  return {
    stage, def,
    get time() { return t; },
    step(dt) {
      last = t;
      t += dt;
      update(t, dt, ev);
      if (shaking) {
        shaking.left -= dt;
        const k = Math.max(0, shaking.left / shaking.time);
        world.position.set((rng() - 0.5) * 2 * shaking.amp * k, (rng() - 0.5) * 2 * shaking.amp * k);
        if (shaking.left <= 0) { shaking = null; world.position.set(0, 0); }
      }
    },
    /** Runs the scene to a moment without drawing it. */
    runTo(time) {
      while (t < time - 1e-9) this.step(Math.min(STEP, time - t));
    },
    destroy() {
      stage.destroy({ children: true });
      for (const filter of filters) filter.destroy();
    }
  };
}

/**
 * Starts a scene on a card's canvas: it loops at «Все» while the card is open (paused in a hidden tab), plays once up
 * to its telling moment and holds it at «Сдержанно», or draws only that moment with motion off. All cards share one
 * WebGL stage, and the textures load once; returns the stop function.
 * @param {HTMLCanvasElement} canvas
 * @param {string} type        the damage type key
 * @param {string|null} color  CSS colour of the type; the accent stands in when it has none
 * @param {string} level       the effective motion level
 */
export function startScene(canvas, type, color, level) {
  const key = sceneFor(type);
  const plan = scenePlan(level);
  const size = { w: canvas.clientWidth || 300, h: canvas.clientHeight || 120, ratio: pixelRatio(canvas.ownerDocument) };
  const ctx = sizeCanvas(canvas, size);
  let stopped = false;
  let entry = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (entry) { halt(entry); entry.scene.destroy(); }
  };
  if (!ctx || !hasPixi()) return stop;
  load().then((assets) => {
    if (stopped || !canvas.isConnected) return stop();
    const scene = buildScene(key, assets, size, parseColor(color));
    // «Сдержанно» plays one loop and holds the telling moment of the next.
    const hold = scene.def.period + scene.def.still;
    entry = {
      canvas, ctx, size, stop, scene, stage: scene.stage,
      update(dt) {
        scene.step(dt);
        if (plan.loop || scene.time < hold) return true;
        scene.runTo(hold);
        return false;
      }
    };
    scene.runTo(0);
    if (plan.stillOnly) {
      entry.scene.runTo(entry.scene.def.still);
      paint(entry);
      return stop();
    }
    paint(entry);
    run(entry);
  }).catch((error) => {
    console.warn(`AIM | damage scene «${key}» failed`, error);
    stop();
  });
  return stop;
}
