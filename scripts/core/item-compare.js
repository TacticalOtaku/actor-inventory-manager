// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Compare (Pure Logic)
// ─────────────────────────────────────────────────────────

import { findEquipSlot, getActorEquippedMap, getTwoHandLayout, isOffHandLockedBy2H } from "./equipment-rules.js";
import { canItemBeEquipped, classifyItem, getValidSlotsForItem, isTwoHandedWeapon } from "./item-classifier.js";
import { getActorSlots } from "./paperdoll-templates.js";

const COMPARABLE_KEYS = new Set(["armor", "toHit", "damage"]);

/**
 * Find equipped item(s) on the actor that occupy the slot(s) a backpack item would target.
 * Returns at most `max` ranked candidates: same classification first, then `findEquipSlot` match,
 * then valid-slot order (including a 2H main-hand weapon blocking an off-hand item).
 * @param {Object} actor
 * @param {Object} hoveredItem
 * @param {{slotMap?: Map<string, Object>, max?: number}} [options]
 * @returns {Array<{slotId: string, slotLabel: string, item: Object}>}
 */
export function findCompareTargets(actor, hoveredItem, { slotMap = getActorEquippedMap(actor), max = 1 } = {}) {
  if (!actor || !hoveredItem || hoveredItem.system?.equipped || !canItemBeEquipped(hoveredItem)) {
    return [];
  }
  const validSlots = getValidSlotsForItem(hoveredItem, actor);
  if (!validSlots.length) return [];

  const slots = getActorSlots(actor) ?? [];
  const labelOf = new Map(slots.map((slot) => [slot.id, slot.label ?? slot.id]));
  const raw = [];
  const seenItems = new Set();

  for (const slotId of validSlots) {
    const equipped = slotMap.get(slotId);
    if (!equipped || equipped.id === hoveredItem.id || seenItems.has(equipped.id)) continue;
    seenItems.add(equipped.id);
    raw.push({ slotId, slotLabel: labelOf.get(slotId) ?? slotId, item: equipped });
  }

  // If the hovered item goes into a locked off hand, also surface the two-handed weapon locking it.
  if (isOffHandLockedBy2H(slotMap, actor)) {
    const layout = getTwoHandLayout(actor);
    if (validSlots.some((slotId) => layout.offSlotIds.includes(slotId))) {
      for (const mainSlotId of layout.mainSlotIds) {
        const twoHanded = slotMap.get(mainSlotId);
        if (twoHanded && isTwoHandedWeapon(twoHanded) && twoHanded.id !== hoveredItem.id && !seenItems.has(twoHanded.id)) {
          seenItems.add(twoHanded.id);
          raw.push({ slotId: mainSlotId, slotLabel: labelOf.get(mainSlotId) ?? mainSlotId, item: twoHanded });
        }
      }
    }
  }

  if (raw.length <= 1) return raw.slice(0, max);

  const hoveredClass = classifyItem(hoveredItem);
  const preferredSlot = findEquipSlot(actor, hoveredItem, slotMap);

  const rank = (entry) => {
    const sameClass = classifyItem(entry.item) === hoveredClass ? 0 : 1;
    const samePreferred = entry.slotId === preferredSlot ? 0 : 1;
    return [sameClass, samePreferred];
  };

  return raw
    .map((entry, index) => ({ entry, index, key: rank(entry) }))
    .sort((a, b) => (a.key[0] - b.key[0]) || (a.key[1] - b.key[1]) || (a.index - b.index))
    .slice(0, max)
    .map(({ entry }) => entry);
}

function evalDamagePart(part) {
  const trimmed = String(part ?? "").trim();
  if (!trimmed || trimmed.includes("@")) return null;
  const norm = trimmed.replace(/\u2212/g, "-");
  const termRegex = /^\s*([+-]?\s*(?:\d+d\d+|\d+)(?:\s*[+-]\s*(?:\d+d\d+|\d+))*)/i;
  const match = termRegex.exec(norm);
  if (!match) return null;
  const rest = norm.slice(match[0].length);
  if (rest && !/^\s/.test(rest)) return null;
  const expr = match[1].replace(/\s+/g, "");
  const tokens = expr.match(/[+-]?(?:\d+d\d+|\d+)/gi);
  if (!tokens?.length) return null;
  let sum = 0;
  for (const token of tokens) {
    const sign = token.startsWith("-") ? -1 : 1;
    const body = token.replace(/^[+-]/, "");
    const diceMatch = /^(\d+)d(\d+)$/i.exec(body);
    if (diceMatch) {
      const count = Number(diceMatch[1]);
      const faces = Number(diceMatch[2]);
      if (faces <= 0) return null;
      sum += sign * count * ((faces + 1) / 2);
    } else {
      sum += sign * Number(body);
    }
  }
  return Number.isFinite(sum) ? sum : null;
}

/**
 * Compute expected average value of a dnd5e damage formula string (ignoring damage-type labels).
 * Handles comma-separated multi-part strings like "1d8 + 3 Slashing, 1d6 Fire".
 * Returns null if any non-empty part cannot be statically evaluated.
 * @param {string} text
 * @returns {number|null}
 */
export function averageDiceFormula(text) {
  const parts = String(text ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  let total = 0;
  for (const part of parts) {
    const val = evalDamagePart(part);
    if (val === null) return null;
    total += val;
  }
  return total;
}

/**
 * Parse a signed or unsigned numeric stat string like "+5", "−2", or "16".
 * @param {string} text
 * @returns {number|null}
 */
export function parseSignedNumber(text) {
  const norm = String(text ?? "").trim().replace(/\u2212/g, "-");
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function formatDelta(diff) {
  const rounded = Math.round(diff * 10) / 10;
  if (!rounded) return null;
  const absText = String(Math.abs(rounded));
  return {
    delta: rounded > 0 ? `+${absText}` : `−${absText}`,
    diff: rounded > 0 ? "better" : "worse"
  };
}

/**
 * Return a copy of `hoveredStats` annotated with `{ delta, diff }` for comparable stats
 * (`armor`, `toHit`, `damage`) where both items carry parseable values that differ.
 * @param {Array<{key: string, value: string}>} hoveredStats
 * @param {Array<{key: string, value: string}>} equippedStats
 * @returns {Array<{key: string, value: string, delta?: string, diff?: "better"|"worse"}>}
 */
export function annotateCompareStats(hoveredStats, equippedStats) {
  const equippedByKey = new Map((equippedStats ?? []).map((entry) => [entry.key, entry]));
  return (hoveredStats ?? []).map((stat) => {
    if (!COMPARABLE_KEYS.has(stat.key)) return { ...stat };
    const other = equippedByKey.get(stat.key);
    if (!other) return { ...stat };
    const parse = stat.key === "damage" ? averageDiceFormula : parseSignedNumber;
    const hoveredVal = parse(stat.value);
    const equippedVal = parse(other.value);
    if (hoveredVal === null || equippedVal === null) return { ...stat };
    const formatted = formatDelta(hoveredVal - equippedVal);
    return formatted ? { ...stat, ...formatted } : { ...stat };
  });
}
