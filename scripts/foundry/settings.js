// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Settings
// ─────────────────────────────────────────────────────────

import { ENFORCEMENT_MODES, LOG_LEVELS, MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { LOG } from "./logger.js";
import { canViewActor, isSupportedActor } from "../core/actor-scope.js";
import { DEFAULT_ACCENT, DENSITIES, MOTION_LEVELS, THEMES } from "../core/actor-window.js";

/**
 * Interface fonts bundled with the module (Onest, JetBrains Mono, Unbounded). No leading slash: the `<link>`
 * resolves against the game page (`<route prefix>/game`), so it keeps working behind a route prefix.
 */
const WEB_FONTS_URL = `modules/${MODULE_ID}/styles/theme/fonts.css`;

const refreshInventories = () => Hooks.callAll(REFRESH_HOOK);

/** Add the web-font stylesheet once, without blocking the page. */
function loadWebFonts() {
  if (typeof document === "undefined" || document.getElementById(`${MODULE_ID}-web-fonts`)) return;
  const link = document.createElement("link");
  link.id = `${MODULE_ID}-web-fonts`;
  link.rel = "stylesheet";
  link.href = WEB_FONTS_URL;
  document.head.appendChild(link);
}

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

    // Window settings live in the actor window's own drawer (#17), not in Foundry's settings window.
    // Theme, accent, density, rail blocks and tabs follow the user to any device; motion and fonts stay on it.
    game.settings.register(MODULE_ID, "windowTheme", {
      scope: "user",
      config: false,
      type: String,
      choices: Object.fromEntries(THEMES.map(t => [t, t])),
      default: "night",
      onChange: refreshInventories
    });
    game.settings.register(MODULE_ID, "windowAccent", {
      scope: "user",
      config: false,
      type: String,
      default: DEFAULT_ACCENT,
      onChange: refreshInventories
    });
    game.settings.register(MODULE_ID, "windowDensity", {
      scope: "user",
      config: false,
      type: String,
      choices: Object.fromEntries(DENSITIES.map(d => [d, d])),
      default: "comfortable",
      onChange: refreshInventories
    });
    game.settings.register(MODULE_ID, "hiddenRailBlocks", {
      scope: "user",
      config: false,
      type: Array,
      default: [],
      onChange: refreshInventories
    });
    game.settings.register(MODULE_ID, "hiddenTabs", {
      scope: "user",
      config: false,
      type: Array,
      default: [],
      onChange: refreshInventories
    });
    // Each tab's list view, sort and filters; every window keeps its own copy, so no redraw on change.
    game.settings.register(MODULE_ID, "listPrefs", {
      scope: "user",
      config: false,
      type: Object,
      default: {}
    });
    // Trays the user folded (true) or unfolded (false), by container UUID.
    game.settings.register(MODULE_ID, "trayFolds", {
      scope: "user",
      config: false,
      type: Object,
      default: {}
    });
    game.settings.register(MODULE_ID, "motionLevel", {
      scope: "client",
      config: false,
      type: String,
      choices: Object.fromEntries(MOTION_LEVELS.map(m => [m, m])),
      default: "full",
      onChange: refreshInventories
    });
    game.settings.register(MODULE_ID, "useWebFonts", {
      scope: "client",
      config: false,
      type: Boolean,
      default: true
    });

    // 1.x values, read once by the 2.0 migration (ADR 0005) and removed in 2.1.
    game.settings.register(MODULE_ID, "theme", {
      scope: "client",
      config: false,
      type: String,
      default: "dark"
    });
    game.settings.register(MODULE_ID, "accent", {
      scope: "client",
      config: false,
      type: String,
      default: "peach"
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
      default: {},
      onChange: refreshInventories
    });

    game.settings.register(MODULE_ID, "showActorPortraitBackdrop", {
      name: "AIM.settings.showActorPortraitBackdrop.name",
      hint: "AIM.settings.showActorPortraitBackdrop.hint",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: refreshInventories
    });

    game.settings.register(MODULE_ID, "autoReconcileSlots", {
      name: "AIM.settings.autoReconcileSlots.name",
      hint: "AIM.settings.autoReconcileSlots.hint",
      scope: "world",
      config: true,
      restricted: true,
      type: Boolean,
      default: true,
      onChange: refreshInventories
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

    LOG.setLevel(game.settings.get(MODULE_ID, "logLevel"));
    if (game.settings.get(MODULE_ID, "useWebFonts")) loadWebFonts();

    // Register Keybindings
    registerModuleKeybindings();

    LOG.info("Settings and keybindings registered successfully");
  });
}

/**
 * Register module keybindings (e.g. 'I' key for toggling inventory)
 */
export function registerModuleKeybindings() {
  game.keybindings.register(MODULE_ID, "openInventory", {
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
        globalThis.ui?.notifications?.warn(globalThis.game?.i18n?.localize("AIM.keybindings.noActorSelected"));
        return true;
      }

      if (!isSupportedActor(targetActor) || !canViewActor(targetActor, globalThis.game?.user)) {
        globalThis.ui?.notifications?.warn(globalThis.game?.i18n?.localize("AIM.keybindings.unsupportedActor"));
        return true;
      }

      globalThis.ActorInventoryManager?.toggleInventory?.(targetActor);
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });
}
