// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration Adapter (Barrel)
// ─────────────────────────────────────────────────────────

export {
  getSystemWeightUnit,
  unitAbbreviation,
  getDnd5eConfig,
  concealsDetails,
  resolveItemActivation,
  resolveItemUses
} from "./dnd5e/common.js";

export {
  extractActorVitals,
  readAbilities,
  readIdentity,
  readNpc,
  readRail
} from "./dnd5e/actor.js";

export {
  readInventory,
  readContainerCapacity,
  readCoins,
  formatItemForDisplay,
  droppedItemContainer,
  matchesDroppedStack,
  createDroppedItems,
  createDroppedSpell,
  sheetUnsupportedTypes
} from "./dnd5e/inventory.js";

export {
  readSpellbook,
  hasPreparationToggle,
  readSpellPreparation,
  resolveSpellSlotMax,
  extractSpellSlots,
  resolveSpellPreparation,
  toggleSpellPreparation
} from "./dnd5e/spells.js";

export {
  readFeatures,
  readFavorites
} from "./dnd5e/features.js";

export {
  readEffects,
  readEffectChanges,
  readStatusEffects
} from "./dnd5e/effects.js";

export {
  readSkills,
  readTools,
  readDefenses,
  readSenses,
  readBiography
} from "./dnd5e/overview.js";

export {
  readVehicleType,
  readVehicleHold,
  readVehicle
} from "./dnd5e/vehicle.js";

export {
  readCardData,
  readDamageType
} from "./dnd5e/tooltips.js";
