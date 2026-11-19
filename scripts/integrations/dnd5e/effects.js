// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Effects & Statuses)
// ─────────────────────────────────────────────────────────

import { attunementRequirement, isItemAttuned } from "../../core/attunement.js";
import { getDnd5eConfig, localizeOr } from "./common.js";

/**
 * The actor's effects as dnd5e's sheet lists them (`allApplicableEffects`, without those of an inactive origin and,
 * for players, of an unidentified item): state, statuses, time left, source and why dnd5e suppresses one
 * (`isSuppressed`: its item unequipped or unattuned). Foundry 14 reports a permanent effect's remainder as infinite.
 */
export function readEffects(actor, { isGM = false } = {}) {
  const entries = [];
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    const item = effect.parent?.documentName === "Item" ? effect.parent : null;
    if (effect.dependentOrigin?.active === false || (item?.system?.identified === false && !isGM)) continue;
    const remaining = effect.duration?.remaining;
    let source = item?.name ?? "";
    if (!source && effect.origin) {
      try { source = globalThis.foundry?.utils?.fromUuidSync?.(effect.origin, { relative: actor, strict: false })?.name ?? ""; }
      catch { source = ""; }
    }
    const suppressed = Boolean(effect.isSuppressed);
    entries.push({
      id: effect.id,
      uuid: effect.uuid,
      itemId: item?.id ?? null,
      relativeId: effect.getRelativeUUID?.(actor) ?? effect.uuid,
      name: effect.name,
      img: effect.img,
      disabled: Boolean(effect.disabled),
      suppressed,
      suppressedBy: !suppressed ? null : item?.system?.equipped === false ? "unequipped"
        : attunementRequirement(item) === "required" && !isItemAttuned(item) ? "unattuned" : "other",
      temporary: Boolean(effect.isTemporary),
      statuses: [...(effect.statuses ?? [])],
      onActor: effect.parent === actor,
      time: Number.isFinite(remaining) && remaining > 0 ? effect.duration.label ?? "" : "",
      source: source === effect.name ? "" : source
    });
  }
  return entries;
}

/**
 * An effect's changes (Foundry 14 keeps them in `system.changes`, typed by `type` instead of `mode`), each labelled
 * by the nearest labelled data field of the actor (a derived key such as `attributes.ac.bonus` takes «Armor Class»),
 * otherwise by its key. An ability or skill key names it: `abilities.con.value` reads «Constitution».
 */
export function readEffectChanges(effect, actor) {
  const config = getDnd5eConfig();
  return [...(effect?.system?.changes ?? effect?.changes ?? [])].map(({ key, type, value }) => {
    const parts = String(key).replace(/^system\./, "").split(".");
    let label = null;
    for (let n = parts.length; n > 0 && !label; n--) {
      try { label = actor?.system?.schema?.getField?.(parts.slice(0, n).join("."))?.label || null; }
      catch { label = null; }
    }
    label = label ? localizeOr(label, label) : key;
    const own = { abilities: config.abilities, skills: config.skills }[parts[0]]?.[parts[1]]?.label;
    if (own) label = parts[2] === "value" || parts.length === 2 ? localizeOr(own, own) : `${localizeOr(own, own)}: ${label}`;
    return { key, type, value, label };
  });
}

/**
 * The statuses the token HUD offers (`CONFIG.statusEffects` without `hud: false`), less exhaustion and
 * concentration, which keep their rail chips; a condition is a non-pseudo entry of `DND5E.conditionTypes`. An
 * actor's condition immunities (`traits.ci`) are marked: such a condition is removed as soon as it is applied.
 */
export function readStatusEffects(actor) {
  const conditions = getDnd5eConfig().conditionTypes ?? {};
  const immune = new Set(actor?.system?.traits?.ci?.value ?? []);
  const concentrating = globalThis.CONFIG?.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  return (globalThis.CONFIG?.statusEffects ?? [])
    .filter((s) => s.hud !== false && s.id !== "exhaustion" && s.id !== concentrating)
    .map((s) => ({ id: s.id, name: localizeOr(s.name, s.name ?? s.id), img: s.img, condition: Boolean(conditions[s.id] && !conditions[s.id].pseudo), immune: immune.has(s.id) }));
}
