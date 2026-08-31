// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Enforcement & Synchronization Hooks
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import {
  equipmentRuleEngine,
  getActorEquippedMap
} from "../core/equipment-rules.js";
import {
  findBestSlotForEquipping,
  getItemAssignedSlot,
  getValidSlotsForItem
} from "../core/item-classifier.js";
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
  if (!actor || actor.documentName !== "Actor") return true;

  // Check if equipped status is being modified
  const equippedChanging = foundry.utils.hasProperty(changes, "system.equipped");
  if (!equippedChanging) return true;

  const isEquipping = Boolean(foundry.utils.getProperty(changes, "system.equipped"));

  if (!isEquipping) {
    // Unequipping: clear slot assignment flag
    changes.flags = changes.flags || {};
    foundry.utils.setProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`, null);
    LOG.debug("Unequipped item, cleared slot flag", { item: item.name, actor: actor.name });
    return true;
  }

  // Equipping item: determine target slot
  const currentSlotMap = getActorEquippedMap(actor);
  let targetSlotId = (
    foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`) ??
    getItemAssignedSlot(item)
  );

  if (!targetSlotId) {
    targetSlotId = findBestSlotForEquipping(actor, item, currentSlotMap);
  }

  if (!targetSlotId) {
    const valid = getValidSlotsForItem(item);
    const msg = game.i18n.format("AIM.notifications.noValidSlot", {
      item: item.name,
      valid: valid.join(", ")
    });
    LOG.warn("No valid slot found for item", { item: item.name, valid });
    ui.notifications?.warn(msg);
    return false;
  }

  // Run validation engine
  const result = equipmentRuleEngine.validateEquip(actor, item, targetSlotId, {
    slotMap: currentSlotMap
  });

  const mode = game.settings?.get?.(MODULE_ID, "enforcementMode") ?? ENFORCEMENT_MODES.BLOCK;

  if (!result.valid) {
    LOG.warn("Equip validation failed", {
      item: item.name,
      targetSlotId,
      error: result.error,
      mode
    });

    if (mode === ENFORCEMENT_MODES.BLOCK) {
      ui.notifications?.warn(result.error);
      return false; // Blocks the preUpdate in Foundry
    } else if (mode === ENFORCEMENT_MODES.WARN) {
      ui.notifications?.warn(result.error);
    }
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
  changes.flags = changes.flags || {};
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
 * Register all enforcement hooks
 */
export function registerEnforcementHooks() {
  Hooks.on("preUpdateItem", (item, changes, options, userId) => {
    return handlePreUpdateItem(item, changes, options, userId);
  });

  LOG.info("Enforcement hooks registered");
}
