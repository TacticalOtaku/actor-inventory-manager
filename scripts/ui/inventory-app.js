// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Inventory Application (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, SLOTS } from "../constants.js";
import { getActorEquippedMap, isOffHandLockedBy2H } from "../core/equipment-rules.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { computeActorEncumbrance } from "../core/weight-calculator.js";
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
  getContainerLoad,
  getContainerWeightReductionPct,
  isWeightyContainersActive,
  openWeightyContainersDialog,
  watchContainerRules
} from "../integrations/weighty-containers.js";
import { LOG } from "../foundry/logger.js";
import { getActorPaperdollTemplate, getActorSlots } from "../core/paperdoll-templates.js";
import { openPaperdollEditor } from "./paperdoll-editor.js";
import { DragDropController } from "./drag-drop-controller.js";
import {
  buildAttunementSlots,
  buildInventoryCounts,
  buildSpellsCounts,
  filterAndSortInventoryItems,
  resolveThemeContext
} from "./inventory-context.js";
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

/** Delay before a filter keystroke triggers a re-render. */
const SEARCH_DEBOUNCE_MS = 180;

/** Shown in place of item art that fails to load. */
const BROKEN_IMAGE_FALLBACK = "icons/svg/item-bag.svg";

/**
 * Preferred window width per layout, before clamping to the viewport.
 * Keyed by `${spellsOpen}|${paperdollCollapsed}`.
 */
const WINDOW_WIDTHS = {
  "true|false": 1460,
  "true|true": 1160,
  "false|false": 1060,
  "false|true": 780
};

/**
 * Resolve the window width for a layout, never exceeding the viewport.
 * @param {boolean} spellsOpen
 * @param {boolean} paperdollCollapsed
 * @returns {number}
 */
export function resolveWindowWidth(spellsOpen, paperdollCollapsed) {
  const preferred = WINDOW_WIDTHS[`${Boolean(spellsOpen)}|${Boolean(paperdollCollapsed)}`] ?? 1060;
  const available = (globalThis.window?.innerWidth ?? preferred) - 40;
  return Math.max(760, Math.min(preferred, available));
}

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
      template: `modules/${MODULE_ID}/templates/inventory-app.hbs`,
      // Preserved across re-renders by ApplicationV2 so equipping an item or
      // typing in the search box does not scroll the panels back to the top.
      scrollable: [
        ".aim-items-scroll-area",
        ".aim-spells-scroll-area",
        ".aim-vitals-panel",
        ".aim-paperdoll-stage"
      ]
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
    const actorItems = Array.from(actor.items.values());
    const attunementSlots = buildAttunementSlots(actorItems, attunementCount, formatItemForDisplay);

    // Filter physical items only (exclude feats, spells, classes, races)
    const allPhysicalItems = actorItems.filter(i => (
      isPhysicalItem(i) && !i.system?.container
    ));
    const containers = actorItems.filter(i => (
      i.type === "container" || i.type === "backpack" || i.system?.type?.value === "container"
    ));

    const displayItems = filterAndSortInventoryItems(allPhysicalItems, {
      tab: this.currentTab,
      search: this.searchFilter,
      sortBy: this.sortBy
    }).map(i => formatItemForDisplay(i));

    // Build container explorer tree
    const containerTrees = containers.map(container => {
      const nestedItems = Array.from(actor.items.values())
        .filter(i => i.system?.container === container.id)
        .map(i => formatItemForDisplay(i));

      const reductionPct = getContainerWeightReductionPct(container);
      const isCollapsed = this.collapsedContainers.has(container.id);

      // Weighty Containers owns the adjusted load: it applies the reduction and
      // walks nested containers, so its numbers are the ones worth showing.
      const load = getContainerLoad(actor, container.id);

      return {
        id: container.id,
        name: container.name,
        img: container.img,
        itemCount: nestedItems.length,
        items: nestedItems,
        reductionPct,
        hasReduction: reductionPct > 0,
        isCollapsed,
        weightyContainersActive: isWeightyContainersActive(),
        load,
        hasLoad: Boolean(load),
        hasCapacity: Boolean(load?.hasCapacity),
        loadDisplay: load
          ? (load.hasCapacity
            ? `${load.load} / ${load.capacity} ${load.unit}`
            : `${load.load} ${load.unit}`)
          : ""
      };
    });

    const counts = buildInventoryCounts(allPhysicalItems, containers);

    // Extract Spells and Actions Data
    const spellSlots = extractSpellSlots(actor);
    const spellGroups = extractActorSpells(actor, this.spellsSearchFilter);
    const actionsData = extractActorActions(actor, this.spellsSearchFilter);

    const spellsCounts = buildSpellsCounts(spellGroups, actionsData);

    // Determine active theme
    const settingTheme = game.settings?.get?.(MODULE_ID, "theme") ?? "dark";
    const themeContext = resolveThemeContext(
      settingTheme,
      Boolean(window.matchMedia?.("(prefers-color-scheme: light)")?.matches),
      key => game.i18n.localize(key)
    );

    const prepared = {
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
      ...themeContext,
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

    /**
     * Lets other modules read or augment the inventory render context.
     * Mutate `context` in place; the returned value is ignored.
     * @event actorInventoryManager.prepareContext
     * @param {ActorInventoryApp} app
     * @param {Object} context
     * @param {Actor} actor
     */
    Hooks.callAll(`${MODULE_ID}.prepareContext`, this, prepared, actor);

    return prepared;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.dragDrop.bind(this.element);

    // Apply active theme attribute
    const theme = context.theme || "dark";
    this._applyTheme(theme);

    // Search input bindings. Re-rendering on every keystroke is wasteful and
    // fights the caret, so filtering is debounced.
    this._bindSearchInput("[data-search-input]", value => { this.searchFilter = value; });
    this._bindSearchInput("[data-spells-search]", value => { this.spellsSearchFilter = value; });

    // Sort select binding
    const sortSelect = this.element.querySelector("[data-sort-select]");
    if (sortSelect) {
      sortSelect.addEventListener("change", e => {
        this.sortBy = e.target.value;
        this.render(false);
      });
    }

    this._restoreCaret();
    this._bindBrokenImageFallback();

    // Bind real-time actor update hook once
    this._bindActorHooks();

    /**
     * Fired after the inventory window has rendered and its listeners are bound.
     * Use this to inject controls or decorate rows.
     * @event actorInventoryManager.renderInventory
     * @param {ActorInventoryApp} app
     * @param {HTMLElement} element
     * @param {Object} context
     */
    Hooks.callAll(`${MODULE_ID}.renderInventory`, this, this.element, context);
  }

  /**
   * Swap art that fails to load for a placeholder.
   * Items whose image came from a removed compendium or art module would
   * otherwise render their alt text, which spills across the paperdoll.
   */
  _bindBrokenImageFallback() {
    // `error` does not bubble, so listen during the capture phase.
    this.element.addEventListener("error", event => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.aimFallbackApplied) return;
      img.dataset.aimFallbackApplied = "true";
      img.src = BROKEN_IMAGE_FALLBACK;
      img.alt = "";
    }, true);
  }

  /**
   * Wire a debounced filter input.
   * @param {string} selector
   * @param {(value: string) => void} apply
   */
  _bindSearchInput(selector, apply) {
    const input = this.element.querySelector(selector);
    if (!input) return;
    input.addEventListener("input", e => {
      const value = e.target.value.trim();
      // ApplicationV2 restores focus after a re-render but not the caret, which
      // would otherwise snap to 0 and reverse everything typed afterwards.
      this._caretState = { selector, start: e.target.selectionStart, end: e.target.selectionEnd };
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => {
        apply(value);
        if (this.rendered) this.render(false);
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  /**
   * Stamp the theme on the window root.
   *
   * Panel colours come from CSS custom properties, and several rules transition
   * `background`/`all`. A transition started by a custom-property change never
   * settles on the new value, which used to leave panels painted in the previous
   * theme until the window was reopened. Suppressing transitions across the swap
   * makes the change atomic.
   *
   * @param {string} theme
   */
  _applyTheme(theme) {
    const root = this.element;
    const changed = root.getAttribute("data-theme") !== theme;
    if (changed) root.classList.add("aim-no-transitions");

    root.setAttribute("data-theme", theme);
    // ApplicationV2 renders into `.application`; keep the v1 frame in sync too.
    const frame = root.closest(".window-app");
    if (frame) frame.setAttribute("data-theme", theme);

    if (!changed) return;
    void root.offsetHeight; // flush the suppressed styles before re-enabling
    requestAnimationFrame(() => requestAnimationFrame(() => {
      root.classList.remove("aim-no-transitions");
    }));
  }

  /** Put the caret back where the user left it before the re-render. */
  _restoreCaret() {
    const state = this._caretState;
    if (!state) return;
    const input = this.element.querySelector(state.selector);
    if (!input || input !== document.activeElement) return;
    const end = Math.min(state.end ?? input.value.length, input.value.length);
    const start = Math.min(state.start ?? end, end);
    try {
      input.setSelectionRange(start, end);
    } catch {
      // Not all input types support selection ranges.
    }
  }

  _bindActorHooks() {
    this._unbindActorHooks();
    const rerender = () => {
      if (this.rendered) this.render(false);
    };

    const onItem = item => {
      if (item.parent?.id === this.actor.id) rerender();
    };

    this._hooks = [
      ["updateActor", Hooks.on("updateActor", actor => {
        if (actor.id === this.actor.id) rerender();
      })],
      ["updateItem", Hooks.on("updateItem", onItem)],
      ["createItem", Hooks.on("createItem", onItem)],
      ["deleteItem", Hooks.on("deleteItem", onItem)]
    ];

    // Weighty Containers announces its own saves; without this the load meter
    // would lag behind a rules change made from its dialog.
    const wcHook = watchContainerRules(container => {
      if (!container || container.parent?.id === this.actor.id) rerender();
    });
    if (wcHook !== null) {
      this._hooks.push(["weighty-containers.updateContainerRules", wcHook]);
    }
  }

  _unbindActorHooks() {
    for (const [hookName, id] of this._hooks) {
      Hooks.off(hookName, id);
    }
    this._hooks = [];
  }

  async close(options = {}) {
    clearTimeout(this._searchDebounce);
    this.dragDrop.unbind();
    this._unbindActorHooks();
    OPEN_INVENTORY_APPS.delete(this.actor.id);
    return super.close(options);
  }

  _syncWindowSize() {
    const targetWidth = resolveWindowWidth(this.isSpellsPanelOpen, this.isPaperdollCollapsed);

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
      await useItem(item, event);
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
  const width = resolveWindowWidth(isSpells, isCollapsed);

  const height = Math.max(560, Math.min(760, window.innerHeight - 60));
  const left = Math.max(20, Math.round((window.innerWidth - width) / 2));
  const top = Math.max(20, Math.round((window.innerHeight - height) / 2));

  const app = new ActorInventoryApp(actor, {
    position: { width, height, top, left }
  });
  OPEN_INVENTORY_APPS.set(actor.id, app);
  await app.render({ force: true });
  return app;
}

/**
 * Toggle the Actor Inventory Window for a given actor
 * @param {Object} actor
 * @returns {Promise<ActorInventoryApp|null>}
 */
export async function toggleActorInventory(actor) {
  if (!actor) return null;
  const existing = OPEN_INVENTORY_APPS.get(actor.id);
  if (existing?.rendered) {
    await existing.close();
    return null;
  }
  return openActorInventory(actor);
}
