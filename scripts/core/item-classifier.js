// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Classifier
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import { getActorSlots } from "./paperdoll-templates.js";
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
  const name = (item.name ?? "").toLowerCase();

  // If item is specifically pants, shirt, bracelet, cloak, head, etc., it's not body armor
  if (
    name.includes("штаны") || name.includes("pants") || name.includes("trousers") || name.includes("брюки") ||
    name.includes("браслет") || name.includes("bracelet") ||
    name.includes("рубаха") || name.includes("поддоспешник") || name.includes("shirt") ||
    name.includes("плащ") || name.includes("cloak") || name.includes("cape") ||
    name.includes("шлем") || name.includes("helm") || name.includes("сапоги") || name.includes("boots") ||
    name.includes("перчатки") || name.includes("gloves") || name.includes("пояс") || name.includes("belt")
  ) {
    return false;
  }

  return (
    ["light", "medium", "heavy", "natural"].includes(armorType) ||
    ["light", "medium", "heavy"].includes(subType) ||
    armorType.includes("Armor") ||
    armorType.includes("armor") ||
    (armorType === "clothing" && (
      name.includes("доспех") || name.includes("латы") || name.includes("кольчуга") ||
      name.includes("панцирь") || name.includes("кираса") || name.includes("роба") ||
      name.includes("robe") || name.includes("одежда") || name.includes("vestment") ||
      name.includes("костюм")
    ))
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

  // Pants / Trousers / Legs
  if (
    systemType === "pants" ||
    systemType === "legs" ||
    systemType === "trousers" ||
    subType === "pants" ||
    subType === "legs" ||
    name.includes("pants") ||
    name.includes("trousers") ||
    name.includes("breeches") ||
    name.includes("leggings") ||
    name.includes("штаны") ||
    name.includes("брюки") ||
    name.includes("порты") ||
    name.includes("шорты") ||
    name.includes("рейтузы") ||
    name.includes("чулки")
  ) {
    return "legs";
  }

  // Bracelet / Wrist / Bracers
  if (
    systemType === "bracelet" ||
    systemType === "wrist" ||
    subType === "bracelet" ||
    subType === "wrist" ||
    name.includes("bracelet") ||
    name.includes("wrist") ||
    name.includes("браслет") ||
    name.includes("браслеты") ||
    name.includes("запястье") ||
    name.includes("напульсник")
  ) {
    return "bracelet";
  }

  // Underarmor / Shirt
  if (
    systemType === "underarmor" ||
    systemType === "shirt" ||
    subType === "underarmor" ||
    name.includes("underarmor") ||
    name.includes("поддоспешник") ||
    name.includes("рубаха") ||
    name.includes("рубашка") ||
    name.includes("гамбезон") ||
    name.includes("туника") ||
    name.includes("жилет")
  ) {
    return "underarmor";
  }

  // Badge / Medal / Ribbon
  if (
    systemType === "badge" ||
    systemType === "medal" ||
    subType === "badge" ||
    name.includes("медаль") ||
    name.includes("орден") ||
    name.includes("награда") ||
    name.includes("нашивка") ||
    name.includes("лента") ||
    name.includes("значок") ||
    name.includes("badge") ||
    name.includes("medal") ||
    name.includes("ribbon")
  ) {
    return "badge";
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
    name.includes("корона") ||
    name.includes("шапка")
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

  // Cloak / Shoulders / Outerwear
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
    name.includes("пелерина") ||
    name.includes("верхняя одежда")
  ) {
    return "cloak";
  }

  // Hands / Gloves / Bracers (if not bracelet)
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
    name.includes("поножи") ||
    name.includes("обувь")
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

  // Fallback to item parent if actor is not explicitly supplied
  const effectiveActor = actor || (item.parent?.documentName === "Actor" ? item.parent : null);
  const classification = classifyItem(item);
  const systemType = (item.system?.type?.value ?? "").toLowerCase();
  const subType = (item.system?.type?.subtype ?? "").toLowerCase();
  const itemName = (item.name ?? "").toLowerCase();

  // If actor is available, check actor's template slots first
  if (effectiveActor) {
    try {
      const templateSlots = getActorSlots ? getActorSlots(effectiveActor) : null;

      if (Array.isArray(templateSlots) && templateSlots.length > 0) {
        const primaryMatches = [];
        const genericMatches = [];

        for (const slot of templateSlots) {
          // Check item types filter
          if (slot.itemTypes && !slot.itemTypes.includes(item.type)) {
            continue;
          }

          const slotId = (slot.id ?? "").toLowerCase();
          const slotLabel = (slot.label ?? slot.labelKey ?? "").toLowerCase();
          const slotCategory = (slot.category ?? "").toLowerCase();

          // 1. Check body armor
          if (isBodyArmor(item)) {
            if (slot.rules?.isArmor || slotId === SLOTS.ARMOR || slotId.includes("armor") || slotLabel.includes("доспех") || slot.accepts?.includes("armor")) {
              primaryMatches.push(slot.id);
            }
            continue;
          }

          // 2. Check shield
          if (isShield(item)) {
            if (slot.rules?.isShield || slotId === SLOTS.OFF_HAND || slotId === SLOTS.MAIN_HAND || slotCategory === "hand" || slot.accepts?.includes("shield")) {
              primaryMatches.push(slot.id);
            }
            continue;
          }

          // 3. Check 2H weapon
          if (isTwoHandedWeapon(item)) {
            if (slotId === SLOTS.MAIN_HAND || slot.rules?.locksOffHandOn2H || slotCategory === "hand") {
              primaryMatches.push(slot.id);
            }
            continue;
          }

          // 4. Check explicit accepts array against classification, systemType, subType, and itemName
          if (Array.isArray(slot.accepts) && slot.accepts.length > 0) {
            const matchesTag = slot.accepts.some(tag => {
              const t = (tag || "").toLowerCase();
              return t === classification || t === systemType || t === subType || itemName.includes(t);
            });
            if (matchesTag) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // 5. Semantic matching for custom and preset slots:
          // Legs / Pants
          if (classification === "legs" || itemName.includes("штаны") || itemName.includes("брюки") || itemName.includes("pants") || itemName.includes("trousers")) {
            if (slotId.includes("pant") || slotId.includes("leg") || slotId.includes("штаны") || slotId.includes("брюки") || slotLabel.includes("штаны") || slotLabel.includes("брюки") || slotLabel.includes("ноги")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Bracelet / Wrist
          if (classification === "bracelet" || itemName.includes("браслет") || itemName.includes("bracelet") || itemName.includes("wrist")) {
            if (slotId.includes("brace") || slotId.includes("wrist") || slotId.includes("браслет") || slotLabel.includes("браслет") || slotLabel.includes("запястье") || slotLabel.includes("наруч")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Underarmor / Shirt
          if (classification === "underarmor" || itemName.includes("поддоспешник") || itemName.includes("рубаха") || itemName.includes("shirt")) {
            if (slotId.includes("under") || slotId.includes("shirt") || slotId.includes("поддоспешник") || slotLabel.includes("поддоспешник") || slotLabel.includes("рубаха")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Badge / Medal / Ribbon
          if (classification === "badge" || itemName.includes("награда") || itemName.includes("медаль") || itemName.includes("лента") || itemName.includes("нашивка") || itemName.includes("badge") || itemName.includes("medal")) {
            if (slotId.includes("badge") || slotId.includes("medal") || slotId.includes("наград") || slotId.includes("медал") || slotLabel.includes("наград") || slotLabel.includes("медал") || slotLabel.includes("лент") || slotLabel.includes("нашивк")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Head
          if (classification === "head") {
            if (slotId === SLOTS.HEAD || slotId.includes("head") || slotId.includes("helm") || slotLabel.includes("голов") || slotLabel.includes("шлем") || slotLabel.includes("шапк")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Neck
          if (classification === "neck") {
            if (slotId === SLOTS.NECK || slotId.includes("neck") || slotId.includes("amulet") || slotLabel.includes("шея") || slotLabel.includes("амулет") || slotLabel.includes("ожерелье") || slotLabel.includes("кулон")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Cloak / Outerwear
          if (classification === "cloak") {
            if (slotId === SLOTS.CLOAK || slotId.includes("cloak") || slotId.includes("cape") || slotLabel.includes("плащ") || slotLabel.includes("одежда") || slotLabel.includes("накидка") || slotLabel.includes("мантия")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Hands / Gloves
          if (classification === "hands") {
            if (slotId === SLOTS.HANDS || slotId.includes("hand") || slotId.includes("glove") || slotLabel.includes("руки") || slotLabel.includes("перчатк") || slotLabel.includes("рукавиц")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Waist / Belt
          if (classification === "waist") {
            if (slotId === SLOTS.WAIST || slotId.includes("waist") || slotId.includes("belt") || slotLabel.includes("пояс") || slotLabel.includes("ремень")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Feet / Boots
          if (classification === "feet") {
            if (slotId === SLOTS.FEET || slotId.includes("feet") || slotId.includes("boot") || slotLabel.includes("сапог") || slotLabel.includes("обувь") || slotLabel.includes("ботинок")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Rings
          if (classification === "ring") {
            if (slotCategory === "ring" || slotId.includes("ring") || slotLabel.includes("кольц") || slotLabel.includes("перстен")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Weapons & Hands
          if (classification === "weapon" || classification === "focus") {
            if (slotCategory === "hand" || slotId === SLOTS.MAIN_HAND || slotId === SLOTS.OFF_HAND || slotId.includes("weapon") || slotLabel.includes("рука") || slotLabel.includes("оружие")) {
              primaryMatches.push(slot.id);
              continue;
            }
          }

          // Generic custom slots (Wondrous, Magic, Trinket)
          if (slotLabel.includes("чудесн") || slotLabel.includes("магическ") || slotLabel.includes("wondrous") || slotLabel.includes("magic") || slotLabel.includes("trinket") || slotLabel.includes("безделушк")) {
            if (item.type === "equipment" || item.type === "loot" || item.type === "consumable") {
              genericMatches.push(slot.id);
              continue;
            }
          }

          // If slot has empty accepts and matches item.type without specific restrictions
          if ((!slot.accepts || slot.accepts.length === 0) && slot.itemTypes?.includes(item.type)) {
            // If the slot is a generic equipment slot (not a specialized neck/head/etc slot)
            if (!slotLabel.includes("амулет") && !slotLabel.includes("шлем") && !slotLabel.includes("голова") && !slotLabel.includes("кольцо")) {
              genericMatches.push(slot.id);
            }
          }
        }

        if (primaryMatches.length > 0) {
          return primaryMatches;
        }
        if (genericMatches.length > 0) {
          return genericMatches;
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
    case "legs":
      return ["pants", "legs", SLOTS.FEET];
    case "bracelet":
      return ["bracelet", "wrist", SLOTS.HANDS, SLOTS.RING_1, SLOTS.RING_2];
    case "underarmor":
      return ["underarmor", "shirt", SLOTS.ARMOR, SLOTS.CLOAK];
    case "badge":
      return ["badge", "medal", SLOTS.CLOAK, SLOTS.NECK];
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

  const effectiveActor = actor || (item.parent?.documentName === "Actor" ? item.parent : null);
  if (effectiveActor) {
    const actorSlots = getActorSlots ? getActorSlots(effectiveActor) : [];
    const targetSlot = actorSlots.find(s => s.id === slotId);
    if (targetSlot) {
      // 1. If slot itemTypes does not include item document type, reject
      if (targetSlot.itemTypes && !targetSlot.itemTypes.includes(item.type)) {
        return false;
      }
      // 2. If 2H weapon, cannot put in offhand or shield-only slot
      if (isTwoHandedWeapon(item) && (slotId === SLOTS.OFF_HAND || targetSlot.rules?.isShield)) {
        return false;
      }
      // 3. If body armor, cannot put in non-armor slots (head, ring, hands, feet, etc.)
      if (isBodyArmor(item)) {
        const isArmorSlot = Boolean(
          targetSlot.rules?.isArmor ||
          targetSlot.id === SLOTS.ARMOR ||
          targetSlot.id.includes("armor") ||
          targetSlot.accepts?.includes("armor") ||
          (targetSlot.label && targetSlot.label.toLowerCase().includes("доспех"))
        );
        if (!isArmorSlot) {
          return false;
        }
      }
      // 4. If shield, cannot put in non-hand/shield slots
      if (isShield(item)) {
        const isShieldSlot = Boolean(
          targetSlot.category === "hand" ||
          targetSlot.rules?.isShield ||
          targetSlot.id === SLOTS.OFF_HAND ||
          targetSlot.id === SLOTS.MAIN_HAND ||
          targetSlot.accepts?.includes("shield")
        );
        if (!isShieldSlot) {
          return false;
        }
      }

      // Check if slot specifically matches valid slots for this item
      const validSlots = getValidSlotsForItem(item, effectiveActor);
      if (validSlots.includes(slotId)) return true;

      // Allow direct drop if the target slot accepts this itemType and has no strict disqualification
      if (targetSlot.itemTypes?.includes(item.type)) {
        return true;
      }
    }
  }

  const validSlots = getValidSlotsForItem(item, effectiveActor);
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
  const validSlots = getValidSlotsForItem(item, actor);
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

