// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Actions Controller
// ─────────────────────────────────────────────────────────

import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { canEditActor, isSupportedActor } from "../core/actor-scope.js";
import { getActorAttunementMax, isItemAttuned, itemRequiresAttunement } from "../core/attunement.js";
import { planEquip, takeOffChanges } from "../core/equipment-rules.js";
import { canItemBeEquipped } from "../core/item-classifier.js";
import { LOG } from "../foundry/logger.js";

// Attunements sent and not yet back, per actor: two quick ones must not both take the last place.
const attuning = new Map();

export { getActorAttunementMax };

/**
 * Warn and return false unless the current user may edit the actor.
 * @param {Object} actor
 * @returns {boolean}
 */
export function assertCanEdit(actor) {
  if (canEditActor(actor, game.user)) return true;
  ui.notifications?.warn(game.i18n.localize("AIM.notifications.noPermission"));
  return false;
}

/** The world's rule for a broken equipment rule: block (default), auto_swap or warn. */
function enforcementMode() {
  try {
    return globalThis.game?.settings?.get?.(MODULE_ID, "enforcementMode") ?? ENFORCEMENT_MODES.BLOCK;
  } catch {
    return ENFORCEMENT_MODES.BLOCK;
  }
}

/**
 * Equip an item under the enforcement mode: into the slot given, or into the one the rules pick (none for an item with
 * no place on the paperdoll).
 * @param {Object} actor
 * @param {Object} item
 * @param {string|null} slotId
 * @returns {Promise<boolean>}
 */
async function equip(actor, item, slotId) {
  if (!assertCanEdit(actor)) return false;
  if (!canItemBeEquipped(item)) {
    ui.notifications?.warn(game.i18n.format("AIM.notifications.cannotEquip", { item: item.name }));
    return false;
  }

  const plan = planEquip(actor, item, slotId, enforcementMode());
  if (plan.refusal) {
    ui.notifications?.warn(plan.refusal.message);
    LOG.warn("Equip refused in UI", { item: item.name, slotId, code: plan.refusal.code });
    return false;
  }
  if (plan.warning) ui.notifications?.warn(plan.warning);

  // One batched write: displaced items and the new one change together, so a
  // failure cannot leave the old item unequipped and the new one not worn.
  // Foundry drops a document from the result when a preUpdate hook vetoes it.
  const updated = await actor.updateEmbeddedDocuments("Item", plan.updates, { [AIM_EQUIP_OPTION]: true });
  if (!updated?.some(doc => doc?.id === item.id)) return false;

  LOG.info("Item equipped", { item: item.name, slot: plan.updates.at(-1)[`flags.${MODULE_ID}.${FLAGS.SLOT}`], actor: actor.name });
  return true;
}

/**
 * Equip an item into a designated target slot
 * @param {Object} actor
 * @param {Object} item
 * @param {string} targetSlotId
 * @returns {Promise<boolean>} true when the item was written into the slot; false when
 *   refused (unsupported actor, missing argument, no permission, not equippable, slot
 *   rules) or when a preUpdate hook vetoed the write
 */
export async function equipItemToSlot(actor, item, targetSlotId) {
  if (!isSupportedActor(actor) || !item || !targetSlotId) return false;
  return equip(actor, item, targetSlotId);
}

/**
 * Unequip an item from its slot
 * @param {Object} actor
 * @param {Object} item
 * @returns {Promise<boolean>} true when the change was written; false when refused
 *   (unsupported actor, missing item, no permission) or vetoed by a preUpdate hook
 */
export async function unequipItem(actor, item) {
  if (!isSupportedActor(actor) || !item) return false;
  if (!assertCanEdit(actor)) return false;

  const updated = await item.update(takeOffChanges());
  if (!updated) return false;

  LOG.info("Item unequipped", { item: item.name, actor: actor?.name });
  return true;
}

/**
 * Toggle equip status of an item automatically finding the best slot
 * @param {Object} actor
 * @param {Object} item
 * @returns {Promise<boolean>} true when the item was equipped or unequipped; false when
 *   refused (unsupported actor, missing item, no permission, not equippable, slot rules)
 *   or vetoed by a preUpdate hook
 */
export async function toggleItemEquipped(actor, item) {
  if (!isSupportedActor(actor) || !item) return false;
  return item.system?.equipped ? unequipItem(actor, item) : equip(actor, item, null);
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
  if (item.parent?.documentName === "Actor" && !isSupportedActor(item.parent)) return;
  if (item.parent?.documentName === "Actor" && !assertCanEdit(item.parent)) return;
  if (typeof item.use === "function") {
    return item.use({ event });
  }
  if (typeof item.roll === "function") {
    return item.roll();
  }
  if (typeof item.sheet?.render === "function") {
    item.sheet.render({ force: true });
  }
}

/**
 * Toggle attunement state of an item
 * @param {Object} item
 * @returns {Promise<boolean>} true when attunement was started or ended; false when
 *   refused (missing item, unsupported actor, no permission, attunement not needed,
 *   attunement limit reached) or vetoed by a preUpdate hook
 */
export async function toggleAttunement(item) {
  if (!item) return false;
  const actor = item.parent;
  if (!isSupportedActor(actor)) return false;
  if (!assertCanEdit(actor)) return false;

  if (!isItemAttuned(item)) {
    if (!itemRequiresAttunement(item)) {
      ui.notifications?.warn(game.i18n.format("AIM.notifications.attunementNotRequired", { item: item.name }));
      return false;
    }

    const maxAttunement = getActorAttunementMax(actor);
    const pending = attuning.get(actor.uuid) ?? new Set();
    const currentlyAttuned = Array.from(actor.items.values())
      .filter(i => i.id !== item.id && isItemAttuned(i)).length
      + [...pending].filter(id => id !== item.id).length;

    if (currentlyAttuned >= maxAttunement) {
      ui.notifications?.warn(
        game.i18n.format("AIM.notifications.maxAttunementReached", { max: maxAttunement })
      );
      return false;
    }

    // shortcut: this guards one client; a GM and a player taking the last place at the same moment can both succeed,
    // since modules have no server-side check. Upgrade if tables report it.
    attuning.set(actor.uuid, pending.add(item.id));
    try {
      if (!await item.update({ "system.attuned": true })) return false;
    } finally {
      pending.delete(item.id);
    }
    ui.notifications?.info(game.i18n.format("AIM.notifications.attunedSuccess", { item: item.name }));
    return true;
  }

  if (!await item.update({ "system.attuned": false })) return false;
  ui.notifications?.info(game.i18n.format("AIM.notifications.unattunedSuccess", { item: item.name }));
  return true;
}

/**
 * Is `containerId` the item itself or one of the containers nested inside it?
 * Moving a bag into its own contents would detach the whole branch.
 * @param {Object} actor
 * @param {Object} item
 * @param {string} containerId
 * @returns {boolean}
 */
export function wouldCreateContainerCycle(actor, item, containerId) {
  let current = containerId;
  const visited = new Set();
  while (current && !visited.has(current)) {
    if (current === item.id) return true;
    visited.add(current);
    current = actor.items.get(current)?.system?.container ?? null;
  }
  return false;
}

/**
 * Move item into or out of a container
 * @param {Object} item
 * @param {string|null} containerId
 */
export async function setItemContainer(item, containerId) {
  if (!item) return;
  const actor = item.parent;
  if (!isSupportedActor(actor)) return;
  if (!assertCanEdit(actor)) return;
  if (containerId && wouldCreateContainerCycle(actor, item, containerId)) {
    ui.notifications?.warn(game.i18n.format("AIM.containers.cycle", { item: item.name }));
    return;
  }
  await item.update({
    "system.container": containerId || null,
    // Unequip if moving into a container
    ...(containerId ? takeOffChanges() : {})
  });
}
