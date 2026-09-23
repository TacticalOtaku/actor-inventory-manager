// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Enforcement & Synchronization Hooks
// ─────────────────────────────────────────────────────────

import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { isSupportedActor } from "../core/actor-scope.js";
import {
  equipmentRuleEngine,
  findEquipSlot,
  getActorEquippedMap
} from "../core/equipment-rules.js";
import { getActorSlots } from "../core/paperdoll-templates.js";
import { getItemAssignedSlot } from "../core/item-classifier.js";
import { LOG } from "./logger.js";

/**
 * Handle item preUpdate to enforce equipment rules bidirectionally
 * @param {Object} item
 * @param {Object} changes
 * @param {Object} options
 * @param {string} userId
 */
export function handlePreUpdateItem(item, changes, options, userId) {
  const actor = item?.parent;
  if (!isSupportedActor(actor) || actor.documentName !== "Actor") return true;
  // Recovery reinstates a saved loadout; equipment validation must not rewrite it.
  if (options?.aimTradeRecovery && globalThis.game?.user?.isGM) return true;
  // The inventory window validated this change itself and wrote the slot flags.
  if (options?.[AIM_EQUIP_OPTION]) return true;

  // Check if equipped status is being modified
  const equippedChanging = foundry.utils.hasProperty(changes, "system.equipped");
  if (!equippedChanging) return true;

  const isEquipping = Boolean(foundry.utils.getProperty(changes, "system.equipped"));

  if (!isEquipping) {
    // Unequipping: clear slot assignment flag
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`, null);
    LOG.debug("Unequipped item, cleared slot flag", { item: item.name, actor: actor.name });
    return true;
  }

  // Equipping item: determine target slot. A leftover flag only counts while
  // the actor's template still has that slot.
  const currentSlotMap = getActorEquippedMap(actor);
  const knownSlotIds = new Set(getActorSlots(actor).map(slot => slot.id));
  const requestedSlot = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`) ?? getItemAssignedSlot(item);
  const targetSlotId = knownSlotIds.has(requestedSlot)
    ? requestedSlot
    : findEquipSlot(actor, item, currentSlotMap);

  if (!targetSlotId) {
    // No place on the paperdoll (Ioun stones, trinkets...): the system may
    // still equip it, it just does not occupy a slot.
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`, null);
    LOG.debug("Equipped item has no paperdoll slot", { item: item.name });
    return true;
  }

  const mode = game.settings?.get?.(MODULE_ID, "enforcementMode") ?? ENFORCEMENT_MODES.BLOCK;
  const result = resolveEquipValidation(actor, item, targetSlotId, currentSlotMap, mode);

  if (!result.valid) {
    LOG.warn("Equip validation failed", {
      item: item.name,
      targetSlotId,
      error: result.error,
      mode
    });
    ui.notifications?.warn(result.error);
    // Warn mode reports the problem but lets the sheet change through.
    if (mode !== ENFORCEMENT_MODES.WARN) return false;
  }

  // Handle auto-swap items if any
  if (result.autoSwapItems && result.autoSwapItems.length > 0) {
    const conflictingItems = result.autoSwapItems.filter(i => i.id !== item.id);
    const conflictMessage = game.i18n.format("AIM.notifications.slotOccupied", {
      item: item.name,
      conflict: conflictingItems.map(i => i.name).join(", ")
    });

    if (mode === ENFORCEMENT_MODES.AUTO_SWAP) {
      if (conflictingItems.length > 0) {
        LOG.info("Auto-swapping conflicting item(s)", {
          unequipping: conflictingItems.map(i => i.name).join(", "),
          equipping: item.name
        });

        if (typeof actor.updateEmbeddedDocuments === "function") {
          const updates = conflictingItems.map(swapItem => ({
            _id: swapItem.id,
            "system.equipped": false,
            [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null
          }));
          actor.updateEmbeddedDocuments("Item", updates).catch(err => {
            LOG.error("Failed to batch unequip swapped items", err);
          });
        } else {
          for (const swapItem of conflictingItems) {
            swapItem.update({
              "system.equipped": false,
              [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null
            }).catch(err => LOG.error("Failed to unequip swapped item", err));
          }
        }
      }
    } else if (mode === ENFORCEMENT_MODES.BLOCK && conflictingItems.length > 0) {
      ui.notifications?.warn(conflictMessage);
      return false;
    } else if (mode === ENFORCEMENT_MODES.WARN && conflictingItems.length > 0) {
      ui.notifications?.warn(conflictMessage);
    }
  }

  // Set the assigned slot in changes
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`, targetSlotId);
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.EQUIPPED_AT}`, Date.now());

  LOG.debug("Equipped item validated and slot assigned", {
    item: item.name,
    targetSlotId,
    actor: actor.name
  });

  return true;
}

/**
 * Validate an equip for the given enforcement mode.
 * In auto-swap mode a rule failure caused by another item (a two-handed
 * weapon, a second body armor, a second shield) swaps that item out instead of
 * refusing; the rules are re-run without it until they pass.
 * @returns {import("../core/equipment-rules.js").ValidationResult}
 */
function resolveEquipValidation(actor, item, targetSlotId, slotMap, mode) {
  let result = equipmentRuleEngine.validateEquip(actor, item, targetSlotId, { slotMap });
  if (result.valid || mode !== ENFORCEMENT_MODES.AUTO_SWAP) return result;

  const displaced = [];
  let remaining = slotMap;
  for (let attempt = 0; attempt < 5 && !result.valid && result.conflictItem; attempt++) {
    const conflict = result.conflictItem;
    displaced.push(conflict);
    remaining = new Map([...remaining].filter(([, equipped]) => equipped.id !== conflict.id));
    result = equipmentRuleEngine.validateEquip(actor, item, targetSlotId, { slotMap: remaining });
  }
  if (!result.valid) return result;
  result.autoSwapItems = [...displaced, ...(result.autoSwapItems ?? [])];
  return result;
}

/**
 * Register all enforcement hooks
 */
export function registerEnforcementHooks() {
  Hooks.on("preUpdateItem", (item, changes, options, userId) => {
    return handlePreUpdateItem(item, changes, options, userId);
  });

  LOG.info("Enforcement hooks registered");
}
