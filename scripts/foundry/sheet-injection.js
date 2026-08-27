// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Sheet Injection & Header Controls
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { openActorInventory } from "../ui/inventory-app.js";
import { LOG } from "./logger.js";

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

  // Check document
  const actor = app.document ?? app.actor;
  if (!actor || actor.documentName !== "Actor" || actor.type === "group") {
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

  const ActorSheetV2 = globalThis.foundry?.applications?.sheets?.ActorSheetV2;
  const ActorSheetV1 = globalThis.foundry?.appv1?.sheets?.ActorSheet;
  const isActorSheetInstance = (
    (ActorSheetV2 && app instanceof ActorSheetV2) ||
    (ActorSheetV1 && app instanceof ActorSheetV1)
  );

  const isStandardActorSheet = (
    isActorSheetInstance ||
    app.options?.classes?.includes?.("character") ||
    app.options?.classes?.includes?.("npc") ||
    app.options?.classes?.includes?.("dnd5e2")
  );

  return isDnd5eActorClass || isStandardActorSheet;
}

/**
 * Patch ApplicationV2 and dnd5e Actor Sheets to inject Header Controls in the 3-dots dropdown menu
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
      if (!actor || actor.type === "group") return controls;

      try {
        if (!game.settings.get(MODULE_ID, "showSheetButton")) return controls;
      } catch {}

      const hasAim = controls.some(c => c.action === "aim-inventory" || c.class?.includes?.("aim-open-inv"));
      if (!hasAim) {
        controls.unshift({
          icon: "fa-solid fa-shirt",
          label: game.i18n.localize("AIM.sheetButton.label"),
          action: "aim-inventory",
          class: "aim-open-inv-control",
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
function injectHeaderButton(app, htmlElement) {
  try {
    if (!game.settings.get(MODULE_ID, "showSheetButton")) return;
  } catch {}

  if (!isPrimaryActorSheet(app)) return;

  const root = htmlElement instanceof HTMLElement ? htmlElement : htmlElement?.[0] ?? htmlElement;
  if (!(root instanceof HTMLElement)) return;

  const actor = app.document ?? app.actor;
  if (!actor || actor.documentName !== "Actor" || actor.type === "group") return;

  const header = app.window?.header ?? root.querySelector(".window-header, header.window-header, header.sheet-header");
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
  // Patch ApplicationV2 classes for dropdown menu
  patchSheetHeaderControls();

  // Legacy header buttons hook for ApplicationV1 actor sheets
  Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
    if (!isPrimaryActorSheet(sheet)) return;
    const actor = sheet.document ?? sheet.actor;
    if (!actor || actor.type === "group") return;

    try {
      if (!game.settings.get(MODULE_ID, "showSheetButton")) return;
    } catch {}

    if (!buttons.some(b => b.class === "aim-open-inventory-btn")) {
      buttons.unshift({
        label: "AIM.sheetButton.label",
        class: "aim-open-inventory-btn",
        icon: "fa-solid fa-shirt",
        onclick: () => openActorInventory(actor)
      });
    }
  });

  // Render hooks for dnd5e Actor sheet variants only
  const sheetRenderHooks = [
    "renderActorSheet",
    "renderActorSheet5e",
    "renderActorSheet5eCharacter",
    "renderActorSheet5eCharacter2",
    "renderActorSheet5eNPC",
    "renderActorSheet5eNPC2",
    "renderActorSheetV2"
  ];

  for (const hookName of sheetRenderHooks) {
    Hooks.on(hookName, (app, element) => {
      injectHeaderButton(app, element);
    });
  }

  // Register Keybinding to open inventory of selected token or assigned character
  try {
    game.keybindings?.register?.(MODULE_ID, "openInventoryKey", {
      name: "AIM.keybindings.openInventory.name",
      hint: "AIM.keybindings.openInventory.hint",
      editable: [
        { key: "KeyI", modifiers: ["Shift"] }
      ],
      onDown: () => {
        const token = canvas?.tokens?.controlled?.[0];
        const actor = token?.actor ?? game.user?.character;
        if (actor) {
          openActorInventory(actor);
          return true;
        }
        return false;
      }
    });
  } catch (err) {
    LOG.debug("Keybinding registration skipped", err);
  }

  LOG.info("Sheet injection hooks registered");
}
