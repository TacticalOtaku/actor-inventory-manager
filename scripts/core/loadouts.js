// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Equipment Loadouts (Pure Logic)
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { isSupportedActor } from "./actor-scope.js";
import { equipmentRuleEngine, findEquipSlot, getActorEquippedMap, takeOffChanges } from "./equipment-rules.js";
import {
  PHYSICAL_ITEM_TYPES,
  canItemBeEquipped,
  getItemAssignedSlot,
  getValidSlotsForItem,
  takesNoSlot
} from "./item-classifier.js";
import { getActorSlots } from "./paperdoll-templates.js";

export const MAX_LOADOUTS = 12;

export const LOADOUT_ICONS = Object.freeze([
  "fa-shield-halved",
  "fa-crosshairs",
  "fa-campfire",
  "fa-wand-sparkles",
  "fa-user-secret",
  "fa-hand-fist",
  "fa-shirt",
  "fa-gem"
]);

export const DEFAULT_LOADOUT_ICON = LOADOUT_ICONS[0];

function actorItemsList(actor) {
  if (!actor?.items) return [];
  if (typeof actor.items.values === "function") return [...actor.items.values()];
  return [...actor.items];
}

function findActorItem(actor, id) {
  if (!actor?.items || !id) return null;
  if (typeof actor.items.get === "function") return actor.items.get(id) ?? null;
  return actorItemsList(actor).find((item) => item?.id === id) ?? null;
}

/**
 * Equippable physical items that belong to a gear loadout when worn outside doll slots
 * (e.g. robes, trinkets, Ioun stones). Containers, natural weapons and ammo stay independent.
 * @param {Object} item
 * @returns {boolean}
 */
export function isManagedSlotless(item) {
  if (!item || !PHYSICAL_ITEM_TYPES.has(item.type)) return false;
  if (!canItemBeEquipped(item) || item.type === "container") return false;
  const sub = item.system?.type?.value;
  if (item.type === "weapon" && sub === "natural") return false;
  if (item.type === "consumable" && sub === "ammo") return false;
  return true;
}

/**
 * Normalize an actor's stored loadout flag array into clean records.
 * @param {unknown} raw
 * @returns {Array<{id: string, name: string, icon: string, slots: Record<string, string>, slotless: string[], updatedAt: number}>}
 */
export function normalizeLoadouts(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const list = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const id = String(entry.id ?? "").trim();
    const name = String(entry.name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const slots = {};
    if (entry.slots && typeof entry.slots === "object" && !Array.isArray(entry.slots)) {
      for (const [slotId, itemId] of Object.entries(entry.slots)) {
        if (typeof slotId === "string" && slotId && typeof itemId === "string" && itemId) {
          slots[slotId] = itemId;
        }
      }
    }
    const slottedIds = new Set(Object.values(slots));
    const slotless = Array.isArray(entry.slotless)
      ? [...new Set(entry.slotless.filter((itemId) => typeof itemId === "string" && itemId && !slottedIds.has(itemId)))]
      : [];
    list.push({
      id,
      name,
      icon: LOADOUT_ICONS.includes(entry.icon) ? entry.icon : DEFAULT_LOADOUT_ICON,
      slots,
      slotless,
      updatedAt: Number.isFinite(Number(entry.updatedAt)) ? Number(entry.updatedAt) : 0
    });
    if (list.length >= MAX_LOADOUTS) break;
  }
  return list;
}

/**
 * Snapshot an actor's currently equipped paperdoll slots and managed slotless items into a loadout record.
 * @param {Object} actor
 * @param {{id: string, name: string, icon?: string, now?: number}} meta
 */
export function captureLoadout(actor, { id, name, icon = DEFAULT_LOADOUT_ICON, now = Date.now() }) {
  const slotMap = getActorEquippedMap(actor);
  const slots = Object.fromEntries([...slotMap].map(([slotId, item]) => [slotId, item.id]));
  const wornIds = new Set(Object.values(slots));
  const slotless = [];
  for (const item of actorItemsList(actor)) {
    if (item?.system?.equipped === true && !item?.system?.container && !wornIds.has(item.id) && isManagedSlotless(item)) {
      slotless.push(item.id);
    }
  }
  return {
    id: String(id ?? "").trim(),
    name: String(name ?? "").trim(),
    icon: LOADOUT_ICONS.includes(icon) ? icon : DEFAULT_LOADOUT_ICON,
    slots,
    slotless,
    updatedAt: now
  };
}

/**
 * Insert or update a loadout inside a normalized loadout list.
 * @param {Array} list
 * @param {Object} loadout
 * @returns {{ok: boolean, code: "NAME"|"LIMIT"|null, loadouts: Array, loadout: Object|null}}
 */
export function upsertLoadout(list, loadout) {
  const current = normalizeLoadouts(list);
  const clean = normalizeLoadouts([loadout])[0] ?? null;
  if (!clean) return { ok: false, code: "NAME", loadouts: current, loadout: null };
  const idx = current.findIndex((entry) => entry.id === clean.id);
  if (idx >= 0) {
    const next = [...current];
    next[idx] = clean;
    return { ok: true, code: null, loadouts: next, loadout: clean };
  }
  if (current.length >= MAX_LOADOUTS) {
    return { ok: false, code: "LIMIT", loadouts: current, loadout: null };
  }
  return { ok: true, code: null, loadouts: [...current, clean], loadout: clean };
}

/**
 * Remove a loadout by ID.
 * @param {Array} list
 * @param {string} id
 */
export function removeLoadout(list, id) {
  return normalizeLoadouts(list).filter((entry) => entry.id !== id);
}

/**
 * Identify which saved loadout matches the actor's currently equipped state.
 * Empty loadouts match only when intentionally saved empty and nothing managed is worn.
 * @param {Object} actor
 * @param {Array} loadouts
 * @returns {string|null}
 */
export function detectActiveLoadoutId(actor, loadouts) {
  if (!isSupportedActor(actor)) return null;
  const slotMap = getActorEquippedMap(actor);
  const slottedIds = new Set([...slotMap.values()].map((item) => item.id));
  const liveSlotless = new Set(
    actorItemsList(actor)
      .filter((item) => item?.system?.equipped === true && !item?.system?.container && !slottedIds.has(item.id) && isManagedSlotless(item))
      .map((item) => item.id)
  );

  for (const loadout of normalizeLoadouts(loadouts)) {
    const rawTotal = Object.keys(loadout.slots).length + loadout.slotless.length;
    const expectedSlots = Object.entries(loadout.slots).filter(([, itemId]) => Boolean(findActorItem(actor, itemId)));
    const expectedSlotless = loadout.slotless.filter((itemId) => Boolean(findActorItem(actor, itemId)));
    const existingTotal = expectedSlots.length + expectedSlotless.length;

    if (existingTotal === 0) {
      if (rawTotal === 0 && slotMap.size === 0 && liveSlotless.size === 0) return loadout.id;
      continue;
    }

    const slotsMatch = slotMap.size === expectedSlots.length
      && expectedSlots.every(([slotId, itemId]) => slotMap.get(slotId)?.id === itemId);
    if (!slotsMatch) continue;

    const slotlessMatch = liveSlotless.size === expectedSlotless.length
      && expectedSlotless.every((itemId) => liveSlotless.has(itemId));
    if (slotlessMatch) return loadout.id;
  }
  return null;
}

/**
 * Summarize a loadout's existing and missing item names for UI tooltips.
 * @param {Object} actor
 * @param {Object} loadout
 * @returns {{count: number, missingCount: number, names: string[], missingIds: string[]}}
 */
export function summarizeLoadout(actor, loadout) {
  const ids = [...new Set([...Object.values(loadout?.slots ?? {}), ...(loadout?.slotless ?? [])])];
  const names = [];
  const missingIds = [];
  for (const itemId of ids) {
    const item = findActorItem(actor, itemId);
    if (item) names.push(item.name);
    else missingIds.push(itemId);
  }
  return { count: names.length, missingCount: missingIds.length, names, missingIds };
}

function removeFromSlotMap(slotMap, itemId) {
  for (const [slotId, equipped] of slotMap) {
    if (equipped.id === itemId) slotMap.delete(slotId);
  }
}

/**
 * Compute the minimal batch of Item document updates to switch an actor into a loadout
 * while validating all doll rules against the target state.
 * @param {Object} actor
 * @param {Object} loadout
 * @param {{mode?: string, now?: number}} [options]
 * @returns {{updates: Object[], missing: Array<{slotId: string|null, itemId: string}>, warnings: string[], refusal: {code: string, message: string}|null}}
 */
export function planLoadoutApply(actor, loadout, { mode = ENFORCEMENT_MODES.BLOCK, now = Date.now() } = {}) {
  if (!isSupportedActor(actor) || !loadout) {
    return { updates: [], missing: [], warnings: [], refusal: null };
  }

  const validSlotIds = new Set((getActorSlots(actor) ?? []).map((slot) => slot.id));
  let plannedMap = new Map();
  const missing = [];
  const warnings = [];
  const extraSlotless = [];

  for (const [slotId, itemId] of Object.entries(loadout.slots ?? {})) {
    const item = findActorItem(actor, itemId);
    if (!item) {
      missing.push({ slotId, itemId });
      continue;
    }
    if (!canItemBeEquipped(item)) continue;

    const resolvedSlotId = validSlotIds.has(slotId) ? slotId : findEquipSlot(actor, item, plannedMap);
    if (!resolvedSlotId) {
      if (takesNoSlot(item) || getValidSlotsForItem(item, actor).length === 0) {
        extraSlotless.push(item.id);
        continue;
      }
      const res = equipmentRuleEngine.validateEquip(actor, item, slotId, { slotMap: plannedMap });
      if (mode === ENFORCEMENT_MODES.BLOCK) {
        return { updates: [], missing, warnings, refusal: { code: res.code ?? "NO_TARGET_SLOT", message: res.error } };
      }
      if (res.error) warnings.push(res.error);
      continue;
    }

    let result = equipmentRuleEngine.validateEquip(actor, item, resolvedSlotId, { slotMap: plannedMap });
    if (!result.valid && result.code === "SLOT_INCOMPATIBLE") {
      if (mode === ENFORCEMENT_MODES.BLOCK) {
        return { updates: [], missing, warnings, refusal: { code: result.code, message: result.error } };
      }
      warnings.push(result.error);
      continue;
    }

    if (!result.valid) {
      if (mode === ENFORCEMENT_MODES.BLOCK) {
        return { updates: [], missing, warnings, refusal: { code: result.code, message: result.error } };
      }
      if (mode === ENFORCEMENT_MODES.AUTO_SWAP) {
        const candidateMap = new Map(plannedMap);
        let attemptResult = result;
        for (let attempt = 0; attempt < 5 && !attemptResult.valid && attemptResult.conflictItem; attempt++) {
          removeFromSlotMap(candidateMap, attemptResult.conflictItem.id);
          attemptResult = equipmentRuleEngine.validateEquip(actor, item, resolvedSlotId, { slotMap: candidateMap });
        }
        if (!attemptResult.valid) {
          warnings.push(attemptResult.error);
          continue;
        }
        plannedMap = candidateMap;
        result = attemptResult;
      } else if (mode === ENFORCEMENT_MODES.WARN) {
        warnings.push(result.error);
        plannedMap.set(resolvedSlotId, item);
        continue;
      }
    }

    for (const swapItem of result.autoSwapItems ?? []) {
      removeFromSlotMap(plannedMap, swapItem.id);
    }
    plannedMap.set(resolvedSlotId, item);
  }

  const placedIds = new Set([...plannedMap.values()].map((item) => item.id));
  const desiredSlotless = new Set();
  for (const itemId of [...(loadout.slotless ?? []), ...extraSlotless]) {
    if (placedIds.has(itemId)) continue;
    const item = findActorItem(actor, itemId);
    if (!item) {
      missing.push({ slotId: null, itemId });
      continue;
    }
    if (canItemBeEquipped(item)) desiredSlotless.add(item.id);
  }

  const currentSlotMap = getActorEquippedMap(actor);
  const currentlySlottedIds = new Set([...currentSlotMap.values()].map((item) => item.id));
  const desiredIds = new Set([...placedIds, ...desiredSlotless]);
  const updates = [];

  // Unequip displaced items first so slot capacity / limits remain consistent.
  for (const item of actorItemsList(actor)) {
    if (
      item?.system?.equipped === true
      && !item?.system?.container
      && !desiredIds.has(item.id)
      && (currentlySlottedIds.has(item.id) || isManagedSlotless(item))
    ) {
      updates.push({ _id: item.id, ...takeOffChanges() });
    }
  }

  // Equip or update slot assignments next.
  for (const [slotId, item] of plannedMap) {
    const needsUpdate = !item.system?.equipped || Boolean(item.system?.container) || getItemAssignedSlot(item) !== slotId;
    if (needsUpdate) {
      updates.push({
        _id: item.id,
        "system.equipped": true,
        ...(item.system?.container ? { "system.container": null } : {}),
        [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: slotId,
        [`flags.${MODULE_ID}.${FLAGS.EQUIPPED_AT}`]: now
      });
    }
  }

  for (const itemId of desiredSlotless) {
    const item = findActorItem(actor, itemId);
    const needsUpdate = !item.system?.equipped || Boolean(item.system?.container) || getItemAssignedSlot(item) !== null;
    if (needsUpdate) {
      updates.push({
        _id: item.id,
        "system.equipped": true,
        ...(item.system?.container ? { "system.container": null } : {}),
        [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null
      });
    }
  }

  return { updates, missing, warnings, refusal: null };
}
