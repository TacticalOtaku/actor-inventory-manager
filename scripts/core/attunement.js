// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Attunement State (version-agnostic)
// ─────────────────────────────────────────────────────────

/**
 * Attunement is modelled differently across dnd5e versions:
 *
 * - 5.x: `system.attunement` is a requirement string ("" | "required" | "optional")
 *        and `system.attuned` is the boolean state.
 * - 3.x/4.x: `system.attunement` is numeric (0 none / 1 required / 2 attuned).
 *
 * These helpers are the single place that knows about both shapes.
 */

import { getActorPaperdollTemplate } from "./paperdoll-templates.js";

const LEGACY_ATTUNED = 2;
const LEGACY_REQUIRED = 1;

/**
 * Is the item currently attuned to its owner?
 * @param {Object} item
 * @returns {boolean}
 */
export function isItemAttuned(item) {
  if (!item) return false;
  const system = item.system ?? {};
  if (typeof system.attuned === "boolean") return system.attuned;
  const legacy = system.attunement;
  if (typeof legacy === "number") return legacy === LEGACY_ATTUNED;
  return String(legacy ?? "").toLowerCase() === "attuned";
}

/**
 * Does the item need attunement at all (whether or not it is attuned)?
 * @param {Object} item
 * @returns {boolean}
 */
export function itemRequiresAttunement(item) {
  if (!item) return false;
  const system = item.system ?? {};
  const value = system.attunement;
  if (typeof value === "number") return value >= LEGACY_REQUIRED;
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "required" || normalized === "optional") return true;
  // A legacy document already flipped to "attuned" still requires attunement.
  return normalized === "attuned";
}

/**
 * Compact status token used by the UI layer.
 * @param {Object} item
 * @returns {"attuned"|"required"|"none"}
 */
export function getAttunementStatus(item) {
  if (isItemAttuned(item)) return "attuned";
  return itemRequiresAttunement(item) ? "required" : "none";
}

/**
 * Count the items an actor is currently attuned to.
 * @param {Object} actor
 * @returns {number}
 */
export function countAttunedItems(actor) {
  if (!actor?.items) return 0;
  let count = 0;
  for (const item of actor.items.values()) {
    if (isItemAttuned(item)) count += 1;
  }
  return count;
}

/**
 * Resolve the attunement cap for an actor.
 * The system value is authoritative: applying a paperdoll template writes its
 * cap there, and features such as Magic Item Adept raise it through effects.
 * The template's cap is only a fallback for actors without the system field.
 * @param {Object} actor
 * @returns {number}
 */
export function getActorAttunementMax(actor) {
  if (!actor) return 3;
  const systemMax = actor.system?.attributes?.attunement?.max;
  if (systemMax !== null && systemMax !== undefined && systemMax !== "") {
    const parsed = Number(systemMax);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return getActorPaperdollTemplate(actor).attunementMax ?? 3;
}
