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
 * Add the inventory entry to an actor sheet's header menu (the "⋮" dropdown).
 * Bound to Foundry's getHeaderControlsActorSheetV2 hook, which fires for every
 * actor sheet class, including sheets registered after this module is ready.
 * @param {Object} app
 * @param {Object[]} controls  the sheet's header menu entries, edited in place
 */
export function addInventoryHeaderControl(app, controls) {
  if (!game.settings.get(MODULE_ID, "showSheetButton")) return;
  if (!isPrimaryActorSheet(app)) return;
  if (controls.some(control => control.action === HEADER_ACTION)) return;

  controls.unshift({
    icon: "fa-solid fa-shirt",
    label: game.i18n.localize("AIM.sheetButton.label"),
    action: HEADER_ACTION,
    onClick: () => openActorInventory(app.document ?? app.actor)
  });
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
  // Every dnd5e actor sheet is an ActorSheetV2, so these hooks cover them all.
  Hooks.on("getHeaderControlsActorSheetV2", addInventoryHeaderControl);
  Hooks.on("renderActorSheetV2", app => injectHeaderButton(app));

  // NOTE: keybindings must be registered during "init" (Foundry throws otherwise).
  // The inventory hotkey lives in foundry/settings.js.

  LOG.info("Sheet injection hooks registered");
}
