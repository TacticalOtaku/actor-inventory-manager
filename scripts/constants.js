// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Constants
// ─────────────────────────────────────────────────────────

export const MODULE_ID = "actor-inventory-manager";

export const FLAGS = {
  SLOT: "slot",
  LOCKED_BY_2H: "lockedBy2H",
  EQUIPPED_AT: "equippedAt",
  QUICK_SLOT: "quickSlot",
  TEMPLATE_ID: "paperdollTemplateId",
  CUSTOM_TEMPLATE: "paperdollCustomTemplate",
  TRADE_NEW: "tradeNew"
};

/** Update option telling the enforcement hook the inventory window already validated an equip. */
export const AIM_EQUIP_OPTION = "aimEquip";

/** Called when a setting changes that every open inventory window has to redraw for. */
export const REFRESH_HOOK = `${MODULE_ID}.refresh`;

export const TEMPLATE_PRESETS = {
  DND_2024: "dnd2024",
  DND_2014: "dnd2014",
  BEAST: "beast",
  WAGON: "wagon",
  WAGON_TACK: "wagonTack",
  SHIP: "ship",
  SHIP_PORTS: "shipPorts",
  AIRSHIP: "airship",
  AIRSHIP_RIG: "airshipRig"
};

/** The illustrations a doll preset can stand on. */
export const FIGURES = ["human", "beast", "wagon", "ship", "airship"];

export const SLOTS = {
  HEAD: "head",
  NECK: "neck",
  CLOAK: "cloak",
  ARMOR: "armor",
  HANDS: "hands",
  WAIST: "waist",
  FEET: "feet",
  RING_1: "ring1",
  RING_2: "ring2",
  MAIN_HAND: "mainHand",
  OFF_HAND: "offHand"
};

export const ENFORCEMENT_MODES = {
  BLOCK: "block",
  AUTO_SWAP: "auto_swap",
  WARN: "warn"
};

export const LOG_LEVELS = ["none", "error", "warn", "info", "debug", "trace"];

export const ITEM_RARITY_COLORS = {
  common: "#7f8c8d",
  uncommon: "#27ae60",
  rare: "#2980b9",
  veryRare: "#8e44ad",
  legendary: "#d35400",
  artifact: "#c0392b"
};
