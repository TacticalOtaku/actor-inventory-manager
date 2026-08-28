// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Entry Point
// ─────────────────────────────────────────────────────────

import { MODULE_ID, SLOTS, FLAGS, ENFORCEMENT_MODES } from "./constants.js";
import { equipmentRuleEngine, getActorEquippedMap, isOffHandLockedBy2H } from "./core/equipment-rules.js";
import {
  classifyItem,
  findBestSlotForEquipping,
  getItemAssignedSlot,
  getValidSlotsForItem,
  isItemCompatibleWithSlot,
  isTwoHandedWeapon,
  isShield,
  isBodyArmor
} from "./core/item-classifier.js";
import { slotRegistry, DEFAULT_SLOT_DEFINITIONS } from "./core/slot-definitions.js";
import { computeActorEncumbrance, computeActorCapacity } from "./core/weight-calculator.js";
import { registerEnforcementHooks } from "./foundry/enforcement-hooks.js";
import { LOG } from "./foundry/logger.js";
import { registerModuleSettings } from "./foundry/settings.js";
import { registerSheetInjectionHooks } from "./foundry/sheet-injection.js";
import { extractActorVitals, formatItemForDisplay } from "./integrations/dnd5e.js";
import {
  getContainerWeightReductionPct,
  isWeightyContainersActive,
  openWeightyContainersDialog,
  validateContainerDrop
} from "./integrations/weighty-containers.js";
import {
  deleteWorldCustomTemplate,
  exportTemplateJSON,
  getAllTemplates,
  getActorPaperdollTemplate,
  getActorSlots,
  getTemplateById,
  importTemplateJSON,
  saveWorldCustomTemplate,
  setActorPaperdollTemplate
} from "./core/paperdoll-templates.js";
import { openPaperdollEditor } from "./ui/paperdoll-editor.js";
import { openActorInventory, toggleActorInventory, ActorInventoryApp, preloadTemplates } from "./ui/inventory-app.js";
import { equipItemToSlot, unequipItem, toggleItemEquipped, useItem, toggleAttunement } from "./ui/item-actions.js";
import { isItemPilesActive, computeActorCurrency } from "./integrations/item-piles.js";

function registerHandlebarsHelpers() {
  if (typeof globalThis.Handlebars === "undefined") return;
  const H = globalThis.Handlebars;

  if (!H.helpers.eq) {
    H.registerHelper("eq", (a, b) => a === b);
  }
  if (!H.helpers.ne) {
    H.registerHelper("ne", (a, b) => a !== b);
  }
  if (!H.helpers.gt) {
    H.registerHelper("gt", (a, b) => Number(a) > Number(b));
  }
  if (!H.helpers.lt) {
    H.registerHelper("lt", (a, b) => Number(a) < Number(b));
  }
  if (!H.helpers.or) {
    H.registerHelper("or", (...args) => {
      args.pop();
      return args.some(Boolean);
    });
  }
  if (!H.helpers.and) {
    H.registerHelper("and", (...args) => {
      args.pop();
      return args.every(Boolean);
    });
  }
}

// Register settings and preload templates on init
registerModuleSettings();

Hooks.once("init", () => {
  registerHandlebarsHelpers();
  preloadTemplates();
});

Hooks.once("ready", () => {
  registerHandlebarsHelpers();
  preloadTemplates();
  registerEnforcementHooks();
  registerSheetInjectionHooks();

  // Create and expose Public API
  const api = {
    openInventory: openActorInventory,
    toggleInventory: toggleActorInventory,
    openEditor: openPaperdollEditor,
    getActorPaperdollTemplate,
    getActorSlots,
    setActorPaperdollTemplate,
    saveWorldCustomTemplate,
    deleteWorldCustomTemplate,
    getAllTemplates,
    getTemplateById,
    exportTemplateJSON,
    importTemplateJSON,
    getEquippedMap: getActorEquippedMap,
    isOffHandLockedBy2H,
    classifyItem,
    getValidSlotsForItem,
    findBestSlotForEquipping,
    getItemAssignedSlot,
    isItemCompatibleWithSlot,
    isTwoHandedWeapon,
    isShield,
    isBodyArmor,
    computeActorEncumbrance,
    computeActorCapacity,
    extractActorVitals,
    formatItemForDisplay,
    equipItem: equipItemToSlot,
    unequipItem,
    toggleItemEquipped,
    useItem,
    toggleAttunement,
    slotRegistry,
    equipmentRuleEngine,
    SLOTS,
    FLAGS,
    ENFORCEMENT_MODES,
    isWeightyContainersActive,
    getContainerWeightReductionPct,
    validateContainerDrop,
    openWeightyContainersDialog,
    isItemPilesActive,
    computeActorCurrency
  };

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = api;
  }
  globalThis.ActorInventoryManager = api;

  LOG.info("Actor Inventory Manager ready", {
    version: module?.version ?? "1.0.0",
    foundryVersion: game.version,
    system: game.system?.id,
    systemVersion: game.system?.version,
    weightyContainersActive: isWeightyContainersActive()
  });
});
