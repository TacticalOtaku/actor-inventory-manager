// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Entry Point
// ─────────────────────────────────────────────────────────

import { MODULE_ID, SLOTS, FLAGS, ENFORCEMENT_MODES, REFRESH_HOOK } from "./constants.js";
import { registerTradeService, registerTradeSettings } from "./trade/service.js";
import { equipmentRuleEngine, findEquipSlot, getActorEquippedMap, isOffHandLockedBy2H } from "./core/equipment-rules.js";
import {
  classifyItem,
  getItemAssignedSlot,
  getValidSlotsForItem,
  isItemCompatibleWithSlot,
  isTwoHandedWeapon,
  isShield,
  isBodyArmor
} from "./core/item-classifier.js";
import { slotRegistry } from "./core/slot-definitions.js";
import { computeActorEncumbrance, computeActorCapacity } from "./core/weight-calculator.js";
import { registerEnforcementHooks } from "./foundry/enforcement-hooks.js";
import { LOG } from "./foundry/logger.js";
import { registerFoundryPaperdollRuntime } from "./foundry/paperdoll-runtime.js";
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
import { openActorInventory, toggleActorInventory, preloadTemplates } from "./ui/inventory-app.js";
import { equipItemToSlot, unequipItem, toggleItemEquipped, useItem, toggleAttunement } from "./ui/item-actions.js";
import { isItemPilesActive, computeActorCurrency } from "./integrations/item-piles.js";
import { SC_MODULE_ID, invalidateRarityColorCache } from "./integrations/sc-rarity-colors.js";

/**
 * Rarity colours are memoized; drop them and redraw open windows whenever
 * SC - Item Rarity Colors changes a setting.
 */
function watchRarityColourSettings() {
  const onChange = key => {
    if (!String(key ?? "").startsWith(`${SC_MODULE_ID}.`)) return;
    invalidateRarityColorCache();
    Hooks.callAll(REFRESH_HOOK);
  };
  Hooks.on("createSetting", setting => onChange(setting?.key));
  Hooks.on("updateSetting", setting => onChange(setting?.key));
  Hooks.on("clientSettingChanged", key => onChange(key));
}

// Bind platform ports before any module service reads from Foundry.
registerFoundryPaperdollRuntime();

// Register settings and preload templates on init
registerModuleSettings();

Hooks.once("init", () => {
  registerTradeSettings();
  preloadTemplates();
});

Hooks.once("ready", () => {
  registerTradeService();
  registerEnforcementHooks();
  registerSheetInjectionHooks();
  watchRarityColourSettings();

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
    // Same rule-checked choice as clicking Equip; the old name stays for API callers.
    findBestSlotForEquipping: findEquipSlot,
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

  /**
   * Fired once the public API is available.
   * Register custom slots (`api.slotRegistry.register`) and equipment rules
   * (`api.equipmentRuleEngine.registerRule`) from here.
   * @event actorInventoryManager.ready
   * @param {Object} api
   */
  Hooks.callAll(`${MODULE_ID}.ready`, api);

  LOG.info("Actor Inventory Manager ready", {
    version: module?.version ?? "1.0.0",
    foundryVersion: game.version,
    system: game.system?.id,
    systemVersion: game.system?.version,
    weightyContainersActive: isWeightyContainersActive()
  });
});
