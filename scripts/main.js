// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Entry Point
// ─────────────────────────────────────────────────────────

import { createPublicApi } from "./api.js";
import { MODULE_ID, REFRESH_HOOK } from "./constants.js";
import { registerEnforcementHooks } from "./foundry/enforcement-hooks.js";
import { LOG } from "./foundry/logger.js";
import { migrateLook, registerMigrationSettings, runMigration } from "./foundry/migration.js";
import { registerFoundryPaperdollRuntime } from "./foundry/paperdoll-runtime.js";
import { registerModuleSettings } from "./foundry/settings.js";
import { registerSheetInjectionHooks } from "./foundry/sheet-injection.js";
import { isWeightyContainersActive } from "./integrations/weighty-containers.js";
import { SC_MODULE_ID, invalidateRarityColorCache } from "./integrations/sc-rarity-colors.js";
import { registerTradeService, registerTradeSettings } from "./trade/service.js";

/**
 * Rarity colours are memoized; drop them and redraw open windows whenever
 * SC - Item Rarity Colors changes a setting.
 */
function watchRarityColourSettings() {
  const onChange = (key) => {
    if (!String(key ?? "").startsWith(`${SC_MODULE_ID}.`)) return;
    invalidateRarityColorCache();
    Hooks.callAll(REFRESH_HOOK);
  };
  Hooks.on("createSetting", (setting) => onChange(setting?.key));
  Hooks.on("updateSetting", (setting) => onChange(setting?.key));
  Hooks.on("clientSettingChanged", (key) => onChange(key));
}

// Bind platform ports before any module service reads from Foundry.
registerFoundryPaperdollRuntime();

// Register settings and preload templates on init
registerModuleSettings();

Hooks.once("init", () => {
  registerTradeSettings();
  registerMigrationSettings();
});

Hooks.once("ready", () => {
  // The 1.9 → 2.0 migration (ADR 0005): the GM moves the world's data, every client its own look.
  runMigration().catch((error) => LOG.error("Migration to 2.0 failed", error));
  migrateLook().catch((error) => LOG.error("Moving the 1.9 theme and accent failed", error));
  registerTradeService();
  registerEnforcementHooks();
  registerSheetInjectionHooks();
  watchRarityColourSettings();

  // Create and expose frozen Public API
  const api = createPublicApi();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = api;
  }
  globalThis.ActorInventoryManager = api;

  /**
   * Fired once the public API is available.
   * Register equipment rules (`api.equipmentRuleEngine.registerRule`) from here; slots come from the doll presets.
   * @event actor-inventory-manager.ready
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
