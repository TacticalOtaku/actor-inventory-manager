// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Attunement State
// ─────────────────────────────────────────────────────────

/**
 * `system.attunement` is the requirement ("" | "required" | "optional") and
 * `system.attuned` is the boolean state. These helpers are the single place
 * that reads them.
 */

import { getActorPaperdollTemplate } from "./paperdoll-templates.js";

/**
 * Is the item currently attuned to its owner?
 * @param {Object} item
 * @returns {boolean}
 */
export function isItemAttuned(item) {
  return item?.system?.attuned === true;
}

/**
 * Does the item need attunement at all (whether or not it is attuned)?
 * @param {Object} item
 * @returns {boolean}
 */
export function itemRequiresAttunement(item) {
  const value = item?.system?.attunement;
  return value === "required" || value === "optional";
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

/**
 * The attunement cap stored on the actor, before effects raise it.
 * Editors show and write this value: writing the prepared one back would bake
 * effect bonuses such as Magic Item Adept into the base.
 * @param {Object} actor
 * @returns {number|null} null when the actor stores no cap
 */
export function getActorSourceAttunementMax(actor) {
  const stored = actor?._source?.system?.attributes?.attunement?.max;
  if (stored === null || stored === undefined || stored === "") return null;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
