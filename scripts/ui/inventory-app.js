// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Inventory Application (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import { getActorEquippedMap, isOffHandLockedBy2H } from "../core/equipment-rules.js";
import { isBodyArmor, isPhysicalItem, isShield } from "../core/item-classifier.js";
import { computeActorEncumbrance, num } from "../core/weight-calculator.js";
import {
  extractActorActions,
  extractActorSpells,
  extractActorVitals,
  extractSpellSlots,
  formatItemForDisplay,
  getSystemWeightUnit,
  toggleSpellPreparation,
  updateSpellSlot
} from "../integrations/dnd5e.js";
import {
  getContainerWeightReductionPct,
  isWeightyContainersActive,
  openWeightyContainersDialog
} from "../integrations/weighty-containers.js";
import { LOG } from "../foundry/logger.js";
import { getActorPaperdollTemplate, getActorSlots } from "../core/paperdoll-templates.js";
import { openPaperdollEditor } from "./paperdoll-editor.js";
import { DragDropController } from "./drag-drop-controller.js";
import {
  equipItemToSlot,
  toggleAttunement,
  toggleItemEquipped,
  unequipItem,
  useItem
} from "./item-actions.js";

export const AIM_TEMPLATES = [
  `modules/${MODULE_ID}/templates/inventory-app.hbs`,
  `modules/${MODULE_ID}/templates/parts/character-vitals.hbs`,
  `modules/${MODULE_ID}/templates/parts/paperdoll.hbs`,
  `modules/${MODULE_ID}/templates/parts/slot.hbs`,
  `modules/${MODULE_ID}/templates/parts/inventory-grid.hbs`,
  `modules/${MODULE_ID}/templates/parts/container-view.hbs`,
  `modules/${MODULE_ID}/templates/parts/spells-actions.hbs`,
  `modules/${MODULE_ID}/templates/editor/paperdoll-editor.hbs`,
  `modules/${MODULE_ID}/templates/editor/slot-config-dialog.hbs`
];

let templatesPreloaded = false;

export async function preloadTemplates() {
  if (templatesPreloaded) return;
  try {
    const loadTemplatesFn = foundry?.applications?.handlebars?.loadTemplates
      ?? foundry?.utils?.loadTemplates;
    if (typeof loadTemplatesFn === "function") {
      await loadTemplatesFn(AIM_TEMPLATES);
    }
    templatesPreloaded = true;
    LOG.debug("Templates preloaded successfully");
  } catch (err) {
    LOG.error("Failed to preload templates", err);
  }
}

const OPEN_INVENTORY_APPS = new Map();

const InventoryApplicationBase = foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
);

export class ActorInventoryApp extends InventoryApplicationBase {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: ["actor-inventory-manager-app", "rpg-theme"],
    tag: "div",
    position: {
      width: 1060,
      height: 760
    },
    window: {
      icon: "fa-solid fa-shirt",
      minimizable: true,
      resizable: true
    },
    actions: {
      switchTab: ActorInventoryApp._switchTab,
      toggleEquip: ActorInventoryApp._toggleEquip,
      unequipSlot: ActorInventoryApp._unequipSlot,
      openItem: ActorInventoryApp._openItem,
      useItem: ActorInventoryApp._useItem,
      toggleAttune: ActorInventoryApp._toggleAttune,
      deleteItem: ActorInventoryApp._deleteItem,
      toggleContainer: ActorInventoryApp._toggleContainer,
      openContainerRules: ActorInventoryApp._openContainerRules,
      shortRest: ActorInventoryApp._shortRest,
      longRest: ActorInventoryApp._longRest,
      toggleTheme: ActorInventoryApp._toggleTheme,
      openPaperdollEditor: ActorInventoryApp._openPaperdollEditor,
      togglePaperdoll: ActorInventoryApp._togglePaperdoll,
      toggleSpellsPanel: ActorInventoryApp._toggleSpellsPanel,
      switchSpellsTab: ActorInventoryApp._switchSpellsTab,
      updateSpellSlot: ActorInventoryApp._updateSpellSlot,
      toggleSpellPrep: ActorInventoryApp._toggleSpellPrep
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/inventory-app.hbs`
    }
  };

  constructor(actor, options = {}) {
    const title = `${actor.name} - ${game.i18n.localize("AIM.app.title")}`;
    super({
      ...options,
      id: `${MODULE_ID}-actor-${actor.id}`,
      window: { ...options.window, title }
    });

    this.actor = actor;
    this.currentTab = "all";
    this.searchFilter = "";
    this.sortBy = "name";
    this.collapsedContainers = new Set();

    // Collapsible states loaded from actor flags
    this.isPaperdollCollapsed = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED));
    this.isSpellsPanelOpen = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN));
    this.spellsTab = "all";
    this.spellsSearchFilter = "";

    this.dragDrop = new DragDropController(this);
    this._hooks = [];
  }

  async _prepareContext(options) {
    await preloadTemplates();

    const context = await super._prepareContext(options);
    const actor = this.actor;
    if (!actor) return context;

    const vitals = extractActorVitals(actor);
    const encumbrance = computeActorEncumbrance(actor);
    const equippedMap = getActorEquippedMap(actor);
    const is2HLocked = isOffHandLockedBy2H(equippedMap);

    // Resolve Actor's active Paperdoll Template and Custom Slots
    const actorTemplateCtx = getActorPaperdollTemplate(actor);
    const templateSlots = actorTemplateCtx.slots;

    const allSlots = templateSlots.map(def => {
      const item = equippedMap.get(def.id) ?? null;
      const isLocked = def.rules?.locksOffHandOn2H
        ? is2HLocked
        : (def.id === SLOTS.OFF_HAND && is2HLocked);
      const isImageIcon = Boolean(def.icon && (def.icon.includes("/") || def.icon.endsWith(".png") || def.icon.endsWith(".webp") || def.icon.endsWith(".svg")));

      return {
        ...def,
        label: def.label || (def.labelKey ? game.i18n.localize(def.labelKey) : def.id),
        isImageIcon,
        item: item ? formatItemForDisplay(item) : null,
        hasItem: Boolean(item),
        isLocked,
        lockReason: isLocked ? game.i18n.localize("AIM.slots.lockedBy2H") : null
      };
    });

    // Group slots into 3 columns dynamically from template definition
    const leftSlots = allSlots.filter(s => s.column === "left");
    const centerSlots = allSlots.filter(s => s.column === "center");
    const rightSlots = allSlots.filter(s => s.column === "right");

    // Build Attunement items dynamically based on actor template max
    const attunementCount = actorTemplateCtx.attunementMax ?? (actor.system?.attributes?.attunement?.max ?? 3);
    const attunedItems = Array.from(actor.items.values()).filter(i => {
      const att = i.system?.attunement;
      return i.system?.attuned === true || att === 2 || att === "attuned" || att === "ATTUNED" || String(att).toLowerCase() === "attuned";
    });

    const attunementSlots = Array.from({ length: attunementCount }, (_, idx) => {
      const item = attunedItems[idx] ?? null;
      return {
        index: idx + 1,
        slotId: `attunement${idx + 1}`,
        item: item ? formatItemForDisplay(item) : null,
        hasItem: Boolean(item)
      };
    });

    // Filter physical items only (exclude feats, spells, classes, races)
    const allPhysicalItems = Array.from(actor.items.values()).filter(i => (
      isPhysicalItem(i) && !i.system?.container
    ));
    const containers = Array.from(actor.items.values()).filter(i => (
      i.type === "container" || i.type === "backpack" || i.system?.type?.value === "container"
    ));

    // Filter items by current tab
    const tabFiltered = allPhysicalItems.filter(item => {
      if (this.currentTab === "weapons") {
        return item.type === "weapon";
      }
      if (this.currentTab === "armor") {
        return (
          item.type === "equipment" &&
          (isBodyArmor(item) || isShield(item) || !["trinket", "vehicle"].includes(item.system?.type?.value))
        );
      }
      if (this.currentTab === "consumables") {
        return item.type === "consumable";
      }
      if (this.currentTab === "containers") {
        return item.type === "container" || item.type === "backpack" || item.system?.type?.value === "container";
      }
      if (this.currentTab === "loot") {
        return item.type === "loot" || item.type === "tool" || (item.type === "equipment" && item.system?.type?.value === "trinket");
      }
      return true; // "all"
    });

    // Apply search query
    const searchFiltered = tabFiltered.filter(item => {
      if (!this.searchFilter) return true;
      return item.name.toLowerCase().includes(this.searchFilter.toLowerCase());
    });

    // Sort items
    searchFiltered.sort((a, b) => {
      if (this.sortBy === "weight") {
        return num(b.system?.weight?.value ?? b.system?.weight, 0) - num(a.system?.weight?.value ?? a.system?.weight, 0);
      }
      if (this.sortBy === "value") {
        return num(b.system?.price?.value ?? b.system?.price, 0) - num(a.system?.price?.value ?? a.system?.price, 0);
      }
      if (this.sortBy === "rarity") {
        return (a.system?.rarity ?? "").localeCompare(b.system?.rarity ?? "");
      }
      return a.name.localeCompare(b.name);
    });

    const displayItems = searchFiltered.map(i => formatItemForDisplay(i));

    // Build container explorer tree
    const containerTrees = containers.map(container => {
      const nestedItems = Array.from(actor.items.values())
        .filter(i => i.system?.container === container.id)
        .map(i => formatItemForDisplay(i));

      const reductionPct = getContainerWeightReductionPct(container);
      const isCollapsed = this.collapsedContainers.has(container.id);

      return {
        id: container.id,
        name: container.name,
        img: container.img,
        itemCount: nestedItems.length,
        items: nestedItems,
        reductionPct,
        hasReduction: reductionPct > 0,
        isCollapsed,
        weightyContainersActive: isWeightyContainersActive()
      };
    });

    // Calculate counts for each tab
    const weaponsCount = allPhysicalItems.filter(i => i.type === "weapon").length;
    const armorCount = allPhysicalItems.filter(i => (
      i.type === "equipment" && (isBodyArmor(i) || isShield(i) || !["trinket", "vehicle"].includes(i.system?.type?.value))
    )).length;
    const consumablesCount = allPhysicalItems.filter(i => i.type === "consumable").length;
    const containersCount = containers.length;
    const lootCount = allPhysicalItems.filter(i => (
      i.type === "loot" || i.type === "tool" || (i.type === "equipment" && i.system?.type?.value === "trinket")
    )).length;

    const counts = {
      all: allPhysicalItems.length,
      weapons: weaponsCount,
      armor: armorCount,
      consumables: consumablesCount,
      containers: containersCount,
      loot: lootCount
    };

    // Extract Spells and Actions Data
    const spellSlots = extractSpellSlots(actor);
    const spellGroups = extractActorSpells(actor, this.spellsSearchFilter);
    const actionsData = extractActorActions(actor, this.spellsSearchFilter);

    let totalSpells = 0;
    for (const g of spellGroups) {
      totalSpells += g.count;
    }
    const totalActiveActions = (actionsData.actions.length || 0) + (actionsData.bonus.length || 0) + (actionsData.reactions.length || 0);
    const totalPassives = actionsData.passives.length || 0;

    const spellsCounts = {
      all: totalSpells + totalActiveActions + totalPassives,
      spells: totalSpells,
      actions: totalActiveActions,
      passives: totalPassives
    };

    // Determine active theme
    const settingTheme = game.settings?.get?.(MODULE_ID, "theme") ?? "dark";
    let activeTheme = settingTheme;
    if (settingTheme === "auto") {
      activeTheme = window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
    }
    const isDark = activeTheme === "dark";
    const isLight = activeTheme === "light";
    const themeIcon = isDark ? "fa-solid fa-moon" : "fa-solid fa-sun";
    const themeTooltip = isDark ? game.i18n.localize("AIM.theme.switchToLight") : game.i18n.localize("AIM.theme.switchToDark");

    return {
      ...context,
      actor,
      vitals,
      encumbrance,
      paperdollSlots: allSlots,
      leftSlots,
      centerSlots,
      rightSlots,
      attunementSlots,
      items: displayItems,
      containers: containerTrees,
      hasContainers: containerTrees.length > 0,
      currentTab: this.currentTab,
      counts,
      theme: activeTheme,
      isDark,
      isLight,
      themeIcon,
      themeTooltip,
      isGM: Boolean(globalThis.game?.user?.isGM),
      showActorPortraitBackdrop: Boolean(globalThis.game?.settings?.get(MODULE_ID, "showActorPortraitBackdrop") ?? true) && Boolean(actor.img),
      actorImg: actor.img,
      searchFilter: this.searchFilter,
      sortBy: this.sortBy,
      weightUnit: getSystemWeightUnit(),
      weightyContainersActive: isWeightyContainersActive(),
      // Collapsible & Spells Drawer state
      isPaperdollCollapsed: this.isPaperdollCollapsed,
      isSpellsPanelOpen: this.isSpellsPanelOpen,
      spellsTab: this.spellsTab,
      spellsSearchFilter: this.spellsSearchFilter,
      spellSlots,
      spellGroups,
      actionsData,
      spellsCounts
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.dragDrop.bind(this.element);

    // Apply active theme attribute
    const theme = context.theme || "dark";
    this.element.setAttribute("data-theme", theme);
    const windowApp = this.element.closest(".window-app");
    if (windowApp) {
      windowApp.setAttribute("data-theme", theme);
    }

    // Search input binding
    const searchInput = this.element.querySelector("[data-search-input]");
    if (searchInput) {
      searchInput.addEventListener("input", e => {
        this.searchFilter = e.target.value.trim();
        this.render(false);
      });
    }

    // Spells search input binding
    const spellsSearchInput = this.element.querySelector("[data-spells-search]");
    if (spellsSearchInput) {
      spellsSearchInput.addEventListener("input", e => {
        this.spellsSearchFilter = e.target.value.trim();
        this.render(false);
      });
    }

    // Sort select binding
    const sortSelect = this.element.querySelector("[data-sort-select]");
    if (sortSelect) {
      sortSelect.addEventListener("change", e => {
        this.sortBy = e.target.value;
        this.render(false);
      });
    }

    // Bind real-time actor update hook once
    this._bindActorHooks();
  }

  _bindActorHooks() {
    this._unbindActorHooks();
    const rerender = () => {
      if (this.rendered) this.render(false);
    };

    const updateActorHook = Hooks.on("updateActor", (actor) => {
      if (actor.id === this.actor.id) rerender();
    });
    const updateItemHook = Hooks.on("updateItem", (item) => {
      if (item.parent?.id === this.actor.id) rerender();
    });
    const createItemHook = Hooks.on("createItem", (item) => {
      if (item.parent?.id === this.actor.id) rerender();
    });
    const deleteItemHook = Hooks.on("deleteItem", (item) => {
      if (item.parent?.id === this.actor.id) rerender();
    });

    this._hooks = [updateActorHook, updateItemHook, createItemHook, deleteItemHook];
  }

  _unbindActorHooks() {
    for (const h of this._hooks) {
      Hooks.off("updateActor", h);
      Hooks.off("updateItem", h);
      Hooks.off("createItem", h);
      Hooks.off("deleteItem", h);
    }
    this._hooks = [];
  }

  async close(options = {}) {
    this.dragDrop.unbind();
    this._unbindActorHooks();
    OPEN_INVENTORY_APPS.delete(this.actor.id);
    return super.close(options);
  }

  _syncWindowSize() {
    let targetWidth = 1060;
    if (this.isSpellsPanelOpen && !this.isPaperdollCollapsed) {
      targetWidth = 1380;
    } else if (this.isSpellsPanelOpen && this.isPaperdollCollapsed) {
      targetWidth = 1100;
    } else if (!this.isSpellsPanelOpen && this.isPaperdollCollapsed) {
      targetWidth = 780;
    }

    try {
      const screenWidth = window.innerWidth;
      const currentPos = this.position;
      let newLeft = currentPos.left;

      if (typeof newLeft === "number") {
        if (newLeft + targetWidth > screenWidth - 25) {
          newLeft = Math.max(20, screenWidth - targetWidth - 25);
        }
      } else {
        newLeft = Math.max(20, Math.round((screenWidth - targetWidth) / 2));
      }

      this.setPosition({ width: targetWidth, left: newLeft });
    } catch {}
  }

  // --- Static Action Handlers ---

  static _switchTab(event, target) {
    this.currentTab = target.dataset.tab;
    this.render(false);
  }

  static async _toggleEquip(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await toggleItemEquipped(this.actor, item);
    }
  }

  static async _unequipSlot(event, target) {
    const slotId = target.dataset.slotId;
    const equippedMap = getActorEquippedMap(this.actor);
    const item = equippedMap.get(slotId);
    if (item) {
      await unequipItem(this.actor, item);
    }
  }

  static _openItem(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item?.sheet?.render) {
      item.sheet.render(true);
    }
  }

  static async _useItem(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await useItem(item);
    }
  }

  static async _toggleAttune(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await toggleAttunement(item);
    }
  }

  static async _deleteItem(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AIM.dialogs.deleteItem.title") },
      content: `<p>${game.i18n.format("AIM.dialogs.deleteItem.message", { item: item.name })}</p>`,
      yes: { label: game.i18n.localize("AIM.dialogs.deleteItem.confirm") },
      no: { label: game.i18n.localize("AIM.dialogs.deleteItem.cancel") },
      rejectClose: false
    });

    if (confirmed) {
      await item.delete();
    }
  }

  static _toggleContainer(event, target) {
    const containerId = target.dataset.containerId;
    if (this.collapsedContainers.has(containerId)) {
      this.collapsedContainers.delete(containerId);
    } else {
      this.collapsedContainers.add(containerId);
    }
    this.render(false);
  }

  static async _openContainerRules(event, target) {
    const containerId = target.dataset.containerId;
    const container = this.actor.items.get(containerId);
    if (container) {
      await openWeightyContainersDialog(container);
    }
  }

  static async _shortRest(event, target) {
    if (typeof this.actor.shortRest === "function") {
      this.actor.shortRest();
    }
  }

  static async _longRest(event, target) {
    if (typeof this.actor.longRest === "function") {
      this.actor.longRest();
    }
  }

  static async _toggleTheme(event, target) {
    const current = game.settings.get(MODULE_ID, "theme");
    const next = current === "light" ? "dark" : "light";
    await game.settings.set(MODULE_ID, "theme", next);
    this.render(false);
  }

  static _openPaperdollEditor(event, target) {
    openPaperdollEditor(this.actor);
  }

  static async _togglePaperdoll(event, target) {
    this.isPaperdollCollapsed = !this.isPaperdollCollapsed;
    await this.actor.setFlag(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED, this.isPaperdollCollapsed);
    this._syncWindowSize();
    this.render(false);
  }

  static async _toggleSpellsPanel(event, target) {
    this.isSpellsPanelOpen = !this.isSpellsPanelOpen;
    await this.actor.setFlag(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN, this.isSpellsPanelOpen);
    this._syncWindowSize();
    this.render(false);
  }

  static _switchSpellsTab(event, target) {
    this.spellsTab = target.dataset.tab || "all";
    this.render(false);
  }

  static async _updateSpellSlot(event, target) {
    const slotKey = target.dataset.slotKey;
    const delta = parseInt(target.dataset.delta, 10) || 0;
    if (slotKey && delta) {
      await updateSpellSlot(this.actor, slotKey, delta);
    }
  }

  static async _toggleSpellPrep(event, target) {
    const itemId = target.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (item) {
      await toggleSpellPreparation(item);
    }
  }
}

/**
 * Open the Inventory Manager Application for an Actor
 * @param {Object} actor
 */
export async function openActorInventory(actor) {
  if (!actor) return;
  await preloadTemplates();

  const existing = OPEN_INVENTORY_APPS.get(actor.id);
  if (existing?.rendered) {
    existing.bringToFront();
    return existing;
  }

  const isCollapsed = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED));
  const isSpells = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN));
  let width = 1060;
  if (isSpells && !isCollapsed) width = 1380;
  else if (isSpells && isCollapsed) width = 1100;
  else if (!isSpells && isCollapsed) width = 780;

  const height = 760;
  const left = Math.max(20, Math.round((window.innerWidth - width) / 2));
  const top = Math.max(20, Math.round((window.innerHeight - height) / 2));

  const app = new ActorInventoryApp(actor, {
    position: { width, height, top, left }
  });
  OPEN_INVENTORY_APPS.set(actor.id, app);
  await app.render({ force: true });
  return app;
}
