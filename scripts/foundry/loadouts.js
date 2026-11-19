// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Equipment Loadouts (Foundry Adapter)
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { canEditActor, isSupportedActor } from "../core/actor-scope.js";
import {
  DEFAULT_LOADOUT_ICON,
  LOADOUT_ICONS,
  MAX_LOADOUTS,
  captureLoadout,
  normalizeLoadouts,
  removeLoadout,
  upsertLoadout
} from "../core/loadouts.js";
import { EquipService } from "./equipment.js";

function assertActorEditable(actor) {
  if (canEditActor(actor, globalThis.game?.user)) return true;
  globalThis.ui?.notifications?.warn(globalThis.game?.i18n?.localize("AIM.notifications.noPermission"));
  return false;
}

function enforcementMode() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "enforcementMode") ?? ENFORCEMENT_MODES.BLOCK;
  } catch {
    return ENFORCEMENT_MODES.BLOCK;
  }
}

function localize(key, data) {
  if (data) return globalThis.game?.i18n?.format?.(key, data) ?? key;
  return globalThis.game?.i18n?.localize?.(key) ?? key;
}

/**
 * Return all normalized saved equipment loadouts for a supported actor.
 * @param {Object} actor
 * @returns {Array<Object>}
 */
export function getActorLoadouts(actor) {
  if (!isSupportedActor(actor)) return [];
  return normalizeLoadouts(actor.getFlag?.(MODULE_ID, FLAGS.LOADOUTS));
}

/**
 * Save the actor's currently equipped paperdoll slots and managed slotless items as a loadout.
 * Pass `id` to update an existing loadout in place.
 * @param {Object} actor
 * @param {{id?: string, name?: string, icon?: string}} [options]
 * @returns {Promise<Object|null>}
 */
export async function saveActorLoadout(actor, { id, name, icon = DEFAULT_LOADOUT_ICON } = {}) {
  if (!isSupportedActor(actor) || !assertActorEditable(actor)) return null;
  const list = getActorLoadouts(actor);
  const loadoutId = String(id ?? "").trim()
    || globalThis.foundry?.utils?.randomID?.()
    || `ld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const resolvedName = String(name ?? "").trim()
    || localize("AIM.window.loadouts.defaultName", { n: list.length + 1 });
  const snapshot = captureLoadout(actor, {
    id: loadoutId,
    name: resolvedName,
    icon: LOADOUT_ICONS.includes(icon) ? icon : DEFAULT_LOADOUT_ICON
  });
  const result = upsertLoadout(list, snapshot);
  if (!result.ok) {
    if (result.code === "LIMIT") {
      globalThis.ui?.notifications?.warn(localize("AIM.window.loadouts.limit", { max: MAX_LOADOUTS }));
    } else {
      globalThis.ui?.notifications?.warn(localize("AIM.window.loadouts.nameRequired"));
    }
    return null;
  }
  await actor.setFlag(MODULE_ID, FLAGS.LOADOUTS, result.loadouts);
  return result.loadout;
}

/**
 * Rename or change the icon of an existing loadout without altering its captured items.
 * @param {Object} actor
 * @param {string} id
 * @param {{name?: string, icon?: string}} [patch]
 * @returns {Promise<Object|null>}
 */
export async function renameActorLoadout(actor, id, { name, icon } = {}) {
  if (!isSupportedActor(actor) || !assertActorEditable(actor)) return null;
  const list = getActorLoadouts(actor);
  const existing = list.find((entry) => entry.id === id);
  if (!existing) return null;
  const next = {
    ...existing,
    name: name !== undefined ? String(name).trim() : existing.name,
    icon: icon !== undefined && LOADOUT_ICONS.includes(icon) ? icon : existing.icon,
    updatedAt: Date.now()
  };
  const result = upsertLoadout(list, next);
  if (!result.ok) {
    globalThis.ui?.notifications?.warn(localize("AIM.window.loadouts.nameRequired"));
    return null;
  }
  await actor.setFlag(MODULE_ID, FLAGS.LOADOUTS, result.loadouts);
  return result.loadout;
}

/**
 * Delete a saved loadout from the actor.
 * @param {Object} actor
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteActorLoadout(actor, id) {
  if (!isSupportedActor(actor) || !assertActorEditable(actor)) return false;
  const list = getActorLoadouts(actor);
  const next = removeLoadout(list, id);
  if (next.length === list.length) return false;
  await actor.setFlag(MODULE_ID, FLAGS.LOADOUTS, next);
  return true;
}

/**
 * Apply a saved loadout (by ID or case-insensitive name) under the world's equipment enforcement mode.
 * @param {Object} actor
 * @param {string} idOrName
 * @returns {Promise<boolean>}
 */
export async function applyActorLoadout(actor, idOrName) {
  if (!isSupportedActor(actor) || !assertActorEditable(actor)) return false;
  const key = String(idOrName ?? "").trim();
  const list = getActorLoadouts(actor);
  const loadout = list.find((entry) => entry.id === key)
    ?? list.find((entry) => entry.name.toLowerCase() === key.toLowerCase());
  if (!loadout) {
    globalThis.ui?.notifications?.warn(localize("AIM.window.loadouts.notFound", { name: key }));
    return false;
  }

  const result = await EquipService.applyLoadout(actor, loadout, { mode: enforcementMode() });
  if (!result.ok) {
    globalThis.ui?.notifications?.warn(result.message);
    return false;
  }
  for (const warning of result.warnings ?? []) {
    globalThis.ui?.notifications?.warn(warning);
  }
  if (result.missing?.length) {
    globalThis.ui?.notifications?.warn(
      localize("AIM.window.loadouts.missingItems", { name: loadout.name, count: result.missing.length })
    );
  }
  return true;
}
