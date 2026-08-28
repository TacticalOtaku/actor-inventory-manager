// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Settings
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, LOG_LEVELS, MODULE_ID } from "../constants.js";
import { LOG } from "./logger.js";

export function registerModuleSettings() {
  Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "enforcementMode", {
      name: "AIM.settings.enforcementMode.name",
      hint: "AIM.settings.enforcementMode.hint",
      scope: "world",
      config: true,
      restricted: true,
      type: String,
      choices: {
        [ENFORCEMENT_MODES.BLOCK]: "AIM.settings.enforcementMode.block",
        [ENFORCEMENT_MODES.AUTO_SWAP]: "AIM.settings.enforcementMode.autoSwap",
        [ENFORCEMENT_MODES.WARN]: "AIM.settings.enforcementMode.warn"
      },
      default: ENFORCEMENT_MODES.BLOCK
    });

    game.settings.register(MODULE_ID, "theme", {
      name: "AIM.settings.theme.name",
      hint: "AIM.settings.theme.hint",
      scope: "client",
      config: true,
      type: String,
      choices: {
        dark: "AIM.settings.theme.dark",
        light: "AIM.settings.theme.light",
        auto: "AIM.settings.theme.auto"
      },
      default: "dark"
    });

    game.settings.register(MODULE_ID, "showSheetButton", {
      name: "AIM.settings.showSheetButton.name",
      hint: "AIM.settings.showSheetButton.hint",
      scope: "client",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "customTemplates", {
      name: "AIM.settings.customTemplates.name",
      hint: "AIM.settings.customTemplates.hint",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });

    game.settings.register(MODULE_ID, "showActorPortraitBackdrop", {
      name: "AIM.settings.showActorPortraitBackdrop.name",
      hint: "AIM.settings.showActorPortraitBackdrop.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "autoReconcileSlots", {
      name: "AIM.settings.autoReconcileSlots.name",
      hint: "AIM.settings.autoReconcileSlots.hint",
      scope: "world",
      config: true,
      restricted: true,
      type: Boolean,
      default: true
    });

    game.settings.register(MODULE_ID, "logLevel", {
      name: "AIM.settings.logLevel.name",
      hint: "AIM.settings.logLevel.hint",
      scope: "client",
      config: true,
      type: String,
      choices: Object.fromEntries(LOG_LEVELS.map(l => [l, `AIM.settings.logLevel.${l}`])),
      default: "info",
      onChange: val => LOG.setLevel(val)
    });

    try {
      LOG.setLevel(game.settings.get(MODULE_ID, "logLevel"));
    } catch {}

    // Register Keybindings
    registerModuleKeybindings();

    LOG.info("Settings and keybindings registered successfully");
  });
}

/**
 * Register module keybindings (e.g. 'I' key for toggling inventory)
 */
export function registerModuleKeybindings() {
  if (!globalThis.game?.keybindings?.register) return;

  globalThis.game.keybindings.register(MODULE_ID, "openInventory", {
    name: "AIM.keybindings.openInventory.name",
    hint: "AIM.keybindings.openInventory.hint",
    editable: [
      { key: "KeyI" }
    ],
    onDown: () => {
      // 1. Get controlled token's actor on canvas
      const controlled = globalThis.canvas?.tokens?.controlled ?? [];
      let targetActor = controlled[0]?.actor;

      // 2. If no token selected, fallback to user's assigned character
      if (!targetActor) {
        targetActor = globalThis.game?.user?.character;
      }

      if (!targetActor) {
        globalThis.ui?.notifications?.warn(
          globalThis.game?.i18n?.localize("AIM.keybindings.noActorSelected") ||
          "Please select a token on the canvas or assign a character to open inventory."
        );
        return true;
      }

      const app = globalThis.ActorInventoryManager?.toggleInventory
        ? globalThis.ActorInventoryManager.toggleInventory(targetActor)
        : (globalThis.ActorInventoryManager?.openInventory ? globalThis.ActorInventoryManager.openInventory(targetActor) : null);

      return true;
    },
    restricted: false,
    precedence: globalThis.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
  });
}

