// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Classifier
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import { slotRegistry } from "./slot-definitions.js";

/**
 * Standard physical inventory item types in dnd5e
 */
export const PHYSICAL_ITEM_TYPES = new Set([
  "weapon",
  "equipment",
  "consumable",
  "tool",
  "loot",
  "container",
  "backpack"
]);

/**
 * Check if item is a physical inventory item (not a feat, spell, class, or race)
 */
export function isPhysicalItem(item) {
  if (!item) return false;
  return PHYSICAL_ITEM_TYPES.has(item.type);
}

/**
 * Check if item properties has a specific key/tag
 * Handles Set, Array, and Object formats across dnd5e versions (3.x, 4.x, 5.x)
 */
export function hasItemProperty(item, propKey) {
  const props = item?.system?.properties;
  if (!props) return false;

  if (props instanceof Set) {
    return props.has(propKey);
  }
  if (Array.isArray(props)) {
    return props.includes(propKey);
  }
  if (typeof props === "object") {
    return Boolean(props[propKey]);
  }
  return false;
}

/**
 * Check if item is a two-handed weapon
 */
export function isTwoHandedWeapon(item) {
  if (!item || item.type !== "weapon") return false;
  return hasItemProperty(item, "two") || hasItemProperty(item, "two-handed");
}

/**
 * Check if item is a shield
 */
export function isShield(item) {
  if (!item) return false;
  const typeVal = item.system?.type?.value ?? item.system?.armor?.type ?? "";
  const armorType = item.system?.armor?.type ?? "";
  return typeVal === "shield" || armorType === "shield" || item.type === "shield";
}

/**
 * Check if item is a body armor
 */
export function isBodyArmor(item) {
  if (!item || item.type !== "equipment") return false;
  const armorType = item.system?.type?.value ?? item.system?.armor?.type ?? "";
  const subType = item.system?.type?.subtype ?? "";
  return (
    ["light", "medium", "heavy", "natural", "clothing"].includes(armorType) ||
    ["light", "medium", "heavy", "clothing"].includes(subType) ||
    armorType.includes("Armor") ||
    armorType.includes("armor")
  );
}

/**
 * Determine item classification tag based on name, type, subtype, and dnd5e properties
 */
export function classifyItem(item) {
  if (!item) return "misc";

  const type = item.type;
  const systemType = (item.system?.type?.value ?? "").toLowerCase();
  const subType = (item.system?.type?.subtype ?? "").toLowerCase();
  const name = (item.name ?? "").toLowerCase();

  // Weapon
  if (type === "weapon") {
    if (isTwoHandedWeapon(item)) return "weapon_two_handed";
    return "weapon";
  }

  // Shield
  if (isShield(item)) {
    return "shield";
  }

  // Body Armor
  if (isBodyArmor(item)) {
    return "armor";
  }

  // Headgear
  if (
    systemType === "helmet" ||
    systemType === "head" ||
    subType === "helmet" ||
    subType === "head" ||
    name.includes("helmet") ||
    name.includes("helm") ||
    name.includes("circlet") ||
    name.includes("hood") ||
    name.includes("crown") ||
    name.includes("mask") ||
    name.includes("шлем") ||
    name.includes("венец") ||
    name.includes("диадема") ||
    name.includes("капюшон") ||
    name.includes("маска") ||
    name.includes("корона")
  ) {
    return "head";
  }

  // Neck / Amulet
  if (
    systemType === "neck" ||
    systemType === "amulet" ||
    systemType === "necklace" ||
    subType === "amulet" ||
    subType === "necklace" ||
    name.includes("amulet") ||
    name.includes("necklace") ||
    name.includes("pendant") ||
    name.includes("medallion") ||
    name.includes("periapt") ||
    name.includes("collar") ||
    name.includes("амулет") ||
    name.includes("ожерелье") ||
    name.includes("кулон") ||
    name.includes("медальон") ||
    name.includes("периапт")
  ) {
    return "neck";
  }

  // Cloak / Shoulders
  if (
    systemType === "cloak" ||
    systemType === "cape" ||
    systemType === "mantle" ||
    subType === "cloak" ||
    subType === "cape" ||
    name.includes("cloak") ||
    name.includes("cape") ||
    name.includes("mantle") ||
    name.includes("shawl") ||
    name.includes("плащ") ||
    name.includes("накидка") ||
    name.includes("мантия") ||
    name.includes("пелерина")
  ) {
    return "cloak";
  }

  // Hands / Gloves
  if (
    systemType === "hands" ||
    systemType === "gloves" ||
    systemType === "gauntlets" ||
    systemType === "bracers" ||
    subType === "gloves" ||
    subType === "gauntlets" ||
    name.includes("glove") ||
    name.includes("gauntlet") ||
    name.includes("bracer") ||
    name.includes("handwrap") ||
    name.includes("перчатки") ||
    name.includes("наручи") ||
    name.includes("рукавицы")
  ) {
    return "hands";
  }

  // Waist / Belt
  if (
    systemType === "waist" ||
    systemType === "belt" ||
    systemType === "girdle" ||
    subType === "belt" ||
    name.includes("belt") ||
    name.includes("girdle") ||
    name.includes("sash") ||
    name.includes("cinch") ||
    name.includes("пояс") ||
    name.includes("кушак") ||
    name.includes("ремень")
  ) {
    return "waist";
  }

  // Feet / Boots
  if (
    systemType === "feet" ||
    systemType === "boots" ||
    systemType === "shoes" ||
    systemType === "greaves" ||
    subType === "boots" ||
    subType === "shoes" ||
    name.includes("boot") ||
    name.includes("shoe") ||
    name.includes("greave") ||
    name.includes("slipper") ||
    name.includes("sandal") ||
    name.includes("сапоги") ||
    name.includes("ботинки") ||
    name.includes("туфли") ||
    name.includes("поножи")
  ) {
    return "feet";
  }

  // Rings
  if (
    systemType === "ring" ||
    subType === "ring" ||
    name.includes("ring") ||
    name.includes("band") ||
    name.includes("signet") ||
    name.includes("кольцо") ||
    name.includes("перстень")
  ) {
    return "ring";
  }

  // Containers
  if (type === "container" || type === "backpack") {
    return "container";
  }

  // Consumables
  if (type === "consumable") {
    return "consumable";
  }

  // Focus / Wand / Rod / Staff
  if (
    systemType === "wand" ||
    systemType === "rod" ||
    systemType === "staff" ||
    systemType === "focus" ||
    name.includes("wand") ||
    name.includes("rod") ||
    name.includes("staff") ||
    name.includes("focus") ||
    name.includes("палочка") ||
    name.includes("жезл") ||
    name.includes("посох") ||
    name.includes("фокус")
  ) {
    return "focus";
  }

  // Generic equipment fallback
  if (type === "equipment") {
    return "equipment";
  }

  return type;
}

export const classifyItemType = classifyItem;

/**
 * Get all allowable slot IDs for a given item, optionally resolved against an actor's active template
 * @param {Object} item
 * @param {Object} [actor=null]
 * @returns {Array<string>}
 */
export function getValidSlotsForItem(item, actor = null) {
  if (!item) return [];

  const classification = classifyItem(item);

  // If actor is provided, check actor's custom template slots first
  if (actor) {
    try {
      const templateSlots = (actor.getFlag ? actor.getFlag(MODULE_ID, FLAGS.CUSTOM_TEMPLATE)?.slots : null) ||
                            (globalThis.ActorInventoryManager?.getActorSlots ? globalThis.ActorInventoryManager.getActorSlots(actor) : null);

      if (Array.isArray(templateSlots) && templateSlots.length > 0) {
        const matchingSlotIds = [];
        for (const slot of templateSlots) {
          if (!slot.itemTypes || !slot.itemTypes.includes(item.type)) {
            continue;
          }

          // Check armor rules
          if (isBodyArmor(item)) {
            if (slot.rules?.isArmor || slot.id === SLOTS.ARMOR || (slot.accepts && slot.accepts.includes("armor"))) {
              matchingSlotIds.push(slot.id);
            }
            continue;
          }

          // Check shield rules
          if (isShield(item)) {
            if (slot.rules?.isShield || slot.id === SLOTS.OFF_HAND || slot.id === SLOTS.MAIN_HAND || (slot.accepts && slot.accepts.includes("shield"))) {
              matchingSlotIds.push(slot.id);
            }
            continue;
          }

          // Check 2H weapon
          if (isTwoHandedWeapon(item)) {
            if (slot.id === SLOTS.MAIN_HAND || slot.rules?.locksOffHandOn2H || slot.category === "hand") {
              matchingSlotIds.push(slot.id);
            }
            continue;
          }

          // Check accepts array against classification and tags
          if (Array.isArray(slot.accepts) && slot.accepts.length > 0) {
            const systemType = (item.system?.type?.value ?? "").toLowerCase();
            const subType = (item.system?.type?.subtype ?? "").toLowerCase();
            const itemName = (item.name ?? "").toLowerCase();

            const matchesTag = slot.accepts.some(tag => {
              const t = tag.toLowerCase();
              return t === classification || t === systemType || t === subType || itemName.includes(t);
            });

            if (matchesTag) {
              matchingSlotIds.push(slot.id);
            }
          } else {
            matchingSlotIds.push(slot.id);
          }
        }

        if (matchingSlotIds.length > 0) {
          return matchingSlotIds;
        }
      }
    } catch {}
  }

  // Standard fallback
  switch (classification) {
    case "weapon_two_handed":
      return [SLOTS.MAIN_HAND];
    case "weapon":
      return [SLOTS.MAIN_HAND, SLOTS.OFF_HAND];
    case "shield":
      return [SLOTS.OFF_HAND, SLOTS.MAIN_HAND];
    case "armor":
      return [SLOTS.ARMOR];
    case "head":
      return [SLOTS.HEAD];
    case "neck":
      return [SLOTS.NECK];
    case "cloak":
      return [SLOTS.CLOAK];
    case "hands":
      return [SLOTS.HANDS];
    case "waist":
      return [SLOTS.WAIST];
    case "feet":
      return [SLOTS.FEET];
    case "ring":
      return [SLOTS.RING_1, SLOTS.RING_2];
    case "focus":
      return [SLOTS.MAIN_HAND, SLOTS.OFF_HAND];
    case "consumable":
      return [SLOTS.QUICK_1, SLOTS.QUICK_2, SLOTS.QUICK_3, SLOTS.QUICK_4, SLOTS.MAIN_HAND, SLOTS.OFF_HAND];
    default:
      // Check registered slots
      return slotRegistry.getAll()
        .filter(slot => slot.itemTypes.includes(item.type))
        .map(slot => slot.id);
  }
}

/**
 * Check if an item can fit into a specific target slot
 * @param {Object} item
 * @param {string} slotId
 * @param {Object} [actor=null]
 * @returns {boolean}
 */
export function isItemCompatibleWithSlot(item, slotId, actor = null) {
  if (!item || !slotId) return false;
  const validSlots = getValidSlotsForItem(item, actor);
  return validSlots.includes(slotId);
}

/**
 * Get currently assigned slot from item flags
 * @param {Object} item
 * @returns {string|null}
 */
export function getItemAssignedSlot(item) {
  return (
    item?.flags?.[MODULE_ID]?.[FLAGS.SLOT] ??
    item?.flags?.[MODULE_ID]?.slot ??
    null
  );
}

/**
 * Find the best available slot on an actor for an item being equipped
 * @param {Object} actor
 * @param {Object} item
 * @param {Map<string, Object>} currentSlotMap
 * @returns {string|null}
 */
export function findBestSlotForEquipping(actor, item, currentSlotMap) {
  const validSlots = getValidSlotsForItem(item);
  if (!validSlots.length) return null;

  // First preference: an empty valid slot
  for (const slotId of validSlots) {
    if (!currentSlotMap.has(slotId)) {
      return slotId;
    }
  }

  // If no empty slot, return the first valid slot (for swapping)
  return validSlots[0];
}
