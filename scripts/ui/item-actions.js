// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Actions Controller
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { equipmentRuleEngine, getActorEquippedMap } from "../core/equipment-rules.js";
import { findBestSlotForEquipping, getValidSlotsForItem } from "../core/item-classifier.js";
import { LOG } from "../foundry/logger.js";

/**
 * Equip an item into a designated target slot
 * @param {Object} actor
 * @param {Object} item
 * @param {string} targetSlotId
 */
export async function equipItemToSlot(actor, item, targetSlotId) {
  if (!actor || !item || !targetSlotId) return;

  const currentSlotMap = getActorEquippedMap(actor);
  const validation = equipmentRuleEngine.validateEquip(actor, item, targetSlotId, {
    slotMap: currentSlotMap
  });

  if (!validation.valid) {
    ui.notifications?.warn(validation.error);
    LOG.warn("Equip validation failed in UI", { item: item.name, targetSlotId, error: validation.error });
    return;
  }

  // Handle auto-swap items if any
  if (validation.autoSwapItems && validation.autoSwapItems.length > 0) {
    for (const swapItem of validation.autoSwapItems) {
      if (swapItem.id !== item.id) {
        LOG.info("Auto-swapping item from slot", { unequipping: swapItem.name });
        await swapItem.update({
          "system.equipped": false,
          [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null
        });
      }
    }
  }

  // Equip target item
  await item.update({
    "system.equipped": true,
    [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: targetSlotId,
    [`flags.${MODULE_ID}.${FLAGS.EQUIPPED_AT}`]: Date.now()
  });

  LOG.info("Item equipped to slot", { item: item.name, slot: targetSlotId, actor: actor.name });
}

/**
 * Unequip an item from its slot
 * @param {Object} actor
 * @param {Object} item
 */
export async function unequipItem(actor, item) {
  if (!item) return;

  await item.update({
    "system.equipped": false,
    [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null
  });

  LOG.info("Item unequipped", { item: item.name, actor: actor?.name });
}

/**
 * Toggle equip status of an item automatically finding the best slot
 * @param {Object} actor
 * @param {Object} item
 */
export async function toggleItemEquipped(actor, item) {
  if (!actor || !item) return;

  if (item.system?.equipped) {
    await unequipItem(actor, item);
  } else {
    const currentSlotMap = getActorEquippedMap(actor);
    const targetSlotId = findBestSlotForEquipping(actor, item, currentSlotMap);
    if (!targetSlotId) {
      const valid = getValidSlotsForItem(item);
      ui.notifications?.warn(
        game.i18n.format("AIM.notifications.noValidSlot", {
          item: item.name,
          valid: valid.join(", ")
        })
      );
      return;
    }
    await equipItemToSlot(actor, item, targetSlotId);
  }
}

/**
 * Use or roll an item (attack, damage, spell, consumable)
 * @param {Object} item
 */
export async function useItem(item) {
  if (!item) return;
  if (typeof item.use === "function") {
    return item.use();
  }
  if (typeof item.roll === "function") {
    return item.roll();
  }
  if (typeof item.sheet?.render === "function") {
    item.sheet.render(true);
  }
}

/**
 * Toggle attunement state of an item
 * @param {Object} item
 */
export async function toggleAttunement(item) {
  if (!item) return;
  const actor = item.parent;
  const current = item.system?.attunement;
  const isAttuned = item.system?.attuned === true || current === 2 || current === "attuned" || current === "ATTUNED" || String(current).toLowerCase() === "attuned";

  if (!isAttuned) {
    // Determine max attunement limit
    let maxAttunement = 3;
    if (actor) {
      try {
        const customTemplate = actor.getFlag?.(MODULE_ID, FLAGS.CUSTOM_TEMPLATE) || actor.flags?.[MODULE_ID]?.[FLAGS.CUSTOM_TEMPLATE];
        if (customTemplate?.attunementMax !== undefined) {
          maxAttunement = customTemplate.attunementMax;
        } else {
          maxAttunement = actor.system?.attributes?.attunement?.max ?? 3;
        }
      } catch {
        maxAttunement = actor.system?.attributes?.attunement?.max ?? 3;
      }

      // Count currently attuned items on actor
      const currentlyAttuned = Array.from(actor.items.values()).filter(i => {
        const att = i.system?.attunement;
        return (i.system?.attuned === true || att === 2 || att === "attuned" || att === "ATTUNED" || String(att).toLowerCase() === "attuned") && i.id !== item.id;
      }).length;

      if (currentlyAttuned >= maxAttunement) {
        ui.notifications?.warn(
          game.i18n.format("AIM.notifications.maxAttunementReached", { max: maxAttunement }) ||
          `Cannot attune: Maximum attunement limit reached (${maxAttunement}/${maxAttunement}).`
        );
        return;
      }
    }

    // Set attuned state
    const updateData = {};
    if (typeof current === "string") {
      updateData["system.attunement"] = "attuned";
    } else {
      updateData["system.attunement"] = 2;
    }
    if (item.system?.attuned !== undefined) {
      updateData["system.attuned"] = true;
    }
    await item.update(updateData);
    ui.notifications?.info(game.i18n.format("AIM.notifications.attunedSuccess", { item: item.name }) || `Attuned to ${item.name}`);
  } else {
    // End attunement state
    const updateData = {};
    if (typeof current === "string") {
      updateData["system.attunement"] = "required";
    } else {
      updateData["system.attunement"] = 1;
    }
    if (item.system?.attuned !== undefined) {
      updateData["system.attuned"] = false;
    }
    await item.update(updateData);
    ui.notifications?.info(game.i18n.format("AIM.notifications.unattunedSuccess", { item: item.name }) || `Ended attunement to ${item.name}`);
  }
}

/**
 * Move item into or out of a container
 * @param {Object} item
 * @param {string|null} containerId
 */
export async function setItemContainer(item, containerId) {
  if (!item) return;
  await item.update({
    "system.container": containerId || null,
    // Unequip if moving into a container
    ...(containerId ? { "system.equipped": false, [`flags.${MODULE_ID}.${FLAGS.SLOT}`]: null } : {})
  });
}
