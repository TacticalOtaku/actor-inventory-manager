// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Equipment Rules & Validation Engine
// ─────────────────────────────────────────────────────────

import { SLOTS } from "../constants.js";
import { isSupportedActor } from "./actor-scope.js";
import {
  classifyItem,
  getItemAssignedSlot,
  getValidSlotsForItem,
  isBodyArmor,
  isItemCompatibleWithSlot,
  isMainHandSlot,
  isOffHandSlot,
  isShield,
  isTwoHandedWeapon
} from "./item-classifier.js";
import { getActorSlots } from "./paperdoll-templates.js";
import { getPaperdollRuntime } from "./paperdoll-runtime.js";
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

/** English fallbacks for the rule messages; translations live under AIM.rules.* */
const RULE_MESSAGES = {
  missingArguments: "Missing actor, item, or target slot.",
  noTargetSlot: "Target slot is required.",
  slotIncompatible: "'{item}' cannot be equipped in slot '{slot}'. Valid slots: {valid}",
  armorAlreadyEquipped: "Cannot equip '{item}': '{conflict}' is already worn as body armor.",
  offHandBlocked: "Cannot equip '{item}' in the off hand: '{conflict}' requires both hands.",
  shieldAlreadyEquipped: "Cannot equip '{item}': shield '{conflict}' is already equipped.",
  singlePerActor: "Cannot equip '{item}': '{conflict}' of the same kind is already equipped."
};

function ruleMessage(key, data = {}) {
  return getPaperdollRuntime().format(`AIM.rules.${key}`, data, RULE_MESSAGES[key]);
}

/**
 * The slot definitions that apply to an actor.
 * @param {Object} actor
 * @returns {Array<Object>}
 */
function actorSlotDefinitions(actor) {
  const slots = actor ? getActorSlots(actor) : null;
  return Array.isArray(slots) && slots.length > 0 ? slots : slotRegistry.getAll();
}

function slotDisplayName(actor, slotId) {
  return actorSlotDefinitions(actor).find(slot => slot.id === slotId)?.label ?? slotId;
}

/**
 * Which slots a two-handed weapon occupies and which it locks.
 * Honours the `locksOffHandOn2H` / `isShield` flags of custom templates.
 * @param {Object|null} actor
 * @returns {{ mainSlotIds: Array<string>, offSlotIds: Array<string> }}
 */
export function getTwoHandLayout(actor = null) {
  const slots = actorSlotDefinitions(actor);
  const mainSlotIds = slots.filter(isMainHandSlot).map(slot => slot.id);
  const offSlotIds = slots.filter(isOffHandSlot).map(slot => slot.id);
  return {
    mainSlotIds: mainSlotIds.length ? mainSlotIds : [SLOTS.MAIN_HAND],
    offSlotIds: offSlotIds.length ? offSlotIds : [SLOTS.OFF_HAND]
  };
}

/** The two-handed weapon held in any main-hand slot, if any. */
function twoHandedWeaponIn(slotMap, layout) {
  for (const slotId of layout.mainSlotIds) {
    const item = slotMap.get(slotId);
    if (item && isTwoHandedWeapon(item)) return item;
  }
  return null;
}

/**
 * Build Map of currently equipped slots for an actor
 * @param {Object} actor
 * @returns {Map<string, Object>} Map of slotId -> item document
 */
export function getActorEquippedMap(actor) {
  const slotMap = new Map();
  if (!isSupportedActor(actor) || !actor.items) return slotMap;

  const equippedItems = Array.from(actor.items.values()).filter(i => (
    i?.system?.equipped === true && !i?.system?.container
  ));

  const validSlotIdSet = new Set(actorSlotDefinitions(actor).map(s => s.id));
  const layout = getTwoHandLayout(actor);

  // Step 1: Place items that have explicit slot flags
  const unassigned = [];
  for (const item of equippedItems) {
    const slotId = getItemAssignedSlot(item);
    if (slotId && validSlotIdSet.has(slotId) && !slotMap.has(slotId)) {
      slotMap.set(slotId, item);
    } else {
      unassigned.push(item);
    }
  }

  // Step 2: Auto-reconcile unassigned equipped items into free valid slots
  if (!getPaperdollRuntime().autoReconcileSlots()) return slotMap;
  for (const item of unassigned) {
    for (const slotId of getValidSlotsForItem(item, actor)) {
      if (slotMap.has(slotId)) continue;
      // An off hand is not available while a two-handed weapon is held.
      if (layout.offSlotIds.includes(slotId) && twoHandedWeaponIn(slotMap, layout)) continue;
      slotMap.set(slotId, item);
      break;
    }
  }

  return slotMap;
}

/**
 * Check if the off hand is locked by a two-handed weapon in a main hand
 * @param {Map<string, Object>} slotMap
 * @param {Object} [actor]
 * @returns {boolean}
 */
export function isOffHandLockedBy2H(slotMap, actor = null) {
  return Boolean(twoHandedWeaponIn(slotMap, getTwoHandLayout(actor)));
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
        validate: (actor, item, targetSlotId) => {
          if (!targetSlotId) {
            return ValidationResult.fail(ruleMessage("noTargetSlot"), "NO_TARGET_SLOT");
          }
          if (!isItemCompatibleWithSlot(item, targetSlotId, actor)) {
            const valid = getValidSlotsForItem(item, actor).map(slotId => slotDisplayName(actor, slotId));
            return ValidationResult.fail(
              ruleMessage("slotIncompatible", {
                item: item.name,
                slot: slotDisplayName(actor, targetSlotId),
                valid: valid.join(", ") || "—"
              }),
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

          for (const [slotId, worn] of slotMap) {
            if (worn.id === item.id || !isBodyArmor(worn)) continue;
            // Replacing the armor in its own slot is a swap.
            if (slotId === targetSlotId) return ValidationResult.success({ autoSwapItems: [worn] });
            return ValidationResult.fail(
              ruleMessage("armorAlreadyEquipped", { item: item.name, conflict: worn.name }),
              "ARMOR_ALREADY_EQUIPPED",
              { conflictItem: worn }
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
          const layout = getTwoHandLayout(actor);

          // Case A: Equipping into an off hand while a main hand holds a 2H weapon
          if (layout.offSlotIds.includes(targetSlotId)) {
            const twoHanded = twoHandedWeaponIn(slotMap, layout);
            if (twoHanded && twoHanded.id !== item.id) {
              return ValidationResult.fail(
                ruleMessage("offHandBlocked", { item: item.name, conflict: twoHanded.name }),
                "OFFHAND_BLOCKED_BY_2H",
                { conflictItem: twoHanded }
              );
            }
          }

          // Case B: Equipping a 2H weapon into a main hand frees the off hands
          if (layout.mainSlotIds.includes(targetSlotId) && isTwoHandedWeapon(item)) {
            const offHandItems = layout.offSlotIds
              .map(slotId => slotMap.get(slotId))
              .filter(offHandItem => offHandItem && offHandItem.id !== item.id);
            if (offHandItems.length) return ValidationResult.success({ autoSwapItems: offHandItems });
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

          for (const [slotId, other] of slotMap) {
            if (slotId === targetSlotId || other.id === item.id || !isShield(other)) continue;
            return ValidationResult.fail(
              ruleMessage("shieldAlreadyEquipped", { item: item.name, conflict: other.name }),
              "SHIELD_ALREADY_EQUIPPED",
              { conflictItem: other }
            );
          }
          return ValidationResult.success();
        }
      },

      // Rule 5: "Single per actor" slots allow one item of their kind
      {
        id: "single_per_actor",
        name: "Single per Actor",
        validate: (actor, item, targetSlotId, slotMap) => {
          const slot = actorSlotDefinitions(actor).find(s => s.id === targetSlotId);
          if (!slot?.rules?.singlePerActor) return ValidationResult.success();

          const kind = classifyItem(item);
          for (const [slotId, other] of slotMap) {
            if (slotId === targetSlotId || other.id === item.id || classifyItem(other) !== kind) continue;
            return ValidationResult.fail(
              ruleMessage("singlePerActor", { item: item.name, conflict: other.name }),
              "SINGLE_PER_ACTOR",
              { conflictItem: other }
            );
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
      return ValidationResult.fail(ruleMessage("missingArguments"), "INVALID_ARGUMENTS");
    }
    if (!isSupportedActor(actor)) return ValidationResult.success();

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

/**
 * Pick the slot an item should be equipped into.
 * Prefers a free slot the rules accept, then an occupied one the rules accept
 * as a swap. When no slot passes, the first candidate is returned so the caller
 * can report the rule failure.
 * @param {Object} actor
 * @param {Object} item
 * @param {Map<string, Object>} [slotMap]
 * @returns {string|null}
 */
export function findEquipSlot(actor, item, slotMap = getActorEquippedMap(actor)) {
  const candidates = getValidSlotsForItem(item, actor);
  if (!candidates.length) return null;

  const passes = slotId => equipmentRuleEngine.validateEquip(actor, item, slotId, { slotMap }).valid;
  const isFree = slotId => !slotMap.has(slotId) || slotMap.get(slotId)?.id === item.id;

  return candidates.find(slotId => isFree(slotId) && passes(slotId))
    ?? candidates.find(passes)
    ?? candidates.find(isFree)
    ?? candidates[0];
}
