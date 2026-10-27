// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the rail: context and the effects that answer changes
// ─────────────────────────────────────────────────────────

import { RAIL_BLOCKS } from "../core/actor-window.js";
import { heartbeatFor } from "../core/vitals.js";
import { readRail } from "../integrations/dnd5e.js";
import { SETTLE } from "./motion.js";

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
const share = (part, whole) => (whole > 0 ? Math.max(0, Math.min(1, part / whole)).toFixed(4) : 0);

/** Temporary effects for the rail: concentration and conditions first, then dnd5e's Временные category. */
function temporaryEffects(actor) {
  const statusIds = new Set((CONFIG.statusEffects ?? []).map((status) => status.id));
  const concentrating = CONFIG.specialStatusEffects?.CONCENTRATING;
  const rank = (effect) => (effect.statuses?.has(concentrating) ? 0 : [...(effect.statuses ?? [])].some((s) => statusIds.has(s)) ? 1 : 2);
  // Foundry 14 counts only effects with a duration as temporary, so conditions are added by their status;
  // exhaustion keeps its own chip.
  return [...(actor.allApplicableEffects?.() ?? [])]
    .filter((effect) => effect.active && !effect.statuses?.has("exhaustion") && (effect.isTemporary || rank(effect) < 2))
    .sort((a, b) => rank(a) - rank(b))
    .map((effect) => ({
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      // Permanent effects report an infinite remainder and the label «None»; only a real countdown shows.
      time: Number.isFinite(effect.duration?.remaining) && effect.duration.remaining > 0 ? effect.duration.label : "",
      isCondition: rank(effect) < 2
    }));
}

/**
 * Everything the rail template needs.
 * @param {Object} actor
 * @param {{canEdit: boolean, hasSpells: boolean, hiddenBlocks: string[]}} options
 */
export function buildRailContext(actor, { canEdit, hasSpells, hiddenBlocks }) {
  const rail = readRail(actor);
  const { value, max, temp } = rail.hp;
  const down = value <= 0 && max > 0;
  const success = Math.min(3, rail.death.success);
  const failure = Math.min(3, rail.death.failure);
  const slotTotals = rail.slots.reduce((sum, slot) => ({ value: sum.value + slot.value, max: sum.max + slot.max }), { value: 0, max: 0 });
  const isVehicle = actor.type === "vehicle";
  const restAllowed = game.user.isGM || (canEdit && game.settings.get("dnd5e", "allowRests"));
  const shown = (id) => !hiddenBlocks.includes(id);
  const blocks = Object.fromEntries(RAIL_BLOCKS.map(({ id, needs }) => [id, shown(id) && (needs !== "magic" || hasSpells)]));
  blocks.hitDice &&= actor.type === "character";
  blocks.rest &&= actor.type === "character" && restAllowed && canEdit;
  blocks.spellcasting &&= rail.casting.length > 0;
  blocks.spellSlots &&= rail.slots.length > 0;
  blocks.favorites &&= actor.type === "character";
  const info = [t("AIM.window.hp.max", { max })];
  if (temp) info.push(t("AIM.window.hp.tempInfo", { temp }));
  if (value < max) info.push(`−${max - value}`);
  return {
    rail: {
      ...rail,
      down,
      hpLabel: down ? t(isVehicle ? "AIM.window.hp.destroyed" : "AIM.window.hp.down") : t("AIM.window.rail.hp"),
      hpShare: share(value, max),
      tempFrom: share(Math.max(0, value - temp), max),
      tempShare: share(Math.min(temp, value), max),
      beat: heartbeatFor(value, max),
      hpInfo: info.join(" · "),
      dice: Array.from({ length: rail.hitDice.max }, (_, i) => i < rail.hitDice.value),
      slotTotals,
      deathMarks: {
        success: [0, 1, 2].map((i) => i < success),
        failure: [0, 1, 2].map((i) => i < failure)
      },
      deathState: success >= 3 ? "is-stable" : failure >= 3 ? "is-dead" : "",
      deathText: success >= 3 ? t("AIM.window.death.stable") : failure >= 3 ? t("AIM.window.death.dead") : "",
      deathOpen: success < 3 && failure < 3,
      shortRestHint: rail.hitDice.value ? t("AIM.window.rest.shortHint", { n: rail.hitDice.value }) : t("AIM.window.rest.noDice"),
      initText: signed(rail.init),
      profText: signed(rail.prof),
      casting: rail.casting.map((c) => ({ ...c, attackText: signed(c.attack) })),
      exhaustionPips: Array.from({ length: rail.exhaustion.max }, (_, i) => i < rail.exhaustion.value),
      effects: temporaryEffects(actor)
    },
    blocks,
    isGM: game.user.isGM,
    hpSteps: [-5, -1, 1, 5].map((step) => ({ step, label: signed(step) }))
  };
}

/** What the rail compares between renders to play its reactive effects. */
export function railSnapshot(actor) {
  const rail = readRail(actor);
  return {
    hp: rail.hp.value,
    max: rail.hp.max,
    temp: rail.hp.temp,
    dice: rail.hitDice.value,
    slots: rail.slots.reduce((sum, slot) => sum + slot.value, 0),
    success: rail.death.success,
    failure: rail.death.failure,
    inspiration: rail.inspiration,
    concentration: rail.concentration.join("|")
  };
}

/* ─── Particles and floating numbers (reactive effects: «Все» and «Сдержанно») ─── */

function floatText(root, anchor, text, tone) {
  const box = root.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const el = document.createElement("span");
  el.className = `aim-float is-${tone}`;
  el.textContent = text;
  el.style.left = `${at.left - box.left + at.width / 2}px`;
  el.style.top = `${at.top - box.top}px`;
  root.append(el);
  el.animate([{ opacity: 0, transform: "translate(-50%, 4px)" }, { opacity: 1, transform: "translate(-50%, -10px)", offset: 0.2 }, { opacity: 0, transform: "translate(-50%, -34px)" }], { duration: 1100, easing: "ease-out" }).finished.then(() => el.remove());
}

function burst(root, anchor, tone, count = 10, reach = 30) {
  const box = root.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    el.className = `aim-spark is-${tone}`;
    el.style.left = `${at.left - box.left + at.width / 2}px`;
    el.style.top = `${at.top - box.top + at.height / 2}px`;
    root.append(el);
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const dist = reach * (0.6 + Math.random() * 0.6);
    el.animate([{ transform: "translate(0, 0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.3)`, opacity: 0 }], { duration: 600 + Math.random() * 300, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }).finished.then(() => el.remove());
  }
}

function pulse(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  el.addEventListener("animationend", () => el.classList.remove(className), { once: true });
}

/**
 * Plays what changed since the last render: HP fall and rise, temporary HP gained, absorbed or broken,
 * hit dice and slots used or restored, death save marks, inspiration and concentration.
 * @param {HTMLElement} root  the window element
 * @param {Object|null} prev  snapshot before the render
 * @param {Object} next       snapshot after it
 */
export function playRailChanges(root, prev, next) {
  if (!prev || root.dataset.motion === "off") return;
  const bar = root.querySelector("[data-hp-bar]");
  const value = root.querySelector("[data-hp-value]") ?? root.querySelector(".aim-hp-top");
  const card = root.querySelector("[data-hpcard]");
  if (bar && prev.max === next.max && prev.hp !== next.hp) {
    const fill = bar.querySelector("[data-hp-fill]");
    const ghost = bar.querySelector("[data-hp-ghost]");
    const from = share(prev.hp, prev.max);
    if (next.hp < prev.hp) {
      // the fill drops at once; a pale ghost of the old value lingers, then drains
      ghost.animate([{ width: `${from * 100}%` }, { width: `${from * 100}%`, offset: 0.35 }, { width: `${share(next.hp, next.max) * 100}%` }], { duration: 1080, easing: SETTLE });
      pulse(bar, "is-hit");
      floatText(root, value, `−${prev.hp - next.hp}`, "damage");
    } else {
      fill.animate([{ width: `${from * 100}%` }, { width: `${share(next.hp, next.max) * 100}%` }], { duration: 420, easing: SETTLE });
      pulse(bar, "is-heal");
      floatText(root, value, `+${next.hp - prev.hp}`, "heal");
      if (prev.hp <= 0) pulse(card, "is-revive");
    }
    if (value?.matches?.("[data-hp-value]")) countTo(value, prev.hp, next.hp);
  }
  if (card && next.temp !== prev.temp) {
    const band = root.querySelector("[data-hp-tempband]");
    if (next.temp > prev.temp) {
      pulse(card, "is-shield-up");
      floatText(root, value, t("AIM.window.hp.tempGain", { n: next.temp - prev.temp }), "temp");
      if (band) burst(root, band, "temp", 6, 22);
    } else {
      floatText(root, value, t("AIM.window.hp.tempLoss", { n: prev.temp - next.temp }), "temp");
      if (next.temp > 0) { pulse(band, "is-absorb"); if (band) burst(root, band, "temp", 6, 26); }
      else { pulse(card, "is-shield-break"); burst(root, bar ?? card, "temp", 16, 46); }
    }
  }
  if (next.dice < prev.dice) pulse(root.querySelector('[data-block="hitDice"]'), "is-spin");
  if (next.dice > prev.dice || next.slots > prev.slots) popIn(root);
  if (next.success > prev.success) burst(root, root.querySelector(".aim-death"), "heal", 10, 34);
  if (next.failure > prev.failure) { burst(root, root.querySelector(".aim-death"), "damage", 10, 34); pulse(root.querySelector(".aim-death"), "is-refused"); }
  if (next.inspiration && !prev.inspiration) {
    const chip = root.querySelector('[data-action="toggleInspiration"]');
    pulse(chip, "is-pop");
    burst(root, chip, "gold", 10, 30);
  }
  if (next.concentration && next.concentration !== prev.concentration) pulse(root.querySelector(".aim-chip.is-conc"), "is-pop");
}

/** Restored dice, runes and pips pop back in one after another, 70 ms apart. */
export function popIn(root) {
  const items = [...root.querySelectorAll(".aim-die:not(.is-spent), [data-rune]:not(.is-spent)")];
  items.forEach((el, i) => el.animate([{ transform: "scale(0.2)", opacity: 0 }, { transform: "scale(1.25)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], { duration: 360, delay: i * 70, easing: SETTLE, fill: "backwards" }));
}

function countTo(el, from, to) {
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 420);
    el.textContent = String(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A long rest lets night fall over the window, then a warm dawn; restored resources pop in after it. */
export async function playLongRest(root) {
  if (root.dataset.motion === "off") return;
  const night = document.createElement("div");
  night.className = "aim-night";
  root.querySelector(".window-content")?.append(night);
  await night.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "forwards" }).finished;
  night.classList.add("is-dawn");
  await night.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 250, fill: "forwards" }).finished;
  night.remove();
  popIn(root);
}

/** Intact runes glint one at a time, at random, about every 2 seconds (an ambient effect). */
export function startRuneGlints(app) {
  return setInterval(() => {
    const root = app.element;
    if (!root || document.hidden || root.dataset.motion !== "full" || !root.classList.contains("is-front")) return;
    const runes = [...root.querySelectorAll("[data-rune]:not(.is-spent)")].filter((el) => el.offsetParent);
    if (runes.length) pulse(runes[Math.floor(Math.random() * runes.length)], "is-glint");
  }, 1800);
}

/** dnd5e's own dialogs for AC, initiative and movement (right click on the stat). */
export function openStatConfig(actor, config) {
  const apps = globalThis.dnd5e?.applications ?? {};
  const Cls = { ac: apps.actor?.ArmorClassConfig, init: apps.actor?.InitiativeConfig, movement: apps.shared?.MovementSensesConfig ?? apps.actor?.MovementSensesConfig }[config];
  if (!Cls) return;
  new Cls(config === "movement" ? { document: actor, type: "movement" } : { document: actor }).render({ force: true });
}

export const REST_HOOK = "dnd5e.restCompleted";
