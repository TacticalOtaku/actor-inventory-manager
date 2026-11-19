// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Spells)
// ─────────────────────────────────────────────────────────

import { num } from "../../core/weight-calculator.js";
import { getDnd5eConfig } from "./common.js";

/**
 * Resolve the usable maximum for a spell slot entry.
 * `override` is a nullable NumberField in dnd5e - only an explicit number wins
 * over the derived `max`.
 * @param {Object} slotData
 * @returns {number}
 */
export function resolveSpellSlotMax(slotData) {
  const override = slotData?.override;
  if (override !== null && override !== undefined && override !== "") {
    const parsed = Number(override);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return Math.max(0, num(slotData?.max, 0));
}

/**
 * Extract active spell slots for an actor
 * @param {Object} actor
 * @returns {Array<Object>}
 */
export function extractSpellSlots(actor) {
  if (!actor) return [];
  const spells = actor.system?.spells ?? {};
  const slots = [];

  const buildSlot = (key, data, label, level) => {
    const max = resolveSpellSlotMax(data);
    if (max <= 0) return null;
    const value = Math.max(0, Math.min(max, num(data.value, 0)));
    return {
      key,
      label,
      level,
      value,
      max,
      isEmpty: value === 0,
      isFull: value === max,
      pips: Array.from({ length: max }, (_, i) => ({ index: i, filled: i < value }))
    };
  };

  // Pact Magic (Warlock)
  const pactSlot = buildSlot(
    "pact",
    spells.pact ?? {},
    globalThis.game?.i18n?.localize("AIM.spells.pact") || "Pact",
    num(spells.pact?.level, 1)
  );
  if (pactSlot) slots.push(pactSlot);

  // Regular Spell Slots (1st to 9th circle)
  for (let lvl = 1; lvl <= 9; lvl++) {
    const key = `spell${lvl}`;
    const slot = buildSlot(
      key,
      spells[key] ?? {},
      globalThis.game?.i18n?.format("AIM.spells.levelSlot", { level: lvl }) || `Lvl ${lvl}`,
      lvl
    );
    if (slot) slots.push(slot);
  }

  return slots;
}

/**
 * Resolve the preparation state of a spell: `system.method` ("spell" | "pact" |
 * "atwill" | "innate" | "ritual") plus numeric `system.prepared`
 * (0 unprepared, 1 prepared, 2 always prepared).
 * @param {Object} spellItem
 * @returns {{ method: string, prepared: number, isPrepared: boolean, isAlways: boolean, canPrepare: boolean }}
 */
export function resolveSpellPreparation(spellItem) {
  const system = spellItem?.system ?? {};
  const level = num(system.level, 0);
  const method = system.method || "";
  const prepared = num(system.prepared, 0);
  const spellcasting = getDnd5eConfig().spellcasting ?? {};
  // `prepares` is declared for the "spell" and "pact" methods.
  const methodPrepares = spellcasting[method]
    ? Boolean(spellcasting[method].prepares)
    : (method === "spell" || method === "pact");
  return {
    method,
    prepared,
    isPrepared: prepared >= 1 || level === 0,
    isAlways: prepared >= 2,
    canPrepare: methodPrepares && level > 0
  };
}

/** Whether the spell's class has no preparation limit, so its spells are known rather than prepared. */
function knownByClass(actor, identifier) {
  const cls = identifier ? actor?.spellcastingClasses?.[identifier] : null;
  return Boolean(cls) && !(num(cls.system?.spellcasting?.preparation?.max, 0) > 0);
}

/**
 * Whether a spell has a prepare/unprepare toggle, the same rule the spells tab uses: a levelled spell of a method
 * that prepares (dnd5e 5.3.3 `CONFIG.DND5E.spellcasting[method].prepares`), not always prepared (`prepared` 2), and
 * of a class with a preparation limit.
 * @param {Object} item
 * @param {Object} [actor]  the spell's owner, its parent by default
 */
export function hasPreparationToggle(item, actor = item?.actor) {
  const preparation = resolveSpellPreparation(item);
  return preparation.canPrepare && !preparation.isAlways && !knownByClass(actor, item?.system?.classIdentifier);
}

/**
 * The spells the spells tab lists. dnd5e 5.3.3 shapes: `method` (spell, pact, innate, atwill, ritual) and numeric
 * `prepared` (0, 1, 2 always); concentration and ritual are `properties`; the item's prepared `labels` carry
 * activation, range, school and `components.vsm`; materials are `materials` {value, cost}; uses are `uses.max`/`spent`;
 * `classIdentifier` names the class the spell came from (`actor.spellcastingClasses`).
 * @param {Object} actor
 */
export function readSpellbook(actor) {
  return [...(actor?.items ?? [])].filter((item) => item.type === "spell").map((item) => {
    const system = item.system ?? {};
    const labels = item.labels ?? {};
    const properties = system.properties ?? new Set();
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      level: num(system.level, 0),
      school: system.school ?? "",
      schoolLabel: labels.school ?? "",
      method: system.method ?? "",
      prepared: num(system.prepared, 0),
      // A class without a preparation limit (no formula, a 2014 warlock or sorcerer) knows its spells instead.
      known: knownByClass(actor, system.classIdentifier),
      canPrepare: hasPreparationToggle(item, actor),
      ritual: properties.has("ritual"),
      concentration: properties.has("concentration"),
      activation: system.activation?.type ?? "",
      activationLabel: labels.activation ?? "",
      range: labels.range ?? system.range?.labels?.range ?? "",
      components: labels.components?.vsm ?? "",
      materials: system.materials?.value ? { text: system.materials.value, cost: num(system.materials.cost, 0) } : null,
      uses: max > 0 ? { value: Math.max(0, max - spent), max, spent } : null,
      sort: num(item.sort, 0)
    };
  });
}

/**
 * Prepared spells against each casting class's limit. dnd5e 5.3.3 counts them on the class:
 * `actor.spellcastingClasses[identifier].system.spellcasting.preparation` {value, max}.
 * @param {Object} actor
 * @returns {{id: string, name: string, value: number, max: number}[]}
 */
export function readSpellPreparation(actor) {
  return Object.values(actor?.spellcastingClasses ?? {}).map((cls) => ({
    id: cls.id,
    name: cls.name,
    value: num(cls.system?.spellcasting?.preparation?.value, 0),
    max: num(cls.system?.spellcasting?.preparation?.max, 0)
  }));
}

/**
 * Toggle prepared state of a spell
 * @param {Object} spellItem
 */
export async function toggleSpellPreparation(spellItem) {
  if (!spellItem || spellItem.type !== "spell") return;
  const prep = resolveSpellPreparation(spellItem);

  // "Always prepared" is a property of the spell, not a per-day choice.
  if (prep.isAlways) return;
  if (!prep.canPrepare) return;

  return spellItem.update({ "system.prepared": prep.prepared >= 1 ? 0 : 1 });
}
