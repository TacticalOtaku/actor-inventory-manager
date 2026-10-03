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
  getContainerContentsCount,
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
import { animateMeterChanges, readMeterWidths, shouldReduceMotion } from "./meter-motion.js";
import { isCompact, isDollOpen, resolveMinimumWidth, resolveWindowWidth, toggleDoll, toggleDrawer } from "./window-layout.js";
import { applyTactileTheme } from "./tactile-theme.js";
import { bindPress, captureFlip, countTo, openWindow, playFlip, pop, refuse, slideIn } from "../tactile/motion.js";
import { cssUrl, escapeHTML, isImagePath } from "./html.js";
import {
  buildAttunementSlots,
  buildInventoryCounts,
  buildSpellsCounts,
  filterAndSortInventoryItems,
  isTopLevelItem,
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
  `modules/${MODULE_ID}/templates/parts/item-row.hbs`,
  `modules/${MODULE_ID}/templates/parts/spells-actions.hbs`,
  `modules/${MODULE_ID}/templates/editor/paperdoll-editor.hbs`,
  `modules/${MODULE_ID}/templates/editor/slot-config-dialog.hbs`
];

let templatesPreloaded = null;

/** Load every template and register the parts as partials. */
export function preloadTemplates() {
  templatesPreloaded ??= (async () => {
    await foundry.applications.handlebars.loadTemplates(AIM_TEMPLATES);
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

/** Inventory category tabs and their Font Awesome Light icons. */
const INVENTORY_TABS = Object.freeze([
  { id: "all", icon: "fa-boxes-stacked" },
  { id: "weapons", icon: "fa-sword" },
  { id: "armor", icon: "fa-shield-halved" },
  { id: "consumables", icon: "fa-flask" },
  { id: "containers", icon: "fa-box-archive" },
  { id: "loot", icon: "fa-coins" }
].map(Object.freeze));

/** Grimoire sub-tabs and their Font Awesome Light icons. */
const SPELLS_TABS = Object.freeze([
  { id: "all", icon: "fa-layer-group" },
  { id: "spells", icon: "fa-book-sparkles" },
  { id: "actions", icon: "fa-bolt" },
  { id: "passives", icon: "fa-shield-heart" }
].map(Object.freeze));

/** Coin denominations in the purse, richest first. */
const COIN_KEYS = Object.freeze(["pp", "gp", "ep", "sp", "cp"]);

/** Shown in place of item art that fails to load. */
const BROKEN_IMAGE_FALLBACK = "icons/svg/item-bag.svg";

/** DOM-safe window id for an actor, unique per token actor. */
function appIdFor(actor) {
  return `${MODULE_ID}-actor-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`;
}

function isContainerItem(item) {
  return item.type === "container";
}

const InventoryApplicationBase = foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
);

export class ActorInventoryApp extends InventoryApplicationBase {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-app`,
    classes: ["actor-inventory-manager-app", "tc-root"],
    tag: "div",
    position: {
      width: 1080,
      height: 760
    },
    window: {
      icon: "fa-light fa-shirt",
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
        ".aim-passport-core",
        ".aim-stage"
      ]
    }
  };

  constructor(actor, options = {}) {
    if (!isSupportedActor(actor)) throw new Error("AIM: unsupported actor");
    // The header subtitle carries race, class and level (see _refreshHeader).
    const title = actor.name;
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

    // Drawer and paperdoll state (see window-layout.js); the doll preference and the grimoire persist per actor.
    this.layout = {
      drawer: actor.getFlag?.(MODULE_ID, FLAGS.SPELLS_PANEL_OPEN) ? "spells" : null,
      dollCollapsed: Boolean(actor.getFlag?.(MODULE_ID, FLAGS.PAPERDOLL_COLLAPSED)),
      dollBesideDrawer: false
    };
    this.spellsTab = "all";
    this.spellsSearchFilter = "";

    this.dragDrop = new DragDropController(this);
    this._hooks = [];
  }

  /** May the current user change this actor? */
  get canEdit() {
    return canEditActor(this.actor, game.user);
  }

  get isSpellsPanelOpen() {
    return this.layout.drawer === "spells";
  }

  get isTradePanelOpen() {
    return this.layout.drawer === "trade" && isTradeActor(this.actor);
  }

  get isPaperdollCollapsed() {
    return !isDollOpen(this.layout);
  }

  async _prepareContext(options) {
    await preloadTemplates();

    // Token actors can be rebuilt by Foundry; always render the live document.
    const live = foundry.utils.fromUuidSync(this.actorKey);
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
    const allPhysicalItems = actorItems.filter(i => isPhysicalItem(i) && isTopLevelItem(i, actor.items));
    const containers = actorItems.filter(isContainerItem);

    const displayItems = filterAndSortInventoryItems(allPhysicalItems, {
      tab: this.currentTab,
      search: this.searchFilter,
      sortBy: this.sortBy
    }).map(i => ({ ...formatItemForDisplay(i), canEdit }));

    // Container explorer: top-level bags, with nested bags rendered inside their parent.
    const rootContainers = containers.filter(c => isTopLevelItem(c, actor.items));
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
    const drawer = this.isTradePanelOpen ? "trade" : (this.isSpellsPanelOpen ? "spells" : null);
    const prepared = {
      ...context,
      actor,
      appId: this.id,
      canEdit,
      trade: buildTradeContext(this),
      drawer,
      dollOpen: isDollOpen(this.layout),
      compact: isCompact(this._effectiveLayout(), window.innerWidth),
      isTradePanelOpen: this.isTradePanelOpen,
      isSidePanelOpen: Boolean(drawer),
      hasTradeSession: tradeActor && Boolean(sessionFor(actor.id)),
      vitals,
      coinKeys: COIN_KEYS,
      encumbrance,
      paperdollSlots: allSlots,
      leftSlots: allSlots.filter(s => s.column === "left"),
      centerSlots: allSlots.filter(s => s.column === "center"),
      rightSlots: allSlots.filter(s => s.column === "right"),
      occupiedSlots: allSlots.map(s => ({ id: s.id, label: s.label, hasItem: s.hasItem })),
      attunementSlots,
      items: displayItems,
      containers: containerTrees,
      hasContainers: containerTrees.length > 0,
      showContainers: containerTrees.length > 0 && (this.currentTab === "all" || this.currentTab === "containers"),
      inventoryTabs: INVENTORY_TABS,
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
      spellsTabs: SPELLS_TABS,
      showSpells: this.spellsTab === "all" || this.spellsTab === "spells",
      showActions: this.spellsTab === "all" || this.spellsTab === "actions",
      showPassives: this.spellsTab === "all" || this.spellsTab === "passives",
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
      .map(i => ({ ...formatItemForDisplay(i), canEdit, nested: true }));

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

  _getFrameButtons(options) {
    return [
      ...super._getFrameButtons(options),
      { icon: "fa-light fa-circle-half-stroke", label: "AIM.theme.toggle", action: "toggleTheme" }
    ];
  }

  /** Header identity: portrait with the level badge before the title, the subtitle and read-only tag after it. */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const title = frame.querySelector(".window-title");
    if (title) {
      title.insertAdjacentHTML("beforebegin", '<span class="aim-head-avatar" aria-hidden="true"><img alt=""><b hidden></b></span>');
      const readOnly = escapeHTML(game.i18n.localize("AIM.app.readOnly"));
      title.insertAdjacentHTML("afterend",
        `<span class="aim-head-sub"></span><span class="aim-head-ro" hidden><i class="fa-light fa-eye"></i>${readOnly}</span>`);
    }
    return frame;
  }

  /**
   * Refresh the header identity; the frame outlives every render.
   * @param {Object} vitals
   * @param {boolean} canEdit
   */
  _refreshHeader(vitals, canEdit) {
    const header = this.element?.querySelector(".window-header");
    if (!header || !vitals) return;
    const img = header.querySelector(".aim-head-avatar img");
    if (img && vitals.img && img.getAttribute("src") !== vitals.img) img.src = vitals.img;
    const badge = header.querySelector(".aim-head-avatar b");
    if (badge) {
      badge.textContent = vitals.level ? String(vitals.level) : "";
      badge.hidden = !vitals.level;
    }
    const sub = header.querySelector(".aim-head-sub");
    if (sub) {
      const classLine = [vitals.className, vitals.level].filter(Boolean).join(" ");
      sub.textContent = [vitals.race, vitals.alignment, classLine].filter(Boolean).join(" · ");
    }
    const readOnly = header.querySelector(".aim-head-ro");
    if (readOnly) readOnly.hidden = canEdit;
  }

  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this._bindBrokenImageFallback();
    this._bindActorHooks();
    bindPress(this.element, () => shouldReduceMotion(window));
    openWindow(this.element, { reduce: shouldReduceMotion(window) });
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    // Read while the old DOM is still in place; played back in _onRender.
    this._meterWidths = readMeterWidths(this.element);
    const root = this.element;
    this._motionBefore = {
      hp: Number(root?.querySelector('[data-count="hp"]')?.textContent),
      ac: Number(root?.querySelector('[data-count="ac"]')?.textContent),
      slots: new Map([...(root?.querySelectorAll(".aim-slot[data-slot-id]") ?? [])]
        .map(slot => [slot.dataset.slotId, slot.querySelector(".aim-sock[data-item-id]")?.dataset.itemId ?? ""])),
      // Rows move to their new places only after a tab, search or sort change.
      flip: this._flipNext ? captureFlip(root?.querySelector(".aim-list")) : null
    };
    this._flipNext = false;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    animateMeterChanges(this.element, this._meterWidths);
    if (!options.isFirstRender) this._playRenderMotion(context);
    if (this.canEdit) this.dragDrop.bind(this.element);
    else this.dragDrop.unbind();
    bindTradeInputs(this);

    // Apply active theme attribute
    this._applyTheme(context.theme || "dark");
    this._refreshHeader(context.vitals, context.canEdit);

    // Search input bindings. Re-rendering on every keystroke is wasteful and
    // fights the caret, so filtering is debounced.
    this._bindSearchInput("[data-search-input]", value => { this.searchFilter = value; this._flipNext = true; });
    this._bindSearchInput("[data-spells-search]", value => { this.spellsSearchFilter = value; });

    // Sort select binding
    const sortSelect = this.element.querySelector("[data-sort-select]");
    if (sortSelect) {
      sortSelect.addEventListener("change", e => {
        this.sortBy = e.target.value;
        this._flipNext = true;
        this.render();
      });
    }

    // Container heads are role="button" divs: Enter and Space open them like a click.
    for (const head of this.element.querySelectorAll(".aim-box-head")) {
      head.addEventListener("keydown", event => {
        if (event.target !== head || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        head.click();
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
    return resolveMinimumWidth(this._effectiveLayout(), window.innerWidth);
  }

  /** The layout as rendered: a trade drawer the actor cannot use counts as closed. */
  _effectiveLayout() {
    if (this.layout.drawer === "trade" && !isTradeActor(this.actor)) return { ...this.layout, drawer: null };
    return this.layout;
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
        if (this.rendered) this.render();
      }, SEARCH_DEBOUNCE_MS);
    });
  }

  /**
   * Motion after a re-render: changed numbers count, newly filled slots settle,
   * rows slide from their old places and a freshly opened drawer arrives.
   * @param {Object} context
   */
  _playRenderMotion(context) {
    const reduce = shouldReduceMotion(window);
    const before = this._motionBefore ?? {};
    const root = this.element;
    countTo(root.querySelector('[data-count="hp"]'), before.hp, context.vitals?.hp?.value, { reduce });
    countTo(root.querySelector('[data-count="ac"]'), before.ac, context.vitals?.ac, { reduce });
    for (const slot of root.querySelectorAll(".aim-slot[data-slot-id]")) {
      const itemId = slot.querySelector(".aim-sock[data-item-id]")?.dataset.itemId ?? "";
      if (itemId && before.slots?.has(slot.dataset.slotId) && before.slots.get(slot.dataset.slotId) !== itemId) {
        pop(slot.querySelector(".aim-sock"), { reduce });
      }
    }
    playFlip(before.flip, { reduce, root: root.querySelector(".aim-list") });
    if (this._drawerJustOpened) slideIn(root.querySelector(".aim-drawer"), { reduce });
    this._drawerJustOpened = false;
  }

  /**
   * A rule refused the change: shake the element it was aimed at.
   * Called by the drag-and-drop controller too, which stays free of motion code.
   * @param {Element|null} element
   */
  _refuse(element) {
    refuse(element, { reduce: shouldReduceMotion(window) });
  }

  /**
   * Stamp the theme and accent on the window root.
   *
   * Colours come from Tactile tokens, and controls transition `color` and
   * `box-shadow`. A transition started by a custom-property change could settle
   * on the previous theme's value (the old styles left panels painted that way),
   * so transitions are suppressed across the swap to make it atomic.
   *
   * @param {string} theme
   */
  _applyTheme(theme) {
    const root = this.element;
    const changed = root.getAttribute("data-theme") !== theme;
    if (changed) root.classList.add("aim-no-transitions");

    applyTactileTheme(root, theme);

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
      if (this.rendered) this.render();
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
    // Stay listed until closed, so a reopen during the closing animation can wait for it (openActorInventory).
    await super.close(options);
    if (OPEN_INVENTORY_APPS.get(this.actorKey) === this) OPEN_INVENTORY_APPS.delete(this.actorKey);
    return this;
  }

  _syncWindowSize() {
    const targetWidth = resolveWindowWidth(this._effectiveLayout(), window.innerWidth);
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
   * Open, switch or close a side drawer. The drawer takes the paperdoll's place, so the doll folds
   * into its strip while a drawer is open and comes back when it closes.
   * @param {"spells"|"trade"} name
   */
  async _toggleDrawer(name) {
    this._drawerJustOpened = this.layout.drawer !== name;
    this.layout = toggleDrawer(this.layout, name);
    this._syncWindowSize();
    this.render();
    await this._savePreference(FLAGS.SPELLS_PANEL_OPEN, this.layout.drawer === "spells");
  }

  // --- Static Action Handlers ---

  static _switchTab(event, target) {
    this.currentTab = target.dataset.tab;
    this._flipNext = true;
    this.render();
  }

  static async _toggleEquip(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item && !(await toggleItemEquipped(this.actor, item))) this._refuse(target.closest(".aim-row, .aim-slot"));
  }

  static async _unequipSlot(event, target) {
    const item = getActorEquippedMap(this.actor).get(target.dataset.slotId);
    if (item && !(await unequipItem(this.actor, item))) this._refuse(target.closest(".aim-slot"));
  }

  static _openItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item?.sheet?.render) item.sheet.render({ force: true });
  }

  static async _useItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item) await useItem(item, event);
  }

  static async _toggleAttune(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item && !(await toggleAttunement(item))) this._refuse(target.closest(".aim-row, .aim-asock"));
  }

  static async _deleteItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !assertCanEdit(this.actor)) return;

    // A container's contents stay behind unless the user asks dnd5e to delete them as well.
    const contents = await getContainerContentsCount(item);
    const contentsOption = contents
      ? `<label class="checkbox"><input type="checkbox" name="deleteContents"> ${escapeHTML(game.i18n.format("AIM.dialogs.deleteItem.contents", { count: contents }))}</label>`
      : "";
    // DialogV2 resolves a nullish callback result to the button's action name, so only "yes" returns an object.
    const choice = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("AIM.dialogs.deleteItem.title") },
      content: `<p>${game.i18n.format("AIM.dialogs.deleteItem.message", { item: escapeHTML(item.name) })}</p>${contentsOption}`,
      yes: {
        label: game.i18n.localize("AIM.dialogs.deleteItem.confirm"),
        callback: (event, button) => ({ deleteContents: Boolean(button.form?.elements.deleteContents?.checked) })
      },
      no: { label: game.i18n.localize("AIM.dialogs.deleteItem.cancel") },
      rejectClose: false
    });

    if (choice?.deleteContents !== undefined) await item.delete({ deleteContents: choice.deleteContents });
  }

  static _toggleContainer(event, target) {
    const containerId = target.dataset.containerId;
    if (this.collapsedContainers.has(containerId)) {
      this.collapsedContainers.delete(containerId);
    } else {
      this.collapsedContainers.add(containerId);
    }
    this.render();
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
    const before = this._effectiveLayout();
    const { state, closedDrawer } = toggleDoll(before, window.innerWidth);
    const savedChanged = state.dollCollapsed !== this.layout.dollCollapsed;
    this.layout = state;
    this._syncWindowSize();
    this.render();
    if (savedChanged) await this._savePreference(FLAGS.PAPERDOLL_COLLAPSED, state.dollCollapsed);
    if (closedDrawer && before.drawer === "spells") await this._savePreference(FLAGS.SPELLS_PANEL_OPEN, false);
  }

  static async _toggleSpellsPanel() {
    await this._toggleDrawer("spells");
  }

  static _switchSpellsTab(event, target) {
    this.spellsTab = target.dataset.tab || "all";
    this.render();
  }

  static async _toggleTradePanel() {
    // Drawer choice is local UI state, so observers need no actor write permission.
    if (isTradeActor(this.actor)) await this._toggleDrawer("trade");
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
  // Windows share an id per actor and Foundry registers them by id: a second copy started while the first
  // is still opening is dropped by Foundry, and a closing copy unregisters the new one when its animation ends.
  const { RENDER_STATES } = foundry.applications.api.ApplicationV2;
  if (existing && existing.state >= RENDER_STATES.NONE) return existing;
  if (existing?.state === RENDER_STATES.CLOSING) await existing.close();

  const height = Math.max(560, Math.min(760, window.innerHeight - 60));
  const top = Math.max(20, Math.round((window.innerHeight - height) / 2));
  const app = new ActorInventoryApp(actor, { position: { height, top } });

  // Sized after construction: the layout comes from the actor's saved preferences.
  const width = resolveWindowWidth(app._effectiveLayout(), window.innerWidth);
  const left = Math.max(20, Math.round((window.innerWidth - width) / 2));
  OPEN_INVENTORY_APPS.set(key, app);
  await app.render({ force: true, position: { width, left } });
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
