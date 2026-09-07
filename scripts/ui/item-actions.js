// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Actions Controller
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../constants.js";
import { isItemAttuned } from "../core/attunement.js";
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
 * Use or roll an item (attack, damage, spell, consumable).
 * Passing the originating event lets dnd5e honour Shift to fast-forward and
 * prompt for the activity when an item defines more than one.
 * @param {Object} item
 * @param {Event} [event]
 */
export async function useItem(item, event = undefined) {
  if (!item) return;
  if (typeof item.use === "function") {
    return item.use({ event });
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

  // dnd5e 5.x keeps the requirement in `system.attunement` ("" | "required" |
  // "optional") and the state in the boolean `system.attuned`. Older versions
  // encoded both in the numeric `system.attunement` (0 none / 1 required / 2 attuned).
  const usesBooleanState = typeof item.system?.attuned === "boolean";

  if (!isItemAttuned(item)) {
    const maxAttunement = getActorAttunementMax(actor);
    if (actor) {
      const currentlyAttuned = Array.from(actor.items.values())
        .filter(i => i.id !== item.id && isItemAttuned(i)).length;

      if (currentlyAttuned >= maxAttunement) {
        ui.notifications?.warn(
          game.i18n.format("AIM.notifications.maxAttunementReached", { max: maxAttunement })
        );
        return;
      }
    }

    await item.update(usesBooleanState
      ? { "system.attuned": true }
      : { "system.attunement": 2 });
    ui.notifications?.info(game.i18n.format("AIM.notifications.attunedSuccess", { item: item.name }));
    return;
  }

  await item.update(usesBooleanState
    ? { "system.attuned": false }
    : { "system.attunement": 1 });
  ui.notifications?.info(game.i18n.format("AIM.notifications.unattunedSuccess", { item: item.name }));
}

/**
 * Resolve the attunement cap for an actor, honouring a custom paperdoll template.
 * @param {Object} actor
 * @returns {number}
 */
export function getActorAttunementMax(actor) {
  if (!actor) return 3;
  const customTemplate = actor.getFlag?.(MODULE_ID, FLAGS.CUSTOM_TEMPLATE)
    ?? actor.flags?.[MODULE_ID]?.[FLAGS.CUSTOM_TEMPLATE];
  if (typeof customTemplate?.attunementMax === "number") return customTemplate.attunementMax;
  const systemMax = actor.system?.attributes?.attunement?.max;
  return typeof systemMax === "number" ? systemMax : 3;
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
