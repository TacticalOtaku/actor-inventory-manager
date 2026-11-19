// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Shared Helpers)
// ─────────────────────────────────────────────────────────

import { getSystemWeightUnit, num } from "../../core/weight-calculator.js";

export { getSystemWeightUnit };

/**
 * Localize a key, falling back to English when there is no translation (or no Foundry).
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
export function localizeOr(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

/**
 * Short label for a unit from a CONFIG.DND5E unit table (movementUnits,
 * distanceUnits, weightUnits). Unknown units show the key itself.
 * @param {string} tableName
 * @param {string} unit
 * @returns {string}
 */
export function unitAbbreviation(tableName, unit) {
  const abbreviation = getDnd5eConfig()[tableName]?.[unit]?.abbreviation;
  return abbreviation ? localizeOr(abbreviation, abbreviation) : unit;
}

/**
 * Get DnD5e config object safely
 */
export function getDnd5eConfig() {
  return globalThis.CONFIG?.DND5E ?? {};
}

/**
 * Display name of an item rarity, empty for common items and rarities the system does not define
 * (custom ones added by rarity-colour modules). dnd5e 5.3.3 pre-localizes CONFIG.DND5E.itemRarity.
 * @param {string} rarityKey  normalized key, e.g. "veryRare"
 * @returns {string}
 */
export function rarityLabel(rarityKey) {
  if (!rarityKey || rarityKey === "common") return "";
  const label = getDnd5eConfig().itemRarity?.[rarityKey];
  return typeof label === "string" ? localizeOr(label, label) : "";
}

/** dnd5e's `concealDetails`: an unidentified item keeps its price, rarity, properties and charges from players. */
export function concealsDetails(item) {
  return item?.system?.identified === false && !globalThis.game?.user?.isGM;
}

/**
 * Resolve the activation descriptor of an item.
 * Activation lives on activities; spells without one still carry `system.activation`.
 * @param {Object} item
 * @returns {{ type: string, value: number|null, config: Object }}
 */
export function resolveItemActivation(item) {
  const system = item?.system ?? {};
  const first = system.activities?.contents?.[0];
  const activation = first?.activation?.type ? first.activation : (system.activation ?? {});
  const type = activation.type || "";
  return {
    type,
    value: activation.value ?? null,
    config: getDnd5eConfig().activityActivationTypes?.[type] ?? {}
  };
}

/**
 * Resolve limited-use state from dnd5e's max/spent pair.
 * @param {Object} item
 * @returns {{ hasUses: boolean, usesDisplay: string }}
 */
export function resolveItemUses(item) {
  const system = item?.system ?? {};
  const uses = system.uses ?? {};
  const max = num(uses.max, 0);
  const value = num(uses.value, Math.max(0, max - num(uses.spent, 0)));
  const hasUses = max > 0;
  return { hasUses, usesDisplay: hasUses ? `${value} / ${max}` : "" };
}
