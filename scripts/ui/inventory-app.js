// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Main Inventory Application (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { canEditActor, canViewActor, isSupportedActor, isTradeActor } from "../core/actor-scope.js";
import { getActorAttunementMax } from "../core/attunement.js";
import { bindTradeInputs, buildTradeContext, handleTradeAction } from "./trade-panel.js";
import { TRADE_HOOK, sessionFor } from "../trade/service.js";
import { getActorEquippedMap, getTwoHandLayout, isOffHandLockedBy2H } from "../core/equipment-rules.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { computeActorEncumbrance, getSystemEncumbrance } from "../core/weight-calculator.js";
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
  getActorCarriedLbs,
  getContainerLoad,
  getContainerWeightReductionPct,
  isWeightyContainersActive,
  openWeightyContainersDialog,
  watchContainerRules
} from "../integrations/weighty-containers.js";
import { LOG } from "../foundry/logger.js";
import { getActorPaperdollTemplate } from "../core/paperdoll-templates.js";
import { openPaperdollEditor } from "./paperdoll-editor.js";
import { DragDropController } from "./drag-drop-controller.js";
import { cssUrl, escapeHTML, isImagePath } from "./html.js";
import {
  buildAttunementSlots,
  buildInventoryCounts,
  buildSpellsCounts,
  filterAndSortInventoryItems,
  resolveThemeContext
} from "./inventory-context.js";
import {
  assertCanEdit,
  toggleAttunement,
  toggleItemEquipped,
  unequipItem,
  useItem
} from "./item-actions.js";

export const AIM_TEMPLATES = [
  `modules/${MODULE_ID}/templates/parts/trade.hbs`,
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

let templatesPreloaded = null;

/**
 * Load every template and register the parts as partials.
 * Foundry 13 moved `loadTemplates` under `foundry.applications.handlebars`;
 * Foundry 12 only has the global.
 */
export function preloadTemplates() {
  templatesPreloaded ??= (async () => {
    const loadTemplatesFn = foundry?.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
    if (typeof loadTemplatesFn !== "function") {
      throw new Error("Foundry's loadTemplates is not available");
    }
    await loadTemplatesFn(AIM_TEMPLATES);
    LOG.debug("Templates preloaded successfully");
  })().catch(err => {
    templatesPreloaded = null; // allow a retry on the next render
    LOG.error("Failed to preload templates", err);
    throw err;
  });
  return templatesPreloaded;
}

/** Open windows, keyed by actor UUID (token actors share their base actor's id). */
const OPEN_INVENTORY_APPS = new Map();

/** Delay before a filter keystroke triggers a re-render. */
const SEARCH_DEBOUNCE_MS = 180;

/** Delay used to coalesce bursts of document hooks into one render. */
const RENDER_COALESCE_MS = 40;

/** Shown in place of item art that fails to load. */
const BROKEN_IMAGE_FALLBACK = "icons/svg/item-bag.svg";

/**
 * Preferred window width per layout, before clamping to the viewport.
 * Keyed by `${sidePanelOpen}|${paperdollCollapsed}`.
 */
const WINDOW_WIDTHS = {
  "true|false": 1460,
  "true|true": 1160,
  "false|false": 1060,
  "false|true": 780
};

/**
 * Narrowest width at which each layout's grid columns still fit
 * (column minimums + gaps + padding + frame, see actor-inventory.css).
 */
const MIN_LAYOUT_WIDTHS = {
  "true|false": 1250,
  "true|true": 1000,
  "false|false": 900,
  "false|true": 650
};

/** Below this viewport width the trade layout hides the vitals column (CSS media query). */
const NARROW_TRADE_VIEWPORT = 1050;
const NARROW_TRADE_MIN_WIDTH = 650;

const layoutKey = (sidePanelOpen, paperdollCollapsed) => `${Boolean(sidePanelOpen)}|${Boolean(paperdollCollapsed)}`;

/**
 * Minimum window width for a layout.
 * @param {boolean} sidePanelOpen
 * @param {boolean} paperdollCollapsed
 * @param {boolean} [tradeOpen=false]
 * @returns {number}
 */
export function resolveMinimumWidth(sidePanelOpen, paperdollCollapsed, tradeOpen = false) {
  if (tradeOpen && paperdollCollapsed && (globalThis.window?.innerWidth ?? Infinity) <= NARROW_TRADE_VIEWPORT) {
    return NARROW_TRADE_MIN_WIDTH;
  }
  return MIN_LAYOUT_WIDTHS[layoutKey(sidePanelOpen, paperdollCollapsed)] ?? 900;
}

/**
 * Resolve the window width for a layout: the preferred width, shrunk to the
 * viewport but never below the width the layout needs.
 * @param {boolean} spellsOpen
 * @param {boolean} paperdollCollapsed
 * @param {boolean} [tradeOpen=false]
 * @returns {number}
 */
export function resolveWindowWidth(spellsOpen, paperdollCollapsed, tradeOpen = false) {
  const preferred = WINDOW_WIDTHS[layoutKey(spellsOpen || tradeOpen, paperdollCollapsed)] ?? 1060;
  const available = (globalThis.window?.innerWidth ?? preferred) - 40;
  return Math.max(resolveMinimumWidth(spellsOpen || tradeOpen, paperdollCollapsed, tradeOpen), Math.min(preferred, available));
}

/** Does a side panel fit next to the expanded paperdoll on this screen? */
function sidePanelFitsBesidePaperdoll() {
  return (globalThis.window?.innerWidth ?? Infinity) - 40 >= MIN_LAYOUT_WIDTHS["true|false"];
}

/** DOM-safe window id for an actor, unique per token actor. */
function appIdFor(actor) {
  return `${MODULE_ID}-actor-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`;
}

function isContainerItem(item) {
  return item.type === "container" || item.type === "backpack" || item.system?.type?.value === "container";
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
      toggleSpellPrep: ActorInventoryApp._toggleSpellPrep,
      toggleTradePanel: ActorInventoryApp._toggleTradePanel,
      tradeAction: ActorInventoryApp._tradeAction
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
        ".aim-trade-scroll-area",
        ".aim-vitals-panel",
        ".aim-paperdoll-stage"
      ]
    }
  };

  constructor(actor, options = {}) {
    if (!isSupportedActor(actor)) throw new Error("AIM: unsupported actor");
    const title = `${actor.name} - ${game.i18n.localize("AIM.app.title")}`;
    super({
      ...options,
      id: appIdFor(actor),
      window: { ...options.window, title }
    });

    this.actor = actor;
    this.actorKey = actor.uuid ?? actor.id;
    this.currentTab = "all";
    this.searchFilter = "";
    this.sortBy = "name";
    this.collapsedContainers = new Set();

    // Collapsible states loaded from actor flags
    this.isPaperdollCollapsed = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED));
    this.isSpellsPanelOpen = Boolean(actor.getFlag?.(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN));
    this.spellsTab = "all";
    this.spellsSearchFilter = "";
    this.isTradePanelOpen = false;
    // Set when a side panel collapsed the paperdoll to make room, so closing the panel restores it.
    this._paperdollAutoCollapsed = false;

    this.dragDrop = new DragDropController(this);
    this._hooks = [];
  }

  /** May the current user change this actor? */
  get canEdit() {
    return canEditActor(this.actor, game.user);
  }

  async _prepareContext(options) {
    await preloadTemplates();

    // Token actors can be rebuilt by Foundry; always render the live document.
    const live = globalThis.fromUuidSync?.(this.actorKey);
    if (live && live.documentName === "Actor") this.actor = live;

    const context = await super._prepareContext(options);
    const actor = this.actor;
    if (!isSupportedActor(actor)) return context;

    const canEdit = this.canEdit;
    const vitals = extractActorVitals(actor);
    const encumbrance = this._computeEncumbrance(actor);
    const equippedMap = getActorEquippedMap(actor);
    const is2HLocked = isOffHandLockedBy2H(equippedMap, actor);
    const { offSlotIds } = getTwoHandLayout(actor);

    // Resolve Actor's active Paperdoll Template and Custom Slots
    const actorTemplateCtx = getActorPaperdollTemplate(actor);

    const allSlots = actorTemplateCtx.slots.map(def => {
      const item = equippedMap.get(def.id) ?? null;
      // Only the off hands are locked; the main hand holds the weapon itself.
      const isLocked = is2HLocked && offSlotIds.includes(def.id);
      const isImageIcon = isImagePath(def.icon);

      return {
        ...def,
        isImageIcon,
        item: item ? formatItemForDisplay(item) : null,
        hasItem: Boolean(item),
        isLocked,
        canEdit,
        lockReason: isLocked ? game.i18n.localize("AIM.slots.lockedBy2H") : null
      };
    });

    const actorItems = Array.from(actor.items.values());
    const attunementSlots = buildAttunementSlots(actorItems, getActorAttunementMax(actor), formatItemForDisplay);

    // Top-level physical items (exclude feats, spells, classes, races and anything inside a bag)
    const allPhysicalItems = actorItems.filter(i => isPhysicalItem(i) && !i.system?.container);
    const containers = actorItems.filter(isContainerItem);

    const displayItems = filterAndSortInventoryItems(allPhysicalItems, {
      tab: this.currentTab,
      search: this.searchFilter,
      sortBy: this.sortBy
    }).map(i => ({ ...formatItemForDisplay(i), canEdit }));

    // Container explorer: top-level bags, with nested bags rendered inside their parent.
    const rootContainers = containers.filter(c => !c.system?.container || !actor.items.has(c.system.container));
    const containerTrees = rootContainers.map(container => this._buildContainerTree(actor, container, new Set(), canEdit));

    const counts = buildInventoryCounts(allPhysicalItems, containers);

    // Extract Spells and Actions Data
    const spellSlots = extractSpellSlots(actor);
    const spellGroups = extractActorSpells(actor, this.spellsSearchFilter);
    const actionsData = extractActorActions(actor, this.spellsSearchFilter);

    const spellsCounts = buildSpellsCounts(spellGroups, actionsData);

    // Determine active theme
    const settingTheme = game.settings.get(MODULE_ID, "theme") ?? "dark";
    const themeContext = resolveThemeContext(
      settingTheme,
      Boolean(window.matchMedia?.("(prefers-color-scheme: light)")?.matches),
      key => game.i18n.localize(key)
    );

    const tradeActor = isTradeActor(actor);
    const prepared = {
      ...context,
      actor,
      appId: this.id,
      canEdit,
      trade: buildTradeContext(this),
      isTradePanelOpen: this.isTradePanelOpen && tradeActor,
      isSidePanelOpen: this.isSpellsPanelOpen || (this.isTradePanelOpen && tradeActor),
      hasTradeSession: tradeActor && Boolean(sessionFor(actor.id)),
      vitals,
      encumbrance,
      paperdollSlots: allSlots,
      leftSlots: allSlots.filter(s => s.column === "left"),
      centerSlots: allSlots.filter(s => s.column === "center"),
      rightSlots: allSlots.filter(s => s.column === "right"),
      attunementSlots,
      items: displayItems,
      containers: containerTrees,
      hasContainers: containerTrees.length > 0,
      currentTab: this.currentTab,
      counts,
      ...themeContext,
      isGM: Boolean(game.user?.isGM),
      showActorPortraitBackdrop: game.settings.get(MODULE_ID, "showActorPortraitBackdrop") !== false && Boolean(actor.img),
      actorImg: actor.img,
      actorImgCss: cssUrl(actor.img),
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

  /**
   * Carried weight and encumbrance tier.
   * The dnd5e encumbrance block is authoritative and already includes Weighty
   * Containers' reductions (it patches the container weight getter). Only when
   * that block is missing is the module's own actor total used, before falling
   * back to raw item weights.
   * @param {Object} actor
   * @returns {Object}
   */
  _computeEncumbrance(actor) {
    if (getSystemEncumbrance(actor)) return computeActorEncumbrance(actor);
    const carriedLbs = getActorCarriedLbs(actor);
    return computeActorEncumbrance(actor, carriedLbs === null ? {} : { overrideCarriedLbs: carriedLbs });
  }

  /**
   * One container card, with its loose items and nested containers.
   * @param {Object} actor
   * @param {Object} container
   * @param {Set<string>} visited guards against corrupt container cycles
   * @param {boolean} canEdit
   * @returns {Object}
   */
  _buildContainerTree(actor, container, visited, canEdit) {
    visited.add(container.id);
    const children = Array.from(actor.items.values()).filter(i => i.system?.container === container.id);
    const nestedContainers = children
      .filter(i => isContainerItem(i) && !visited.has(i.id))
      .map(child => this._buildContainerTree(actor, child, visited, canEdit));
    const items = children
      .filter(i => !isContainerItem(i))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({ ...formatItemForDisplay(i), canEdit }));

    const reductionPct = getContainerWeightReductionPct(container);
    // Weighty Containers owns the adjusted load: it applies the reduction and
    // walks nested containers, so its numbers are the ones worth showing.
    const load = getContainerLoad(actor, container.id);

    return {
      id: container.id,
      name: container.name,
      img: container.img,
      itemCount: children.length,
      items,
      children: nestedContainers,
      hasChildren: nestedContainers.length > 0,
      reductionPct,
      hasReduction: reductionPct > 0,
      isCollapsed: this.collapsedContainers.has(container.id),
      weightyContainersActive: isWeightyContainersActive(),
      canEdit,
      load,
      hasLoad: Boolean(load),
      hasCapacity: Boolean(load?.hasCapacity),
      loadDisplay: load
        ? (load.hasCapacity
          ? `${load.load} / ${load.capacity} ${load.unit}`
          : `${load.load} ${load.unit}`)
        : ""
    };
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._bindBrokenImageFallback();
    this._bindActorHooks();
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.canEdit) this.dragDrop.bind(this.element);
    else this.dragDrop.unbind();
    bindTradeInputs(this);

    // Apply active theme attribute
    this._applyTheme(context.theme || "dark");

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
   * Keep the window at least as wide as its layout needs, so resizing never
   * pushes the columns out of the frame.
   * @param {Object} position
   * @returns {Object}
   */
  _updatePosition(position) {
    const minimum = this._minimumWidth();
    if (typeof position?.width === "number" && position.width < minimum) position.width = minimum;
    return super._updatePosition(position);
  }

  _minimumWidth() {
    const tradeOpen = this.isTradePanelOpen && isTradeActor(this.actor);
    return resolveMinimumWidth(this.isSpellsPanelOpen || tradeOpen, this.isPaperdollCollapsed, tradeOpen);
  }

  /**
   * Swap art that fails to load for a placeholder.
   * Items whose image came from a removed compendium or art module would
   * otherwise render their alt text, which spills across the paperdoll.
   * Bound once: the window element outlives every re-render.
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

  /** Coalesce a burst of document hooks (a batched equip, a rest) into one render. */
  _scheduleRender() {
    if (this._renderTimer) return;
    this._renderTimer = setTimeout(() => {
      this._renderTimer = null;
      if (!isSupportedActor(this.actor) || !canViewActor(this.actor, game.user)) {
        this.close();
        return;
      }
      if (this.rendered) this.render(false);
    }, RENDER_COALESCE_MS);
  }

  _isOwnActor(actor) {
    return Boolean(actor) && (actor.uuid ?? actor.id) === this.actorKey;
  }

  _bindActorHooks() {
    this._unbindActorHooks();
    const rerender = () => this._scheduleRender();
    const onItem = item => {
      if (this._isOwnActor(item?.parent)) rerender();
    };
    // Only the trade drawer depends on other users (who is online, who owns what).
    const onUser = () => {
      if (this.isTradePanelOpen) rerender();
    };

    this._hooks = [
      [TRADE_HOOK, Hooks.on(TRADE_HOOK, rerender)],
      [REFRESH_HOOK, Hooks.on(REFRESH_HOOK, rerender)],
      ["updateUser", Hooks.on("updateUser", (user, changes) => {
        // Trade requests travel as user flags; they are answered through TRADE_HOOK.
        const keys = Object.keys(foundry.utils.flattenObject(changes ?? {})).filter(key => key !== "_id");
        if (keys.length && keys.every(key => key.startsWith("flags."))) return;
        onUser();
      })],
      ["userConnected", Hooks.on("userConnected", onUser)],
      ["updateActor", Hooks.on("updateActor", actor => {
        if (this._isOwnActor(actor)) rerender();
      })],
      ["deleteActor", Hooks.on("deleteActor", actor => {
        if (this._isOwnActor(actor)) this.close();
      })],
      ["updateItem", Hooks.on("updateItem", onItem)],
      ["createItem", Hooks.on("createItem", onItem)],
      ["deleteItem", Hooks.on("deleteItem", onItem)]
    ];

    // Weighty Containers announces its own saves; without this the load meter
    // would lag behind a rules change made from its dialog.
    const wcHook = watchContainerRules(container => {
      if (!container || this._isOwnActor(container.parent)) rerender();
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
    clearTimeout(this._renderTimer);
    this._renderTimer = null;
    this.dragDrop.unbind();
    this._unbindActorHooks();
    if (OPEN_INVENTORY_APPS.get(this.actorKey) === this) OPEN_INVENTORY_APPS.delete(this.actorKey);
    return super.close(options);
  }

  _syncWindowSize() {
    const tradeOpen = this.isTradePanelOpen && isTradeActor(this.actor);
    const targetWidth = resolveWindowWidth(this.isSpellsPanelOpen, this.isPaperdollCollapsed, tradeOpen);
    const screenWidth = window.innerWidth;
    let newLeft = this.position.left;

    if (typeof newLeft === "number") {
      if (newLeft + targetWidth > screenWidth - 25) {
        newLeft = Math.max(20, screenWidth - targetWidth - 25);
      }
    } else {
      newLeft = Math.max(20, Math.round((screenWidth - targetWidth) / 2));
    }

    this.setPosition({ width: targetWidth, left: newLeft });
  }

  /** Save a per-actor UI preference when the user may write to the actor. */
  async _savePreference(flag, value) {
    if (!this.canEdit) return;
    await this.actor.setFlag(MODULE_ID, flag, value);
  }

  /**
   * Open or close a side panel, collapsing the paperdoll while it is open
   * when both do not fit on the screen, and restoring it afterwards.
   * @param {boolean} opening
   */
  _makeRoomForSidePanel(opening) {
    if (opening) {
      if (!this.isPaperdollCollapsed && !sidePanelFitsBesidePaperdoll()) {
        this.isPaperdollCollapsed = true;
        this._paperdollAutoCollapsed = true;
      }
    } else if (this._paperdollAutoCollapsed) {
      this.isPaperdollCollapsed = false;
      this._paperdollAutoCollapsed = false;
    }
  }

  // --- Static Action Handlers ---

  static _switchTab(event, target) {
    this.currentTab = target.dataset.tab;
    this.render(false);
  }

  static async _toggleEquip(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await toggleItemEquipped(this.actor, item);
  }

  static async _unequipSlot(event, target) {
    const item = getActorEquippedMap(this.actor).get(target.dataset.slotId);
    if (item) await unequipItem(this.actor, item);
  }

  static _openItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.sheet?.render) item.sheet.render(true);
  }

  static async _useItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await useItem(item, event);
  }

  static async _toggleAttune(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await toggleAttunement(item);
  }

  static async _deleteItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !assertCanEdit(this.actor)) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AIM.dialogs.deleteItem.title") },
      content: `<p>${game.i18n.format("AIM.dialogs.deleteItem.message", { item: escapeHTML(item.name) })}</p>`,
      yes: { label: game.i18n.localize("AIM.dialogs.deleteItem.confirm") },
      no: { label: game.i18n.localize("AIM.dialogs.deleteItem.cancel") },
      rejectClose: false
    });

    if (confirmed) await item.delete();
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
    const container = this.actor.items.get(target.dataset.containerId);
    if (container) await openWeightyContainersDialog(container);
  }

  static async _shortRest() {
    if (typeof this.actor.shortRest === "function" && assertCanEdit(this.actor)) await this.actor.shortRest();
  }

  static async _longRest() {
    if (typeof this.actor.longRest === "function" && assertCanEdit(this.actor)) await this.actor.longRest();
  }

  static async _toggleTheme() {
    // "auto" resolves to one of the two; flip what is actually on screen.
    const shown = this.element.getAttribute("data-theme") === "light" ? "light" : "dark";
    await game.settings.set(MODULE_ID, "theme", shown === "light" ? "dark" : "light");
  }

  static _openPaperdollEditor() {
    openPaperdollEditor(this.actor);
  }

  static async _togglePaperdoll() {
    this.isPaperdollCollapsed = !this.isPaperdollCollapsed;
    this._paperdollAutoCollapsed = false;
    this._syncWindowSize();
    this.render(false);
    await this._savePreference(FLAGS.PAPERDOLL_COLLAPSED, this.isPaperdollCollapsed);
  }

  static async _toggleSpellsPanel() {
    const wasTradeOpen = this.isTradePanelOpen;
    this.isSpellsPanelOpen = !this.isSpellsPanelOpen;
    if (this.isSpellsPanelOpen) this.isTradePanelOpen = false;
    if (!wasTradeOpen || !this.isSpellsPanelOpen) this._makeRoomForSidePanel(this.isSpellsPanelOpen);
    this._syncWindowSize();
    this.render(false);
    await this._savePreference(FLAGS.SPELLS_PANEL_OPEN, this.isSpellsPanelOpen);
  }

  static _switchSpellsTab(event, target) {
    this.spellsTab = target.dataset.tab || "all";
    this.render(false);
  }

  static async _toggleTradePanel() {
    if (!isTradeActor(this.actor)) return;
    const wasSpellsOpen = this.isSpellsPanelOpen;
    this.isTradePanelOpen = !this.isTradePanelOpen;
    // Drawer choice is local UI state, so observers need no actor write permission.
    if (this.isTradePanelOpen) this.isSpellsPanelOpen = false;
    if (!wasSpellsOpen || !this.isTradePanelOpen) this._makeRoomForSidePanel(this.isTradePanelOpen);
    this._syncWindowSize();
    this.render(false);
  }

  static async _tradeAction(event, target) {
    return handleTradeAction(this, target);
  }

  static async _updateSpellSlot(event, target) {
    const slotKey = target.dataset.slotKey;
    const delta = parseInt(target.dataset.delta, 10) || 0;
    if (slotKey && delta && assertCanEdit(this.actor)) {
      await updateSpellSlot(this.actor, slotKey, delta);
    }
  }

  static async _toggleSpellPrep(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item && assertCanEdit(this.actor)) await toggleSpellPreparation(item);
  }
}

/**
 * Open the Inventory Manager Application for an Actor
 * @param {Object} actor
 * @returns {Promise<ActorInventoryApp|undefined>}
 */
export async function openActorInventory(actor) {
  if (!isSupportedActor(actor)) return;
  if (!canViewActor(actor, game.user)) {
    ui.notifications?.warn(game.i18n.localize("AIM.notifications.noViewPermission"));
    return;
  }
  await preloadTemplates();

  const key = actor.uuid ?? actor.id;
  const existing = OPEN_INVENTORY_APPS.get(key);
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
  OPEN_INVENTORY_APPS.set(key, app);
  await app.render({ force: true });
  return app;
}

/**
 * Toggle the Actor Inventory Window for a given actor
 * @param {Object} actor
 * @returns {Promise<ActorInventoryApp|null>}
 */
export async function toggleActorInventory(actor) {
  if (!isSupportedActor(actor)) return null;
  const existing = OPEN_INVENTORY_APPS.get(actor.uuid ?? actor.id);
  if (existing?.rendered) {
    await existing.close();
    return null;
  }
  return (await openActorInventory(actor)) ?? null;
}
