// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Public API Surface
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, FLAGS, SLOTS } from "./constants.js";
import { equipmentRuleEngine, findEquipSlot, getActorEquippedMap, isOffHandLockedBy2H } from "./core/equipment-rules.js";
import { findCompareTargets } from "./core/item-compare.js";
import {
  classifyItem,
  getItemAssignedSlot,
  getValidSlotsForItem,
  isBodyArmor,
  isItemCompatibleWithSlot,
  isShield,
  isTwoHandedWeapon
} from "./core/item-classifier.js";
import {
  deleteWorldCustomTemplate,
  exportTemplateJSON,
  getActorPaperdollTemplate,
  getActorSlots,
  getAllTemplates,
  getTemplateById,
  importTemplateJSON,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "./core/paperdoll-templates.js";
import { computeActorCapacity, computeActorEncumbrance } from "./core/weight-calculator.js";
import { applyActorLoadout, deleteActorLoadout, getActorLoadouts, renameActorLoadout, saveActorLoadout } from "./foundry/loadouts.js";
import { extractActorVitals, formatItemForDisplay } from "./integrations/dnd5e.js";
import { computeActorCurrency, isItemPilesActive } from "./integrations/item-piles.js";
import {
  getContainerWeightReductionPct,
  isWeightyContainersActive,
  openWeightyContainersDialog,
  validateContainerDrop
} from "./integrations/weighty-containers.js";
import { openActorWindow, toggleActorWindow } from "./ui/actor-window.js";
import { equipItemToSlot, toggleAttunement, toggleItemEquipped, unequipItem, useItem } from "./ui/item-actions.js";
import { openPresetEditor } from "./ui/preset-editor.js";

/**
 * Construct and freeze the module's public API object.
 * Exposed at `game.modules.get("actor-inventory-manager").api` and `globalThis.ActorInventoryManager`.
 */
export function createPublicApi() {
  return Object.freeze({
    // Windows & editor
    openInventory: openActorWindow,
    toggleInventory: toggleActorWindow,
    openWindow: openActorWindow,
    toggleWindow: toggleActorWindow,
    openEditor: openPresetEditor,

    // Paperdoll templates & slots
    getActorPaperdollTemplate,
    getActorSlots,
    setActorPaperdollTemplate,
    saveWorldCustomTemplate,
    deleteWorldCustomTemplate,
    getAllTemplates,
    getTemplateById,
    exportTemplateJSON,
    importTemplateJSON,

    // Equipment rules & classification
    getEquippedMap: getActorEquippedMap,
    isOffHandLockedBy2H,
    classifyItem,
    getValidSlotsForItem,
    // Same rule-checked choice as clicking Equip; the old name stays for API callers.
    findBestSlotForEquipping: findEquipSlot,
    getItemAssignedSlot,
    isItemCompatibleWithSlot,
    isTwoHandedWeapon,
    isShield,
    isBodyArmor,
    equipmentRuleEngine,

    // Item actions
    equipItem: equipItemToSlot,
    unequipItem,
    toggleItemEquipped,
    useItem,
    toggleAttunement,

    // Equipment loadouts
    getActorLoadouts,
    saveActorLoadout,
    renameActorLoadout,
    deleteActorLoadout,
    applyActorLoadout,

    // Item comparison
    findCompareTargets,

    // Encumbrance, vitals & display
    computeActorEncumbrance,
    computeActorCapacity,
    extractActorVitals,
    formatItemForDisplay,

    // Constants (frozen)
    SLOTS,
    FLAGS,
    ENFORCEMENT_MODES,

    // Optional integrations
    isWeightyContainersActive,
    getContainerWeightReductionPct,
    validateContainerDrop,
    openWeightyContainersDialog,
    isItemPilesActive,
    computeActorCurrency
  });
}
