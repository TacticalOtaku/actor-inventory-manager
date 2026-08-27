// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Slot Definitions & Registry
// ─────────────────────────────────────────────────────────

import { SLOTS } from "../constants.js";

/**
 * Standard paperdoll slot configuration schema
 */
export const DEFAULT_SLOT_DEFINITIONS = [
  {
    id: SLOTS.HEAD,
    labelKey: "AIM.slots.head",
    icon: "fa-solid fa-helmet-safety",
    category: "equipment",
    accepts: ["head", "helmet", "hat", "circlet", "hood", "mask", "crown"],
    itemTypes: ["equipment"],
    order: 10
  },
  {
    id: SLOTS.NECK,
    labelKey: "AIM.slots.neck",
    icon: "fa-solid fa-gem",
    category: "equipment",
    accepts: ["neck", "necklace", "amulet", "pendant", "medallion", "periapt", "collar", "torc"],
    itemTypes: ["equipment", "loot"],
    order: 20
  },
  {
    id: SLOTS.CLOAK,
    labelKey: "AIM.slots.cloak",
    icon: "fa-solid fa-vest-patches",
    category: "equipment",
    accepts: ["cloak", "cape", "mantle", "robe_outer", "shawl", "pauldron"],
    itemTypes: ["equipment"],
    order: 30
  },
  {
    id: SLOTS.ARMOR,
    labelKey: "AIM.slots.armor",
    icon: "fa-solid fa-shield-halved",
    category: "equipment",
    accepts: ["armor", "light", "medium", "heavy", "clothing", "robe", "vestment", "bodyArmor"],
    itemTypes: ["equipment"],
    order: 40
  },
  {
    id: SLOTS.HANDS,
    labelKey: "AIM.slots.hands",
    icon: "fa-solid fa-mitten",
    category: "equipment",
    accepts: ["hands", "gloves", "gauntlets", "bracers", "handwraps"],
    itemTypes: ["equipment"],
    order: 50
  },
  {
    id: SLOTS.WAIST,
    labelKey: "AIM.slots.waist",
    icon: "fa-solid fa-bacon",
    category: "equipment",
    accepts: ["waist", "belt", "girdle", "sash", "cinch"],
    itemTypes: ["equipment"],
    order: 60
  },
  {
    id: SLOTS.FEET,
    labelKey: "AIM.slots.feet",
    icon: "fa-solid fa-shoe-prints",
    category: "equipment",
    accepts: ["feet", "boots", "shoes", "greaves", "slippers", "sandals", "sabatons"],
    itemTypes: ["equipment"],
    order: 70
  },
  {
    id: SLOTS.RING_1,
    labelKey: "AIM.slots.ring1",
    icon: "fa-solid fa-ring",
    category: "ring",
    accepts: ["ring", "band", "signet"],
    itemTypes: ["equipment", "loot"],
    order: 80
  },
  {
    id: SLOTS.RING_2,
    labelKey: "AIM.slots.ring2",
    icon: "fa-solid fa-ring",
    category: "ring",
    accepts: ["ring", "band", "signet"],
    itemTypes: ["equipment", "loot"],
    order: 90
  },
  {
    id: SLOTS.MAIN_HAND,
    labelKey: "AIM.slots.mainHand",
    icon: "fa-solid fa-hand-fist",
    category: "hand",
    accepts: ["weapon", "mainHand", "shield", "staff", "wand", "rod", "focus", "torch", "tool"],
    itemTypes: ["weapon", "equipment", "tool", "consumable"],
    order: 100
  },
  {
    id: SLOTS.OFF_HAND,
    labelKey: "AIM.slots.offHand",
    icon: "fa-solid fa-hand",
    category: "hand",
    accepts: ["shield", "offHand", "weapon", "focus", "torch", "lantern", "quiver", "instrument"],
    itemTypes: ["weapon", "equipment", "tool", "consumable"],
    order: 110
  }
];

export const ATTUNEMENT_SLOT_DEFINITIONS = [
  { id: SLOTS.ATTUNEMENT_1, labelKey: "AIM.slots.attunement1", order: 201 },
  { id: SLOTS.ATTUNEMENT_2, labelKey: "AIM.slots.attunement2", order: 202 },
  { id: SLOTS.ATTUNEMENT_3, labelKey: "AIM.slots.attunement3", order: 203 }
];

export const QUICK_SLOT_DEFINITIONS = [
  { id: SLOTS.QUICK_1, labelKey: "AIM.slots.quick1", order: 301 },
  { id: SLOTS.QUICK_2, labelKey: "AIM.slots.quick2", order: 302 },
  { id: SLOTS.QUICK_3, labelKey: "AIM.slots.quick3", order: 303 },
  { id: SLOTS.QUICK_4, labelKey: "AIM.slots.quick4", order: 304 }
];

/**
 * Extensible Registry for Equipment Slots
 */
export class SlotRegistry {
  constructor() {
    this._slots = new Map();
    this.resetToDefaults();
  }

  resetToDefaults() {
    this._slots.clear();
    for (const slot of DEFAULT_SLOT_DEFINITIONS) {
      this.register(slot);
    }
  }

  /**
   * Register or override a slot definition
   * @param {Object} slotDef
   */
  register(slotDef) {
    if (!slotDef || !slotDef.id) {
      throw new Error("Slot definition must have a valid 'id'");
    }
    this._slots.set(slotDef.id, {
      ...slotDef,
      accepts: Array.isArray(slotDef.accepts) ? [...slotDef.accepts] : [],
      itemTypes: Array.isArray(slotDef.itemTypes) ? [...slotDef.itemTypes] : []
    });
  }

  /**
   * Unregister a slot
   * @param {string} slotId
   */
  unregister(slotId) {
    return this._slots.delete(slotId);
  }

  /**
   * Get a slot definition by ID
   * @param {string} slotId
   * @returns {Object|null}
   */
  get(slotId) {
    return this._slots.get(slotId) ?? null;
  }

  /**
   * Get all registered slots sorted by order
   * @returns {Array<Object>}
   */
  getAll() {
    return Array.from(this._slots.values()).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /**
   * Check if a slot ID is valid and registered
   * @param {string} slotId
   * @returns {boolean}
   */
  has(slotId) {
    return this._slots.has(slotId);
  }

  /**
   * Get slots by category
   * @param {string} category
   * @returns {Array<Object>}
   */
  getByCategory(category) {
    return this.getAll().filter(s => s.category === category);
  }
}

export const slotRegistry = new SlotRegistry();
