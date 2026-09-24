// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Item Classifier
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import {
  matchPreArmorClassification,
  matchesFocusClassification,
  matchWearableClassification,
  nameHasAnyToken,
  nameHasToken
} from "./item-classification-rules.js";
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
  "container"
]);

/**
 * Classifications that name a specific place on the body or in the hands.
 * Everything else ("equipment", "loot", "tool", "consumable", ...) is generic.
 */
const SPECIFIC_CLASSIFICATIONS = new Set([
  "weapon", "weapon_two_handed", "shield", "armor",
  "head", "neck", "cloak", "hands", "waist", "feet", "ring",
  "legs", "bracelet", "underarmor", "badge", "focus", "container"
]);

const ARMOR_TYPES = ["light", "medium", "heavy", "natural"];

/** Names that are clothing but never the body-armor layer. */
const NOT_BODY_ARMOR_TOKENS = [
  "pants", "trousers", "штан", "брюк",
  "bracelet", "браслет",
  "shirt", "рубах", "рубашк", "поддоспешник",
  "cloak", "cape", "плащ", "верхняя одежда",
  "helm", "helmet", "шлем",
  "boot", "сапог",
  "glove", "перчатк",
  "belt", "пояс"
];

/** Clothing names that do occupy the body-armor layer. */
const BODY_CLOTHING_TOKENS = [
  "доспех", "латы", "кольчуг", "панцир", "кирас", "роба", "одежд", "костюм",
  "robe", "vestment", "clothes", "outfit", "garb", "attire"
];

/**
 * Check if item is a physical inventory item (not a feat, spell, class, or race)
 */
export function isPhysicalItem(item) {
  if (!item) return false;
  return PHYSICAL_ITEM_TYPES.has(item.type);
}

/**
 * Can this item be marked as equipped at all?
 * dnd5e only gives `system.equipped` to equippable item types (not to loot).
 * @param {Object} item
 * @returns {boolean}
 */
export function canItemBeEquipped(item) {
  return typeof item?.system?.equipped === "boolean";
}

/**
 * Does the item's `system.properties` set contain the key?
 */
export function hasItemProperty(item, propKey) {
  return Boolean(item?.system?.properties?.has?.(propKey));
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
  return item.system?.type?.value === "shield";
}

/** Does the item carry a real armor category (light/medium/heavy/natural)? */
function hasArmorCategory(item) {
  const armorType = item.system?.type?.value ?? "";
  const subType = item.system?.type?.subtype ?? "";
  return ARMOR_TYPES.includes(armorType) || ARMOR_TYPES.includes(subType);
}

/**
 * Check if item is a body armor
 */
export function isBodyArmor(item) {
  if (!item || item.type !== "equipment" || isShield(item)) return false;

  // A real armor category always wins over the name: "Chain Shirt" is medium armor.
  if (hasArmorCategory(item)) return true;

  const armorType = String(item.system?.type?.value ?? "");
  const name = (item.name ?? "").toLowerCase();
  if (nameHasAnyToken(name, NOT_BODY_ARMOR_TOKENS)) return false;

  return /armou?r/i.test(armorType) ||
    (armorType === "clothing" && nameHasAnyToken(name, BODY_CLOTHING_TOKENS));
}

/**
 * Determine item classification tag based on name, type, subtype, and dnd5e properties
 */
export function classifyItem(item) {
  if (!item) return "misc";

  const type = item.type;
  const systemType = String(item.system?.type?.value ?? "").toLowerCase();
  const subType = String(item.system?.type?.subtype ?? "").toLowerCase();
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

  // Real armor, whatever it is called
  if (type === "equipment" && hasArmorCategory(item)) {
    return "armor";
  }

  const descriptor = { systemType, subType, name };
  const preArmorClassification = matchPreArmorClassification(descriptor);
  if (preArmorClassification) return preArmorClassification;

  // Body Armor
  if (isBodyArmor(item)) {
    return "armor";
  }

  const wearableClassification = matchWearableClassification(descriptor);
  if (wearableClassification) return wearableClassification;

  // Containers
  if (type === "container") {
    return "container";
  }

  // Consumables
  if (type === "consumable") {
    return "consumable";
  }

  if (matchesFocusClassification(descriptor)) return "focus";

  // Generic equipment fallback
  if (type === "equipment") {
    return "equipment";
  }

  return type;
}

/**
 * Is this a generic classification (no dedicated body location)?
 * @param {string} classification
 * @returns {boolean}
 */
export function isGenericClassification(classification) {
  return !SPECIFIC_CLASSIFICATIONS.has(classification);
}

// ── Slot descriptors ─────────────────────────────────────

/** Split a slot id into lowercase words: "bodyArmor" -> ["body", "armor"]. */
function slotIdWords(slot) {
  return String(slot?.id ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function slotLabel(slot) {
  return String(slot?.label ?? slot?.labelKey ?? "").toLowerCase();
}

function slotAccepts(slot, tag) {
  return Array.isArray(slot?.accepts) && slot.accepts.some(t => String(t).toLowerCase() === tag.toLowerCase());
}

/**
 * Does the slot accept this document type? A slot without type filters takes any type.
 * @param {Object} slot
 * @param {Object} item
 * @returns {boolean}
 */
export function slotAllowsItemType(slot, item) {
  if (!Array.isArray(slot?.itemTypes) || slot.itemTypes.length === 0) return true;
  return slot.itemTypes.includes(item?.type);
}

/** Is this the body-armor slot? */
export function isArmorSlot(slot) {
  if (!slot) return false;
  const words = slotIdWords(slot);
  return Boolean(
    slot.rules?.isArmor ||
    slot.id === SLOTS.ARMOR ||
    words.includes("armor") || words.includes("armour") || words.includes("bodyarmor") ||
    slotAccepts(slot, "armor") || slotAccepts(slot, "bodyArmor") ||
    nameHasToken(slotLabel(slot), "доспех")
  );
}

/** Does this slot hold something in a hand (weapon, shield, focus)? */
export function isHandHoldSlot(slot) {
  if (!slot) return false;
  return Boolean(
    String(slot.category ?? "").toLowerCase() === "hand" ||
    slot.id === SLOTS.MAIN_HAND ||
    slot.id === SLOTS.OFF_HAND ||
    slot.rules?.locksOffHandOn2H ||
    slot.rules?.isShield
  );
}

/** Can a shield go into this slot? */
export function isShieldSlot(slot) {
  if (!slot) return false;
  return Boolean(isHandHoldSlot(slot) || slotAccepts(slot, "shield"));
}

/**
 * Does this slot represent an off hand?
 * Off-hand slots are excluded for two-handed weapons and locked by them.
 */
export function isOffHandSlot(slot) {
  if (!slot) return false;
  const words = slotIdWords(slot);
  const label = slotLabel(slot);
  return Boolean(
    slot.id === SLOTS.OFF_HAND ||
    slot.rules?.isShield ||
    words.includes("offhand") ||
    (words.includes("off") && words.includes("hand")) ||
    nameHasAnyToken(label, ["off hand", "off-hand", "offhand", "щит", "лев"])
  );
}

/** Is this a main-hand slot (the one a two-handed weapon occupies)? */
export function isMainHandSlot(slot) {
  if (!slot || isOffHandSlot(slot)) return false;
  return Boolean(slot.id === SLOTS.MAIN_HAND || slot.rules?.locksOffHandOn2H);
}

/**
 * Match a 2-handed weapon slot.
 * A two-handed weapon only ever goes in a main hand - offering the off hand
 * makes auto-equip pick a slot the rule engine then refuses.
 */
function isTwoHandedWeaponSlotMatch(slot) {
  if (isOffHandSlot(slot)) return false;
  return Boolean(isMainHandSlot(slot) || String(slot.category ?? "").toLowerCase() === "hand");
}

/**
 * Match the slot's `accepts` tags against the item.
 * Items with a specific body location match on that classification only, so
 * a cloak never lands in the armor slot because its name contains "light".
 */
function matchesSlotAccepts(slot, item) {
  if (!Array.isArray(slot.accepts) || slot.accepts.length === 0) return false;
  return slot.accepts.some(tag => {
    const t = String(tag || "").toLowerCase();
    if (!t) return false;
    if (t === item.classification) return true;
    if (!item.generic) return false;
    return t === item.systemType || t === item.subType || nameHasToken(item.name, t);
  });
}

/**
 * Semantic keyword matching for custom and preset slots.
 * The item side uses the classification only; the slot side reads the
 * GM-authored id and label.
 */
function matchesSemanticSlot(slot, classification) {
  const slotId = String(slot.id ?? "").toLowerCase();
  const label = slotLabel(slot);
  const category = String(slot.category ?? "").toLowerCase();
  const has = (text, parts) => parts.some(part => text.includes(part));

  switch (classification) {
    case "legs":
      return has(slotId, ["pant", "leg", "штаны", "брюки"]) || has(label, ["штаны", "брюки", "ноги"]);
    case "bracelet":
      return has(slotId, ["brace", "wrist", "браслет"]) || has(label, ["браслет", "запястье", "наруч"]);
    case "underarmor":
      return has(slotId, ["under", "shirt", "поддоспешник"]) || has(label, ["поддоспешник", "рубаха"]);
    case "badge":
      return has(slotId, ["badge", "medal", "наград", "медал"]) || has(label, ["наград", "медал", "лент", "нашивк"]);
    case "head":
      return slotId === SLOTS.HEAD || has(slotId, ["head", "helm"]) || has(label, ["голов", "шлем", "шапк"]);
    case "neck":
      return slotId === SLOTS.NECK || has(slotId, ["neck", "amulet"]) || has(label, ["шея", "амулет", "ожерелье", "кулон"]);
    case "cloak":
      return slotId === SLOTS.CLOAK || has(slotId, ["cloak", "cape"]) || has(label, ["плащ", "одежда", "накидка", "мантия"]);
    case "hands":
      // "mainHand"/"offHand" contain "hand" too; gloves never go there.
      if (isHandHoldSlot(slot)) return false;
      return slotId === SLOTS.HANDS || has(slotId, ["hand", "glove", "gauntlet"]) || has(label, ["руки", "перчатк", "рукавиц"]);
    case "waist":
      return slotId === SLOTS.WAIST || has(slotId, ["waist", "belt"]) || has(label, ["пояс", "ремень"]);
    case "feet":
      return slotId === SLOTS.FEET || has(slotId, ["feet", "boot"]) || has(label, ["сапог", "обувь", "ботинок"]);
    case "ring":
      return category === "ring" || slotId.includes("ring") || has(label, ["кольц", "перстен"]);
    case "weapon":
    case "focus":
      return category === "hand" || slotId === SLOTS.MAIN_HAND || slotId === SLOTS.OFF_HAND ||
        slotId.includes("weapon") || has(label, ["рука", "оружие"]);
    default:
      return false;
  }
}

/**
 * Match generic equipment and trinket slots
 */
function matchesGenericSlot(slot, item) {
  const label = slotLabel(slot);
  // Generic custom slots (Wondrous, Magic, Trinket)
  if (["чудесн", "магическ", "wondrous", "magic", "trinket", "безделушк"].some(part => label.includes(part))) {
    return ["equipment", "loot", "consumable"].includes(item.type);
  }

  // A slot without accepts tags takes anything its type filter allows
  if (!Array.isArray(slot.accepts) || slot.accepts.length === 0) {
    return !["амулет", "шлем", "голова", "кольцо"].some(part => label.includes(part));
  }

  return false;
}

/**
 * Standard fallback slots for item classification
 */
export function getDefaultSlotsForClassification(classification) {
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
      return [SLOTS.FEET];
    case "bracelet":
      return [SLOTS.HANDS, SLOTS.RING_1, SLOTS.RING_2];
    case "underarmor":
      return [SLOTS.ARMOR, SLOTS.CLOAK];
    case "badge":
      return [SLOTS.CLOAK, SLOTS.NECK];
    case "focus":
    case "consumable":
      return [SLOTS.MAIN_HAND, SLOTS.OFF_HAND];
    default:
      // Unclassified items have no natural place on the paperdoll.
      return [];
  }
}

/**
 * The slots an actor actually has: its paperdoll template, or the registry.
 * @param {Object|null} actor
 * @returns {Array<Object>}
 */
function resolveKnownSlots(actor) {
  const templateSlots = actor ? getActorSlots(actor) : null;
  return Array.isArray(templateSlots) && templateSlots.length > 0 ? templateSlots : slotRegistry.getAll();
}

function resolveEffectiveActor(item, actor) {
  return actor || (item?.parent?.documentName === "Actor" ? item.parent : null);
}

function describeItem(item) {
  const classification = classifyItem(item);
  return {
    type: item.type,
    classification,
    generic: isGenericClassification(classification),
    systemType: String(item.system?.type?.value ?? "").toLowerCase(),
    subType: String(item.system?.type?.subtype ?? "").toLowerCase(),
    name: (item.name ?? "").toLowerCase()
  };
}

/**
 * Split the known slots into primary (made for this item) and generic
 * (accepts anything of its type) matches.
 * @param {Object} item
 * @param {Array<Object>} slots
 * @returns {{ primary: Array<string>, generic: Array<string> }}
 */
function resolveSlotMatches(item, slots) {
  const primary = [];
  const generic = [];
  const descriptor = describeItem(item);
  const bodyArmor = isBodyArmor(item);
  const shield = isShield(item);
  const twoHanded = isTwoHandedWeapon(item);

  for (const slot of slots) {
    if (!slotAllowsItemType(slot, item)) continue;

    if (bodyArmor) {
      if (isArmorSlot(slot)) primary.push(slot.id);
      continue;
    }
    if (shield) {
      if (isShieldSlot(slot)) primary.push(slot.id);
      continue;
    }
    if (twoHanded) {
      if (isTwoHandedWeaponSlotMatch(slot)) primary.push(slot.id);
      continue;
    }

    if (matchesSlotAccepts(slot, descriptor) || matchesSemanticSlot(slot, descriptor.classification)) {
      primary.push(slot.id);
      continue;
    }

    if (matchesGenericSlot(slot, item) && !isArmorSlot(slot)) {
      generic.push(slot.id);
    }
  }

  return { primary, generic };
}

/**
 * Get all allowable slot IDs for a given item, optionally resolved against an actor's active template
 * @param {Object} item
 * @param {Object} [actor=null]
 * @returns {Array<string>}
 */
export function getValidSlotsForItem(item, actor = null) {
  if (!item) return [];

  const slots = resolveKnownSlots(resolveEffectiveActor(item, actor));
  const { primary, generic } = resolveSlotMatches(item, slots);
  if (primary.length > 0) return primary;
  if (generic.length > 0) return generic;

  // Standard fallback, restricted to slots that exist and take this item type.
  return getDefaultSlotsForClassification(classifyItem(item))
    .filter(slotId => slots.some(slot => slot.id === slotId && slotAllowsItemType(slot, item)));
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

  const slots = resolveKnownSlots(resolveEffectiveActor(item, actor));
  const targetSlot = slots.find(slot => slot.id === slotId);
  if (!targetSlot) return false;
  if (!slotAllowsItemType(targetSlot, item)) return false;

  if (isTwoHandedWeapon(item) && isOffHandSlot(targetSlot)) return false;
  if (isBodyArmor(item)) return isArmorSlot(targetSlot);
  if (isShield(item)) return isShieldSlot(targetSlot);

  const { primary, generic } = resolveSlotMatches(item, slots);
  if (primary.includes(slotId) || generic.includes(slotId)) return true;

  const fallback = getDefaultSlotsForClassification(classifyItem(item));
  if (fallback.includes(slotId)) return true;

  // Items with no body location of their own may be placed by hand in any
  // slot that takes their type - but never in the body-armor slot.
  return isGenericClassification(classifyItem(item)) && !isArmorSlot(targetSlot);
}

/**
 * Get currently assigned slot from item flags
 * @param {Object} item
 * @returns {string|null}
 */
export function getItemAssignedSlot(item) {
  return item?.flags?.[MODULE_ID]?.[FLAGS.SLOT] ?? null;
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
