// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the rail: context and the effects that answer changes
// ─────────────────────────────────────────────────────────

import { crLabel, railBlocksFor } from "../core/actor-window.js";
import { heartbeatFor, railEvents } from "../core/vitals.js";
import { readNpc, readRail } from "../integrations/dnd5e.js";
import { playBurst } from "./bursts.js";
import { buildVehicleRail } from "./vehicle.js";
import { SETTLE } from "./motion.js";
import { t } from "./html.js";
import { signed } from "../core/overview.js";

const share = (part, whole) => (whole > 0 ? Math.max(0, Math.min(1, part / whole)).toFixed(4) : 0);

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
  const npc = readNpc(actor);
  const legendary = npc && [["actions", npc.legendary.actions], ["resistance", npc.legendary.resistance]]
    .filter(([, pool]) => pool)
    .map(([kind, pool]) => ({ label: t(`AIM.window.legendary.${kind}`), ...pool, pips: Array.from({ length: pool.max }, (_, i) => i < pool.value) }));
  const blocks = Object.fromEntries(railBlocksFor(actor.type, { hasSpells, hasLegendary: Boolean(legendary?.length) }, hiddenBlocks).map(({ id, shown }) => [id, shown]));
  blocks.rest &&= restAllowed && canEdit;
  blocks.spellcasting &&= rail.casting.length > 0;
  blocks.spellSlots &&= rail.slots.length > 0;
  const info = [t("AIM.window.hp.max", { max })];
  if (temp) info.push(t("AIM.window.hp.tempInfo", { temp }));
  if (value < max) info.push(`−${max - value}`);
  return {
    rail: {
      ...rail,
      down,
      // A wrecked vehicle has no death saves.
      dying: down && !isVehicle,
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
      acHint: acBreakdown(rail),
      profText: signed(rail.prof),
      casting: rail.casting.map((c) => ({ ...c, attackText: signed(c.attack) })),
      exhaustionPips: Array.from({ length: rail.exhaustion.max }, (_, i) => i < rail.exhaustion.value),
      // Heroic inspiration is a character's; an NPC's chips are exhaustion and concentration.
      hasInspiration: actor.type === "character",
      vehicle: isVehicle ? buildVehicleRail(actor) : null,
      cr: npc && { text: crLabel(npc.cr), hint: t("AIM.window.npc.xp", { xp: npc.xp.toLocaleString(game.i18n.lang) }) },
      legendary
    },
    blocks,
    isGM: game.user.isGM,
    hpSteps: [-5, -1, 1, 5].map((step) => ({ step, label: signed(step) }))
  };
}

/** «Доспех 14 (Чешуйчатый) · Ловкость +2 · Щит +2 = 18», then how to open dnd5e's settings. */
function acBreakdown({ ac, acParts: p }) {
  const parts = p.calc === "default"
    ? [t("AIM.window.stats.acArmor", { n: p.armor }) + (p.armorName ? ` (${p.armorName})` : ""), t("AIM.window.stats.acDex", { n: signed(p.dex) })]
    : [t("AIM.window.stats.acBase", { n: p.base })];
  if (p.shield) parts.push(t("AIM.window.stats.acShield", { n: signed(p.shield) }));
  if (p.bonus) parts.push(t("AIM.window.stats.acBonus", { n: signed(p.bonus) }));
  if (p.cover) parts.push(t("AIM.window.stats.acCover", { n: signed(p.cover) }));
  return `${parts.join(" · ")} = ${ac}. ${t("AIM.window.stats.acHint")}`;
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

/* ─── Bursts and floating numbers (reactive effects: «Все» and «Сдержанно») ─── */

export function floatText(root, anchor, text, tone) {
  if (!anchor) return;
  const box = root.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const el = root.ownerDocument.createElement("span");
  el.className = `aim-float is-${tone}`;
  el.textContent = text;
  el.style.left = `${at.left - box.left + at.width / 2}px`;
  el.style.top = `${at.top - box.top}px`;
  root.append(el);
  el.animate([{ opacity: 0, transform: "translate(-50%, 4px)" }, { opacity: 1, transform: "translate(-50%, -10px)", offset: 0.2 }, { opacity: 0, transform: "translate(-50%, -34px)" }], { duration: 1100, easing: "ease-out" }).finished.then(() => el.remove());
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
  if (!prev || root.dataset.motion === "off") return false;
  const bar = root.querySelector("[data-hp-bar]");
  const value = root.querySelector("[data-hp-value]") ?? root.querySelector(".aim-hp-top");
  const card = root.querySelector("[data-hpcard]");
  const band = root.querySelector("[data-hp-tempband]");
  const death = root.querySelector(".aim-death");
  const events = railEvents(prev, next);
  for (const event of events) {
    if (event === "hit" && bar) {
      // the fill drops at once; a pale ghost of the old value lingers, then drains (a transform, not a width: #9)
      const from = Number(share(prev.hp, prev.max));
      const ghost = bar.querySelector("[data-hp-ghost]");
      ghost.style.width = `${from * 100}%`;
      const left = from ? Number(share(next.hp, next.max)) / from : 0;
      ghost.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(1)", offset: 0.35 }, { transform: `scaleX(${left})` }], { duration: 1080, easing: SETTLE })
        .finished.then(() => ghost.style.removeProperty("width"), () => ghost.style.removeProperty("width"));
      pulse(bar, "is-hit");
      floatText(root, value, `−${prev.hp - next.hp}`, "damage");
      playBurst(root, bar, "hit", { at: Number(share(next.hp, next.max)) });
    } else if (event === "heal" && bar) {
      // the fill grows from the old value: it already has the new width and scales up into it
      const to = Number(share(next.hp, next.max));
      if (to) bar.querySelector("[data-hp-fill]").animate([{ transform: `scaleX(${Number(share(prev.hp, prev.max)) / to})` }, { transform: "scaleX(1)" }], { duration: 420, easing: SETTLE });
      pulse(bar, "is-heal");
      floatText(root, value, `+${next.hp - prev.hp}`, "heal");
      playBurst(root, bar, "heal");
    } else if (event === "revive" && card) {
      pulse(card, "is-revive");
      playBurst(root, card, "revive");
    } else if (event === "shieldUp" && card) {
      pulse(card, "is-shield-up");
      floatText(root, value, t("AIM.window.hp.tempGain", { n: next.temp - prev.temp }), "temp");
      playBurst(root, card, "shieldUp");
    } else if (event === "absorb") {
      floatText(root, value, t("AIM.window.hp.tempLoss", { n: prev.temp - next.temp }), "temp");
      pulse(band, "is-absorb");
      playBurst(root, band, "absorb");
    } else if (event === "shieldBreak") {
      floatText(root, value, t("AIM.window.hp.tempLoss", { n: prev.temp - next.temp }), "temp");
      pulse(card, "is-shield-break");
      playBurst(root, bar ?? card, "shieldBreak");
    } else if (event === "diceSpent") {
      // Spent dice follow the intact ones: the first spent one is the die just rolled.
      const dice = root.querySelector('[data-block="hitDice"]');
      const die = dice?.querySelector(".aim-die.is-spent") ?? dice?.querySelector(".aim-die");
      pulse(die, "is-spin");
      playBurst(root, die, "die");
    } else if (event === "restored" && !root.dataset.resting) popIn(root);
    else if (event === "deathSuccess") playBurst(root, death, "deathSuccess");
    else if (event === "deathFail") { playBurst(root, death, "deathFail"); pulse(death, "is-refused"); }
    else if (event === "inspired") {
      const chip = root.querySelector('[data-action="toggleInspiration"]');
      pulse(chip, "is-pop");
      playBurst(root, chip, "inspired");
    } else if (event === "concentration") pulse(root.querySelector(".aim-chip.is-conc"), "is-pop");
  }
  if (events.includes("hit") || events.includes("heal")) {
    if (value?.matches?.("[data-hp-value]")) countTo(value, prev.hp, next.hp);
  }
  return events.length > 0;
}

/** Restored dice, runes and pips pop back in one after another, 70 ms apart; a cascade stops at 24 (#9). */
export function popIn(root) {
  const items = [...root.querySelectorAll(".aim-die:not(.is-spent), [data-rune]:not(.is-spent)")].slice(0, 24);
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

/**
 * Before a long rest refills the actor, the intact dice and runes hide, so they come back only after the dawn. A rest
 * that another module stops never reaches the dawn: they show again after a while.
 */
export function holdRestored(root) {
  if (!root || root.dataset.motion === "off") return;
  root.dataset.resting = "";
  clearTimeout(root._restHold);
  root._restHold = setTimeout(() => delete root.dataset.resting, 4000);
}

/** A long rest lets night fall over the window, then a warm dawn; restored resources pop in after it. */
export async function playLongRest(root) {
  if (root.dataset.motion === "off") return;
  clearTimeout(root._restHold);
  const night = document.createElement("div");
  night.className = "aim-night";
  root.querySelector(".window-content")?.append(night);
  // The stars come out as night falls; the burst's own dawn rises as the night lifts.
  playBurst(root, root.querySelector(".window-content") ?? root, "night");
  await night.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: "forwards" }).finished;
  night.classList.add("is-dawn");
  await night.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 250, fill: "forwards" }).finished;
  night.remove();
  delete root.dataset.resting;
  popIn(root);
}

/** Intact runes and lit slot gems glint one at a time, at random, about every 2 seconds (an ambient effect). */
export function startRuneGlints(app) {
  return setInterval(() => {
    const root = app.element;
    if (!root || document.hidden || root.dataset.motion !== "full" || !root.classList.contains("is-front")) return;
    const runes = [...root.querySelectorAll("[data-rune]:not(.is-spent), .aim-gem.is-lit")].filter((el) => el.offsetParent);
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
