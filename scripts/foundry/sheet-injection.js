// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Sheet Injection & Header Controls
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { canViewActor, isSupportedActor } from "../core/actor-scope.js";
import { openActorInventory } from "../ui/inventory-app.js";
import { LOG } from "./logger.js";

/** Action id of the inventory entry in the sheet header menu. */
const HEADER_ACTION = "aim-inventory";

/**
 * Check if the application is a primary dnd5e Actor Sheet (Character or NPC)
 * @param {Object} app
 * @returns {boolean}
 */
function isPrimaryActorSheet(app) {
  if (!app) return false;

  // Never inject into our own inventory app or dialogs
  if (
    app.constructor?.name === "ActorInventoryApp" ||
    app.id?.includes("actor-inventory-manager") ||
    app.options?.classes?.includes?.("actor-inventory-manager-app") ||
    app.options?.classes?.includes?.("container-rules")
  ) {
    return false;
  }

  // Check document. Limited permission shows only the biography, so the
  // full inventory is offered to observers and owners alone.
  const actor = app.document ?? app.actor;
  if (!isSupportedActor(actor) || actor.documentName !== "Actor" || !canViewActor(actor, game.user)) {
    return false;
  }

  // Reject third-party auxiliary windows, dialogs, or configs
  const appName = app.constructor?.name ?? "";
  if (
    appName.includes("Config") ||
    appName.includes("Dialog") ||
    appName.includes("Action") ||
    appName.includes("Workshop") ||
    app.options?.classes?.includes?.("dialog") ||
    app.options?.classes?.includes?.("build-n-action")
  ) {
    return false;
  }

  // Check valid dnd5e character/npc sheet
  const dnd5eActorApps = globalThis.dnd5e?.applications?.actor ?? {};
  const isDnd5eActorClass = Object.values(dnd5eActorApps).some(cls => typeof cls === "function" && app instanceof cls);

  const isStandardActorSheet = (
    app instanceof foundry.applications.sheets.ActorSheetV2 ||
    app.options?.classes?.includes?.("character") ||
    app.options?.classes?.includes?.("npc") ||
    app.options?.classes?.includes?.("dnd5e2")
  );

  return isDnd5eActorClass || isStandardActorSheet;
}

/**
 * Patch dnd5e actor sheets to inject a header control into the 3-dots dropdown menu
 */
function patchSheetHeaderControls() {
  const sheetClasses = new Set();

  const dnd5eApps = globalThis.dnd5e?.applications?.actor;
  if (dnd5eApps) {
    for (const key of Object.keys(dnd5eApps)) {
      const cls = dnd5eApps[key];
      if (cls?.prototype?._getHeaderControls) {
        sheetClasses.add(cls);
      }
    }
  }

  const configSheets = globalThis.CONFIG?.Actor?.sheetClasses;
  if (configSheets) {
    for (const actorType of Object.keys(configSheets)) {
      for (const entry of Object.values(configSheets[actorType] || {})) {
        if (entry?.cls?.prototype?._getHeaderControls) {
          sheetClasses.add(entry.cls);
        }
      }
    }
  }

  for (const cls of sheetClasses) {
    const original = cls.prototype._getHeaderControls;
    if (!original || original._aimPatched) continue;

    const patched = function(...args) {
      const controls = original.call(this, ...args) || [];

      if (!isPrimaryActorSheet(this)) {
        return controls;
      }

      const actor = this.document ?? this.actor;
      if (!game.settings.get(MODULE_ID, "showSheetButton")) return controls;

      // Header controls dispatch through the sheet's action table.
      if (this.options?.actions && !this.options.actions[HEADER_ACTION]) {
        this.options.actions[HEADER_ACTION] = () => openActorInventory(this.document ?? this.actor);
      }

      const hasAim = controls.some(c => c.action === HEADER_ACTION);
      if (!hasAim) {
        controls.unshift({
          icon: "fa-solid fa-shirt",
          label: game.i18n.localize("AIM.sheetButton.label"),
          action: HEADER_ACTION,
          onClick: (event) => {
            event?.preventDefault?.();
            openActorInventory(actor);
          }
        });
      }
      return controls;
    };
    patched._aimPatched = true;
    cls.prototype._getHeaderControls = patched;
  }

  LOG.debug("Patched _getHeaderControls on actor sheet classes", { count: sheetClasses.size });
}

/**
 * Inject icon button into Actor Sheet Window Header Bar
 */
function injectHeaderButton(app) {
  if (!game.settings.get(MODULE_ID, "showSheetButton")) return;
  if (!isPrimaryActorSheet(app)) return;

  const actor = app.document ?? app.actor;
  const header = app.window?.header;
  if (!header || header.querySelector(".aim-window-header-btn")) return;

  const headerBtn = document.createElement("button");
  headerBtn.type = "button";
  headerBtn.className = "header-control aim-window-header-btn";
  headerBtn.title = game.i18n.localize("AIM.sheetButton.tooltip");
  headerBtn.setAttribute("aria-label", game.i18n.localize("AIM.sheetButton.label"));
  headerBtn.innerHTML = '<i class="fa-solid fa-shirt"></i>';
  headerBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openActorInventory(actor);
  });

  const controlsBtn = header.querySelector(".controls-dropdown, [data-action='toggleControls'], .window-controls");
  const closeBtn = header.querySelector(".close, [data-action='close'], .window-close");

  if (controlsBtn) {
    controlsBtn.before(headerBtn);
  } else if (closeBtn) {
    closeBtn.before(headerBtn);
  } else {
    header.appendChild(headerBtn);
  }
}

/**
 * Register sheet hooks and keybinding
 */
export function registerSheetInjectionHooks() {
  // Patch sheet classes for the dropdown menu
  patchSheetHeaderControls();

  // Every dnd5e actor sheet is an ActorSheetV2, so this one hook covers them all.
  Hooks.on("renderActorSheetV2", app => injectHeaderButton(app));

  // NOTE: keybindings must be registered during "init" (Foundry throws otherwise).
  // The inventory hotkey lives in foundry/settings.js.

  LOG.info("Sheet injection hooks registered");
}
