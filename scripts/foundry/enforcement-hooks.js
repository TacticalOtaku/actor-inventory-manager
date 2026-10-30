// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Enforcement & Synchronization Hooks
// ─────────────────────────────────────────────────────────

import { AIM_EQUIP_OPTION, ENFORCEMENT_MODES, FLAGS, MODULE_ID } from "../constants.js";
import { isSupportedActor } from "../core/actor-scope.js";
import { planEquip } from "../core/equipment-rules.js";
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

  // Equipping item: only a slot named in this change counts as chosen. An unequipped item's leftover flag (a copy
  // from another actor) names that actor's slot, not a place on this doll.
  const knownSlotIds = new Set(getActorSlots(actor).map(slot => slot.id));
  const requestedSlot = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.${FLAGS.SLOT}`);
  const mode = game.settings?.get?.(MODULE_ID, "enforcementMode") ?? ENFORCEMENT_MODES.BLOCK;
  const plan = planEquip(actor, item, knownSlotIds.has(requestedSlot) ? requestedSlot : null, mode);

  if (plan.refusal) {
    LOG.warn("Equip refused", { item: item.name, code: plan.refusal.code, mode });
    ui.notifications?.warn(plan.refusal.message);
    return false;
  }
  if (plan.warning) ui.notifications?.warn(plan.warning);

  // This change carries the equipped item's part of the plan; the items it takes off are written beside it.
  for (const [key, value] of Object.entries(plan.updates.pop())) if (key !== "_id") foundry.utils.setProperty(changes, key, value);
  if (plan.updates.length) {
    actor.updateEmbeddedDocuments("Item", plan.updates).catch(err => LOG.error("Failed to take off swapped items", err));
  }

  LOG.debug("Equipped item validated and slot assigned", { item: item.name, actor: actor.name });
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
