// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Constants
// ─────────────────────────────────────────────────────────

export const MODULE_ID = "actor-inventory-manager";

export const FLAGS = {
  SLOT: "slot",
  LOCKED_BY_2H: "lockedBy2H",
  EQUIPPED_AT: "equippedAt",
  QUICK_SLOT: "quickSlot",
  FAVORITE: "favorite",
  TEMPLATE_ID: "paperdollTemplateId",
  CUSTOM_TEMPLATE: "paperdollCustomTemplate",
  PAPERDOLL_COLLAPSED: "paperdollCollapsed",
  SPELLS_PANEL_OPEN: "spellsPanelOpen",
  SPELLS_TAB: "spellsTab"
};

export const TEMPLATE_PRESETS = {
  DND_2024: "dnd2024",
  DND_2014: "dnd2014"
};

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
  OFF_HAND: "offHand",
  ATTUNEMENT_1: "attunement1",
  ATTUNEMENT_2: "attunement2",
  ATTUNEMENT_3: "attunement3",
  QUICK_1: "quick1",
  QUICK_2: "quick2",
  QUICK_3: "quick3",
  QUICK_4: "quick4"
};

export const ENFORCEMENT_MODES = {
  BLOCK: "block",
  AUTO_SWAP: "auto_swap",
  WARN: "warn"
};

export const THEMES = {
  DARK: "dark",
  LIGHT: "light",
  AUTO: "auto"
};

export const LOG_LEVELS = ["none", "error", "warn", "info", "debug", "trace"];

export const LBS_PER_KG = 2.20462262185;

export const ITEM_RARITY_COLORS = {
  common: "#7f8c8d",
  uncommon: "#27ae60",
  rare: "#2980b9",
  veryRare: "#8e44ad",
  legendary: "#d35400",
  artifact: "#c0392b"
};

export const SPELL_SCHOOL_COLORS = {
  abj: "#3498db", // Abjuration: Blue
  con: "#f39c12", // Conjuration: Amber
  div: "#9b59b6", // Divination: Purple
  enc: "#e91e63", // Enchantment: Pink
  evo: "#e74c3c", // Evocation: Red
  ill: "#1abc9c", // Illusion: Teal
  nec: "#2ecc71", // Necromancy: Green
  trs: "#d35400"  // Transmutation: Dark Orange
};
