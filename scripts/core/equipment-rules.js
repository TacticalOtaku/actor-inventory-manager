// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Equipment Rules & Validation Engine
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import {
  classifyItem,
  getItemAssignedSlot,
  getValidSlotsForItem,
  isBodyArmor,
  isItemCompatibleWithSlot,
  isShield,
  isTwoHandedWeapon
} from "./item-classifier.js";
import { slotRegistry } from "./slot-definitions.js";

/**
 * Result of equipment validation
 */
export class ValidationResult {
  constructor({ valid = true, error = null, code = null, conflictItem = null, autoSwapItems = [] } = {}) {
    this.valid = valid;
    this.error = error;
    this.code = code;
    this.conflictItem = conflictItem;
    this.autoSwapItems = autoSwapItems;
  }

  static success(data = {}) {
    return new ValidationResult({ valid: true, ...data });
  }

  static fail(error, code, data = {}) {
    return new ValidationResult({ valid: false, error, code, ...data });
  }
}

/**
 * Build Map of currently equipped slots for an actor
 * @param {Object} actor
 * @returns {Map<string, Object>} Map of slotId -> item document
 */
export function getActorEquippedMap(actor) {
  const slotMap = new Map();
  if (!actor || !actor.items) return slotMap;

  const equippedItems = Array.from(actor.items.values()).filter(i => (
    i?.system?.equipped === true && !i?.system?.container
  ));

  // Step 1: Place items that have explicit slot flags
  const unassigned = [];
  for (const item of equippedItems) {
    const slotId = getItemAssignedSlot(item);
    if (slotId && slotRegistry.has(slotId) && !slotMap.has(slotId)) {
      slotMap.set(slotId, item);
    } else {
      unassigned.push(item);
    }
  }

  // Step 2: Auto-reconcile unassigned equipped items into free valid slots
  for (const item of unassigned) {
    const validSlots = getValidSlotsForItem(item);
    let assigned = false;
    for (const sId of validSlots) {
      if (!slotMap.has(sId)) {
        // Check 2H conflict for offHand
        if (sId === SLOTS.OFF_HAND) {
          const mainItem = slotMap.get(SLOTS.MAIN_HAND);
          if (mainItem && isTwoHandedWeapon(mainItem)) {
            continue; // Cannot put into off-hand
          }
        }
        slotMap.set(sId, item);
        assigned = true;
        break;
      }
    }
    if (!assigned && validSlots.length > 0) {
      // Slot collision in unassigned items
      // Place in first valid slot if empty
      const fallbackSlot = validSlots[0];
      if (!slotMap.has(fallbackSlot)) {
        slotMap.set(fallbackSlot, item);
      }
    }
  }

  return slotMap;
}

/**
 * Check if the offHand is locked by a two-handed weapon in mainHand
 * @param {Map<string, Object>} slotMap
 * @returns {boolean}
 */
export function isOffHandLockedBy2H(slotMap) {
  const mainHandItem = slotMap.get(SLOTS.MAIN_HAND);
  return Boolean(mainHandItem && isTwoHandedWeapon(mainHandItem));
}

/**
 * Equipment Rule Engine
 */
export class EquipmentRuleEngine {
  constructor() {
    this._rules = [];
    this.registerDefaultRules();
  }

  registerDefaultRules() {
    this._rules = [
      // Rule 1: Slot compatibility
      {
        id: "slot_compatibility",
        name: "Slot Compatibility",
        validate: (actor, item, targetSlotId, slotMap) => {
          if (!targetSlotId) {
            return ValidationResult.fail("Target slot is required.", "NO_TARGET_SLOT");
          }
          if (!isItemCompatibleWithSlot(item, targetSlotId, actor)) {
            const valid = getValidSlotsForItem(item, actor);
            return ValidationResult.fail(
              `Item '${item.name}' cannot be equipped in slot '${targetSlotId}'. Valid slots: ${valid.join(", ")}`,
              "SLOT_INCOMPATIBLE"
            );
          }
          return ValidationResult.success();
        }
      },

      // Rule 2: Single Body Armor
      {
        id: "single_armor",
        name: "Single Body Armor",
        validate: (actor, item, targetSlotId, slotMap) => {
          if (!isBodyArmor(item)) return ValidationResult.success();

          const currentArmor = slotMap.get(SLOTS.ARMOR);
          if (currentArmor && currentArmor.id !== item.id) {
            // There's already an armor equipped
            if (targetSlotId === SLOTS.ARMOR) {
              // Replacing armor in the armor slot is allowed via autoSwap
              return ValidationResult.success({
                autoSwapItems: [currentArmor]
              });
            }
            return ValidationResult.fail(
              `Cannot equip '${item.name}': '${currentArmor.name}' is already equipped in Armor slot.`,
              "ARMOR_ALREADY_EQUIPPED",
              { conflictItem: currentArmor }
            );
          }
          return ValidationResult.success();
        }
      },

      // Rule 3: Two-Handed Weapons
      {
        id: "two_handed_weapon",
        name: "Two-Handed Weapon Lock",
        validate: (actor, item, targetSlotId, slotMap) => {
          // Case A: Equipping an item into offHand while mainHand has 2H weapon
          if (targetSlotId === SLOTS.OFF_HAND) {
            const mainHandItem = slotMap.get(SLOTS.MAIN_HAND);
            if (mainHandItem && mainHandItem.id !== item.id && isTwoHandedWeapon(mainHandItem)) {
              return ValidationResult.fail(
                `Cannot equip '${item.name}' in off-hand: Main hand weapon '${mainHandItem.name}' requires two hands.`,
                "OFFHAND_BLOCKED_BY_2H",
                { conflictItem: mainHandItem }
              );
            }
          }

          // Case B: Equipping a 2H weapon into mainHand while offHand is occupied
          if (targetSlotId === SLOTS.MAIN_HAND && isTwoHandedWeapon(item)) {
            const offHandItem = slotMap.get(SLOTS.OFF_HAND);
            if (offHandItem && offHandItem.id !== item.id) {
              return ValidationResult.success({
                autoSwapItems: [offHandItem]
              });
            }
          }

          return ValidationResult.success();
        }
      },

      // Rule 4: Shield limits
      {
        id: "single_shield",
        name: "Shield Limit",
        validate: (actor, item, targetSlotId, slotMap) => {
          if (!isShield(item)) return ValidationResult.success();

          // Check if another shield is equipped in the other hand
          const otherHandSlot = targetSlotId === SLOTS.MAIN_HAND ? SLOTS.OFF_HAND : SLOTS.MAIN_HAND;
          const otherHandItem = slotMap.get(otherHandSlot);
          if (otherHandItem && otherHandItem.id !== item.id && isShield(otherHandItem)) {
            return ValidationResult.fail(
              `Cannot equip '${item.name}': Shield '${otherHandItem.name}' is already equipped in other hand.`,
              "SHIELD_ALREADY_EQUIPPED",
              { conflictItem: otherHandItem }
            );
          }
          return ValidationResult.success();
        }
      },

      // Rule 5: Rings slot swap
      {
        id: "rings_allocation",
        name: "Ring Allocation",
        validate: (actor, item, targetSlotId, slotMap) => {
          const classification = classifyItem(item);
          if (classification !== "ring") return ValidationResult.success();

          const existingItem = slotMap.get(targetSlotId);
          if (existingItem && existingItem.id !== item.id) {
            return ValidationResult.success({
              autoSwapItems: [existingItem]
            });
          }
          return ValidationResult.success();
        }
      }
    ];
  }

  /**
   * Register a custom rule
   * @param {Object} ruleDef { id, name, validate: (actor, item, targetSlotId, slotMap) => ValidationResult }
   */
  registerRule(ruleDef) {
    if (!ruleDef || !ruleDef.id || typeof ruleDef.validate !== "function") {
      throw new Error("Rule definition must have 'id' and 'validate' function");
    }
    this._rules.push(ruleDef);
  }

  /**
   * Validate equipping an item into a target slot
   * @param {Object} actor
   * @param {Object} item
   * @param {string} targetSlotId
   * @param {Object} [options={}]
   * @returns {ValidationResult}
   */
  validateEquip(actor, item, targetSlotId, options = {}) {
    if (!actor || !item || !targetSlotId) {
      return ValidationResult.fail("Missing actor, item, or targetSlotId", "INVALID_ARGUMENTS");
    }

    const slotMap = options.slotMap ?? getActorEquippedMap(actor);
    const accumulatedAutoSwap = [];

    // Check if slot has an existing item occupying it (for general swap)
    const existingInTargetSlot = slotMap.get(targetSlotId);
    if (existingInTargetSlot && existingInTargetSlot.id !== item.id) {
      accumulatedAutoSwap.push(existingInTargetSlot);
    }

    for (const rule of this._rules) {
      const result = rule.validate(actor, item, targetSlotId, slotMap);
      if (!result.valid) {
        return result;
      }
      if (result.autoSwapItems?.length) {
        for (const swapItem of result.autoSwapItems) {
          if (!accumulatedAutoSwap.some(i => i.id === swapItem.id)) {
            accumulatedAutoSwap.push(swapItem);
          }
        }
      }
    }

    return ValidationResult.success({ autoSwapItems: accumulatedAutoSwap });
  }
}

export const equipmentRuleEngine = new EquipmentRuleEngine();
