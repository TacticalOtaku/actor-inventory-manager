// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Enforcement & Synchronization Hooks
// ─────────────────────────────────────────────────────────

import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { isSupportedActor } from "../core/actor-scope.js";
import {
  findEquipSlot,
  getActorEquippedMap,
  resolveEquipValidation
} from "../core/equipment-rules.js";
import { getActorSlots } from "../core/paperdoll-templates.js";
import { LOG } from "./logger.js";

/**
 * Handle item preUpdate to enforce equipment rules bidirectionally
 * @param {Object} item
 * @param {Object} changes
 * @param {Object} options
 * @param {string} _userId
 */
export function handlePreUpdateItem(item, changes, options, _userId) {
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

  // Equipping item: determine target slot. Only a slot named in this change counts: an unequipped item's
  // leftover flag (a copy from another actor) names that actor's slot, not a place on this doll.
  const currentSlotMap = getActorEquippedMap(actor);
  const knownSlotIds = new Set(getActorSlots(actor).map(slot => slot.id));
  const requestedSlot = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`);
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
 * Register all enforcement hooks
 */
export function registerEnforcementHooks() {
  Hooks.on("preUpdateItem", (item, changes, options, userId) => {
    return handlePreUpdateItem(item, changes, options, userId);
  });

  LOG.info("Enforcement hooks registered");
}
