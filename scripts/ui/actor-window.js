// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the window for a supported actor (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { canEditActor, canViewActor, isSupportedActor } from "../core/actor-scope.js";
import { ALWAYS_TAB, SHEET_TABS, fallbackTab, partsForActorChange, partsForEffectChange, visibleTabs } from "../core/actor-window.js";
import { LIST_FILTERS, withListPref } from "../core/inventory.js";
import { SPELL_FILTERS } from "../core/spellbook.js";
import { FEATURE_FILTERS } from "../core/features.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { WindowRenderQueue } from "../core/window-render-queue.js";
import { LOG } from "../foundry/logger.js";
import { readFeatures, readNpc } from "../integrations/dnd5e.js";
import { CONTAINER_RULES_HOOK } from "../integrations/weighty-containers.js";
import { styleScItemRows } from "../integrations/sc-rarity-colors.js";
import { TRADE_HOOK, isTradeLocked } from "../trade/service.js";
import { preloadBursts } from "./bursts.js";
import { EFFECT_TEMPLATES } from "./effects.js";
import { EQUIPMENT_TEMPLATES, buildItemDetail, closeItemMenu } from "./equipment.js";
import { favoriteItemIds, hasFavorites } from "./favorites.js";
import { FEATURE_TEMPLATES, featureMode, hasFeatures } from "./features.js";
import { t } from "./html.js";
import { InlineEdits } from "./inline-edits.js";
import { bindInventoryDrag } from "./inventory-drag.js";
import { SETTLE, bindPointerFx, cascade } from "./motion.js";
import { morph } from "./morph.js";
import { OVERVIEW_TEMPLATES, hasOverview } from "./overview.js";
import { REST_HOOK, holdRestored, playLongRest } from "./rail.js";
import { SPELL_TEMPLATES } from "./spells.js";
import { bindTooltips, releaseTooltips } from "./tooltips.js";
import { TradePanel, isNewItem, offerButton } from "./trade.js";
import { EFFECTS_OVERVIEW_ACTIONS, EffectsOverviewController } from "./window/effects-overview-controller.js";
import { EQUIPMENT_ACTIONS, EquipmentController } from "./window/equipment-controller.js";
import { RAIL_ACTIONS, RailController } from "./window/rail-controller.js";
import { SETTINGS_ACTIONS, SettingsController } from "./window/settings-controller.js";
import { SPELLS_FEATURES_ACTIONS, SpellsFeaturesController } from "./window/spells-features-controller.js";
import { TRADE_ACTIONS, TradeController } from "./window/trade-controller.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/window`;

/** Open windows, keyed by actor UUID (a token actor gets its own window). */
const OPEN_WINDOWS = new Map();

/** What comes in as a cascade when a tab or a section opens. */
const CASCADE = ".aim-rowwrap > [data-row], .aim-effwrap, .aim-check, .aim-card";

/** The search fields and the window state each one filters. */
const SEARCH_FIELDS = { inventorySearch: "query", spellSearch: "spellQuery", featureSearch: "featureQuery" };

/** The filters each tab knows. */
const TAB_FILTERS = { equipment: LIST_FILTERS, spells: SPELL_FILTERS, features: FEATURE_FILTERS };

const hasLegendary = (actor) => Object.values(readNpc(actor)?.legendary ?? {}).some(Boolean);

/** The settings list names a block by what it holds for this actor type. */
const railBlockLabel = (id, type) => {
  if (type === "npc" && (id === "stats" || id === "chips")) return t(`AIM.window.rail.${id}Npc`);
  if (type === "vehicle" && id === "stats") return t("AIM.window.rail.statsVehicle");
  return t(`AIM.window.rail.${id}`);
};

function windowIdFor(actor) {
  return `${MODULE_ID}-window-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`;
}

const getSetting = (key) => game.settings.get(MODULE_ID, key);

const WindowBase = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

export class ActorWindow extends WindowBase {
  static openWindow(actor) {
    return openActorWindow(actor);
  }

  static DEFAULT_OPTIONS = {
    classes: ["aim-root", "aim-window"],
    tag: "section",
    position: { width: 1040, height: 720 },
    window: { icon: "fa-light fa-shirt", resizable: true, minimizable: true },
    actions: {
      switchTab: ActorWindow.#onSwitchTab,
      ...SETTINGS_ACTIONS,
      ...RAIL_ACTIONS,
      ...TRADE_ACTIONS,
      ...EQUIPMENT_ACTIONS,
      ...SPELLS_FEATURES_ACTIONS,
      ...EFFECTS_OVERVIEW_ACTIONS
    }
  };

  static PARTS = {
    rail: { template: `${TEMPLATES}/rail.hbs`, templates: EFFECT_TEMPLATES },
    main: { template: `${TEMPLATES}/main.hbs`, templates: [...EQUIPMENT_TEMPLATES, ...SPELL_TEMPLATES, ...FEATURE_TEMPLATES, ...EFFECT_TEMPLATES, ...OVERVIEW_TEMPLATES], scrollable: [".aim-panel"] },
    inspector: { template: `${TEMPLATES}/inspector.hbs`, templates: EQUIPMENT_TEMPLATES, scrollable: [""] },
    drawer: { template: `${TEMPLATES}/drawer.hbs`, scrollable: [".aim-drawer-body"] },
    trade: { template: `${TEMPLATES}/trade.hbs`, scrollable: [".aim-trade-body"] }
  };

  constructor(actor, options = {}) {
    if (!isSupportedActor(actor)) throw new Error("AIM: unsupported actor");
    super({ ...options, id: windowIdFor(actor), window: { ...options.window, title: actor.name } });
    this.actor = actor;
    this.actorKey = actor.uuid ?? actor.id;
    this.tab = ALWAYS_TAB;
    this.trade = new TradePanel(this);
    this._settings = new SettingsController(this);
    this._rail = new RailController(this);
    this._tradeCtrl = new TradeController(this);
    this._equipment = new EquipmentController(this);
    this._spells = new SpellsFeaturesController(this);
    this._effects = new EffectsOverviewController(this);
    this._edits = new InlineEdits({
      hp: this._rail.inlineEditAdapter(),
      coin: this._equipment.inlineEditAdapter(),
      uses: this._spells.inlineEditAdapter()
    }, {
      render: (part) => this.render({ parts: [part] }),
      onError: (error, { saved = false } = {}) => {
        LOG.error("Inline edit failed", error);
        ui.notifications?.warn(t(`AIM.notifications.${saved ? "inlineEditRefreshFailed" : "inlineEditFailed"}`));
      }
    });
    this._hooks = [];
    this._redraws = new WindowRenderQueue({
      parts: Object.keys(this.constructor.PARTS),
      render: (parts) => this.render({ parts }),
      editing: () => this._effects.editingBio(),
      active: () => this.rendered,
      onError: (error) => LOG.error("Actor window redraw failed", error)
    });
  }

  get hpEditing() { return this._edits.state("hp").target !== null; }
  get hpDraft() { return this._edits.state("hp").text; }
  get coinEditing() { return this._edits.state("coin").target; }
  get coinDraft() { return this._edits.state("coin").text; }
  get usesEditing() { return this._edits.state("uses").target; }
  get usesDraft() { return this._edits.state("uses").text; }

  get menuOpen() { return this._rail.menuOpen; }
  set menuOpen(value) { this._rail.menuOpen = value; }
  get xpOpen() { return this._rail.xpOpen; }
  set xpOpen(value) { this._rail.xpOpen = value; }
  get askReset() { return this._settings.askReset; }
  set askReset(value) { this._settings.askReset = value; }
  get query() { return this._equipment.query; }
  set query(value) { this._equipment.query = value; }
  get collapsed() { return this._equipment.collapsed; }
  get selected() { return this._equipment.selected; }
  set selected(value) { this._equipment.selected = value; }
  get selectedKey() { return this._equipment.selectedKey; }
  set selectedKey(value) { this._equipment.selectedKey = value; }
  get spellQuery() { return this._spells.spellQuery; }
  set spellQuery(value) { this._spells.spellQuery = value; }
  get featureQuery() { return this._spells.featureQuery; }
  set featureQuery(value) { this._spells.featureQuery = value; }
  get effectOpen() { return this._effects.effectOpen; }
  set effectOpen(value) { this._effects.effectOpen = value; }

  get canEdit() {
    return canEditActor(this.actor, game.user);
  }

  get motionOn() {
    return this.element?.dataset.motion !== "off";
  }

  /** A user who lost sight of the actor (the GM took Observer away) sees the window close, as with a document sheet. */
  _canRender(options) {
    if (canViewActor(foundry.utils.fromUuidSync(this.actorKey) ?? this.actor, game.user)) return super._canRender(options);
    if (this.rendered) this.close();
    return false;
  }

  /* ─── Context ─── */

  async _prepareContext(options) {
    const live = foundry.utils.fromUuidSync(this.actorKey);
    if (live?.documentName === "Actor") this.actor = live;
    const actor = this.actor;
    const tabs = this.#tabs();
    this.tab = fallbackTab(this.tab, tabs.filter((tab) => !tab.hidden).map((tab) => tab.id));
    for (const tab of tabs) tab.active = tab.id === this.tab;
    const selectedItem = this._equipment.selected ? actor.items.get(this._equipment.selected) : null;
    if (!selectedItem) this._equipment.selected = this._equipment.selectedKey = null;
    // A redraw without the tabs or the inspector (an HP tick) skips their rows, the details and the biography.
    const body = options.parts?.some((part) => part === "main" || part === "inspector") ?? true;
    const detail = body && selectedItem ? await buildItemDetail(selectedItem, { canEdit: this.canEdit }) : null;
    const favIds = favoriteItemIds(actor);
    const trade = this.trade.context();
    const hasSpells = this._spells.hasSpells();
    return {
      trade,
      tradeLock: isTradeLocked(actor),
      offerRows: body ? Object.fromEntries(actor.items.map((item) => [item.id, offerButton(trade, item)]).filter(([, state]) => state)) : {},
      newItems: body ? Object.fromEntries(actor.items.filter(isNewItem).map((item) => [item.id, true])) : {},
      ...(await super._prepareContext(options)),
      windowId: this.id,
      actor,
      canEdit: this.canEdit,
      ...this._rail.buildHeaderContext(),
      tabs,
      pendingText: t("AIM.window.panelPending"),
      askReset: this._settings.askReset,
      settings: this._settings.buildContext({
        hasSpells,
        hasLegendary: hasLegendary(actor),
        missingTabs: this.#missingTabs(),
        tabLabel: (id) => this.#tabLabel(id),
        railBlockLabel
      }),
      hpEditing: this.hpEditing,
      hpDraft: this.hpDraft,
      inv: body && await this._equipment.buildContext(detail, favIds),
      inspector: body && selectedItem ? this._equipment.buildInspector(selectedItem, detail) : null,
      spells: body && hasSpells ? this._spells.buildSpellsContext(detail, favIds) : null,
      prepWarning: this._spells.prepWarning(),
      favorites: await this._spells.buildFavoritesContext(),
      canFavorite: hasFavorites(actor) && this.canEdit,
      features: body && this._spells.buildFeaturesContext(detail, favIds),
      effects: await this._effects.buildEffectsContext(),
      overview: body ? this._effects.buildOverviewContext() : null,
      bio: body && await this._effects.buildBiographyContext(),
      doll: body && this._equipment.buildDollContext(),
      ...this._rail.buildRailContext({ hasSpells })
    };
  }

  /** Tabs this actor has nothing for: no spells, a vehicle without actions, no overview. */
  #missingTabs() {
    const missing = this._spells.hasSpells() ? [] : ["spells"];
    if (this.actor.type === "vehicle" && !hasFeatures(this.actor)) missing.push("features");
    if (!hasOverview(this.actor)) missing.push("overview");
    return missing;
  }

  #tabLabel(id) {
    return t(id === "features" && featureMode(this.actor) === "action" ? "AIM.window.tabs.actions" : `AIM.window.tabs.${id}`);
  }

  /** The tabs, with how many items, spells and features each one lists. */
  #tabs() {
    const shown = visibleTabs({ hidden: getSetting("hiddenTabs") ?? [], missing: this.#missingTabs() });
    const items = [...this.actor.items];
    const counts = {
      equipment: items.filter(isPhysicalItem).length,
      spells: items.filter((item) => item.type === "spell").length,
      features: readFeatures(this.actor, { attacks: featureMode(this.actor) === "action" }).length
    };
    return SHEET_TABS.map((id) => ({ id, label: this.#tabLabel(id), count: counts[id] || "", hidden: !shown.includes(id) }));
  }

  /* ─── Rendering ─── */

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    OPEN_WINDOWS.set(this.actorKey, this);
    this.#registerDocumentHooks();
    // Looping effects run only in the actor window in front.
    this.element.addEventListener("pointerdown", () => this.#bringFront(), { capture: true });
    this.#bringFront();
    this._rail.startGlints();
    if (this.element.dataset.motion !== "off") preloadBursts();
    this.#bindObservers();
    this.#bindScrolling();
    bindPointerFx(this.element);
    this.#bindDelegatedEvents();
    bindInventoryDrag(this);
    bindTooltips(this);
    // The window settles in from below; the rail's blocks follow one after another.
    if (this.motionOn) {
      this.element.querySelector(".window-content")?.animate(
        [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
        { duration: 420, easing: SETTLE }
      );
      [...this.element.querySelector(".aim-rail")?.children ?? []].slice(0, 12).forEach((block, i) => block.animate(
        [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
        { duration: 360, delay: 90 + i * 45, easing: SETTLE, fill: "backwards" }
      ));
    }
  }

  #registerDocumentHooks() {
    const rerender = () => this._redraws.enqueue();
    const mine = (doc) => [doc, doc?.parent, doc?.parent?.parent].some((d) => d?.uuid === this.actorKey);
    this.#hook("updateActor", (actor, changes) => mine(actor) && this._redraws.enqueue(actor === this.actor ? partsForActorChange(changes) : null));
    this.#hook("deleteActor", (actor) => actor?.uuid === this.actorKey && this.close());
    this.#hook("deleteToken", (token) => this.actorKey.startsWith(`${token.uuid}.`) && this.close());
    this.#hook("deleteScene", (scene) => this.actorKey.startsWith(`${scene.uuid}.`) && this.close());
    for (const name of ["createItem", "updateItem", "deleteItem"]) this.#hook(name, (doc) => mine(doc) && rerender());
    for (const name of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      this.#hook(name, (effect) => mine(effect) && this._redraws.enqueue(partsForEffectChange({
        onActor: effect.parent === this.actor,
        changes: effect.changes ?? [],
        statuses: [...(effect.statuses ?? [])]
      }, this.tab)));
    }
    this.#hook(REFRESH_HOOK, rerender);
    this.#hook(TRADE_HOOK, (state) => this._tradeCtrl.onTradeHook(state));
    this.#hook(CONTAINER_RULES_HOOK, rerender);
    this.#hook("dnd5e.createActivityTemplate", (activity) => activity?.actor?.uuid === this.actorKey && this._spells.awaitTemplate());
    this.#hook(REST_HOOK, (actor, _result, config) => actor?.uuid === this.actorKey && config?.type === "long" && playLongRest(this.element));
    this.#hook("dnd5e.preRestCompleted", (actor, _result, config) => actor?.uuid === this.actorKey && config?.type === "long" && holdRestored(this.element));
  }

  #bindObservers() {
    this._bodyObserver = new MutationObserver(() => {
      this._settings.applyRootState();
      if (this.element?.classList.contains("is-settings")) this.render({ parts: ["drawer"] });
    });
    this._bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this._reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._onReducedMotion = () => this.render({ parts: ["drawer"] }).then(() => this._settings.applyRootState());
    this._reducedMotion?.addEventListener("change", this._onReducedMotion);
    this._resizeObserver = new ResizeObserver(() => this._settings.applyLayout());
    this._resizeObserver.observe(this.element);
    this._away = (event) => this._rail.closePopupsOnAway(event);
    this._awayDoc = this.element.ownerDocument;
    this._awayDoc.addEventListener("pointerdown", this._away, { capture: true });
  }

  /** Scrolling: once a panel is scrolled the tab strip casts a shadow over it; narrow rail scrolls sideways. */
  #bindScrolling() {
    const el = this.element;
    el.addEventListener("scroll", (event) => {
      const target = event.target;
      if (target.matches?.(".aim-panel")) el.querySelector(".aim-main")?.classList.toggle("is-scrolled", target.scrollTop > 2);
      else if (target.matches?.(".aim-rail")) this.railEdges();
    }, { capture: true, passive: true });
    el.addEventListener("wheel", (event) => {
      const rail = event.target.closest?.(".aim-rail");
      if (!rail || el.dataset.layout !== "narrow" || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      for (let node = event.target; node && node !== rail; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== "visible") return;
      }
      if (rail.scrollWidth <= rail.clientWidth) return;
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    }, { passive: false });
  }

  #bindDelegatedEvents() {
    const el = this.element;
    el.addEventListener("keydown", (event) => this.#onKeydown(event));
    el.addEventListener("change", (event) => this.#onChange(event));
    el.addEventListener("pointerdown", (event) => this._equipment.clearSearchIfAway(event.target));
    el.addEventListener("click", (event) => {
      if (event.target.closest("button, input, a, label, select")) return;
      const row = event.target.closest("[data-row]");
      if (row) this._equipment.selectRow(row);
      const effectRow = event.target.closest("[data-effect-row]");
      if (effectRow) this._effects.toggleEffectOpen(effectRow);
    });
    el.addEventListener("input", (event) => {
      if (event.target.matches?.("[data-offer-qty], [data-trade-coin]")) return this.trade.input(event.target);
      const field = SEARCH_FIELDS[event.target.name];
      if (field) this._equipment.handleSearchInput(event.target, field);
    });
    el.addEventListener("contextmenu", (event) => {
      if (event.target.closest(".aim-level")) {
        event.preventDefault();
        this._rail.xpOpen = !this._rail.xpOpen;
        return this.render({ parts: ["main"] });
      }
      const loadoutPill = event.target.closest(".aim-loadout-pill[data-loadout-id]");
      if (loadoutPill && this._equipment.openLoadoutMenu(loadoutPill)) {
        event.preventDefault();
        return;
      }
      const effectRow = event.target.closest("[data-effect-row]");
      if (effectRow) {
        event.preventDefault();
        return this._effects.openEffectMenu(effectRow, event);
      }
      if (event.target.closest("[data-charge]")) {
        event.preventDefault();
        return this._equipment.changeCharge(this.itemFrom(event.target), "restore");
      }
      if (event.target.closest("input, textarea, [contenteditable]")) return;
      if (this._equipment.openContextMenu(event)) event.preventDefault();
    });
    el.addEventListener("focusout", (event) => {
      this._equipment.handleFocusOut(event);
      if (event.target.matches?.("[data-bio-field]")) this._redraws.resume();
    });
    el.addEventListener("close", (event) => event.target.matches?.("[data-bio-editor]") && this._redraws.resume(), { capture: true });
  }

  railEdges() {
    const rail = this.element?.querySelector(".aim-rail");
    if (!rail) return;
    const narrow = this.element.dataset.layout === "narrow";
    rail.classList.toggle("has-more-left", narrow && rail.scrollLeft > 2);
    rail.classList.toggle("has-more-right", narrow && rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    this._tradeCtrl.captureFocus();
    this._equipment.capturePreRender();
    this._spells.capturePreRender();
  }

  /** The main part is patched in place, not replaced: only what changed is restyled and laid out again (#9). */
  _replaceHTML(result, content, options) {
    return this._edits.replace(() => {
      const active = content.ownerDocument.activeElement;
      const drawer = content.querySelector('[data-application-part="drawer"]');
      const drawerFocus = result.drawer && drawer?.contains(active) ? active : null;
      const prior = result.main && content.querySelector('[data-application-part="main"]');
      if (prior) {
        const state = {};
        this._preSyncPartState("main", result.main, prior, state);
        morph(prior, result.main);
        this._syncPartState("main", prior, prior, state);
        delete result.main;
      }
      const replaced = super._replaceHTML(result, content, options);
      this._settings.restoreDrawerFocus(content, drawerFocus);
      return replaced;
    });
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this._redraws.resume();
    this._settings.syncDrawer(this.element.classList.contains("is-settings"));
    this._settings.applyRootState();
    this._settings.applyLayout({ animate: false });
    this.moveInk();
    this.railEdges();
    this._rail.afterRender(options.parts);
    this._spells.afterRender();
    this._effects.afterRender();
    this._edits.mount(this.element);
    this._equipment.afterRender();
    if (options.parts.includes("main")) styleScItemRows(this.element, this.actor);
    this._equipment.playLanding();
    this._tradeCtrl.afterRender(options);
  }

  async _preClose(options) {
    closeItemMenu(this.element);
    return super._preClose(options);
  }

  _onClose(options) {
    this._settings.dispose();
    this._rail.dispose();
    this._equipment.dispose();
    this._spells.dispose();
    this._edits.close();
    this._redraws.close();
    this._awayDoc?.removeEventListener("pointerdown", this._away, { capture: true });
    this.trade.close();
    releaseTooltips(this);
    for (const [name, id] of this._hooks) Hooks.off(name, id);
    this._hooks = [];
    this._bodyObserver?.disconnect();
    this._resizeObserver?.disconnect();
    this._reducedMotion?.removeEventListener("change", this._onReducedMotion);
    if (OPEN_WINDOWS.get(this.actorKey) === this) OPEN_WINDOWS.delete(this.actorKey);
    super._onClose(options);
  }

  #hook(name, fn) {
    this._hooks.push([name, Hooks.on(name, fn)]);
  }

  #bringFront() {
    for (const app of OPEN_WINDOWS.values()) app.element?.classList.toggle("is-front", app === this);
  }

  moveInk() {
    const tab = this.element?.querySelector(`.aim-tab[data-tab="${this.tab}"]`);
    const ink = this.element?.querySelector(".aim-tab-ink");
    if (!tab || !ink) return;
    ink.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth / 100})`;
  }

  #onKeydown(event) {
    if (event.target.matches?.(".aim-tab") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...this.element.querySelectorAll(".aim-tab:not([hidden])")];
      const index = tabs.indexOf(event.target);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowLeft" ? -1 : 1) + tabs.length) % tabs.length;
      const tab = tabs[next];
      if (tab && this.switchTo(tab.dataset.tab)) {
        event.preventDefault();
        tab.focus();
      }
      return;
    }
    if (this._rail.handleKeydown(event)) return;
    if (this._equipment.handleKeydown(event)) return;
    if (this._effects.handleKeydown(event)) return;
    if (this._spells.handleKeydown(event)) return;
    if (event.key !== "Escape") return;
    if (closeItemMenu(this.element, { restoreFocus: true })) {
      event.stopPropagation();
    } else if (this.element.classList.contains("is-settings")) {
      event.stopPropagation();
      this._settings.setSettings(false);
    } else {
      this._rail.closePopupsOnEscape(event);
    }
  }

  async #onChange(event) {
    const input = event.target;
    if (this._settings.handleChange(input)) return;
    if (this._equipment.handleChange(input)) return;
    await this._effects.handleChange(input);
  }

  /* ─── Shared window helpers for controllers & collaborators ─── */

  static #onSwitchTab(event, target) {
    this.switchTo(target.dataset.tab);
  }

  /** Shows a tab; false for one the user hid, which a favorite does not open either. */
  switchTo(tab) {
    if (!tab || this.element.querySelector(`.aim-tab[data-tab="${tab}"]`)?.hidden) return false;
    if (tab === this.tab) return true;
    this.tab = tab;
    for (const button of this.element.querySelectorAll(".aim-tab")) {
      const active = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active) button.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: this.motionOn ? "smooth" : "auto" });
    }
    for (const panel of this.element.querySelectorAll(".aim-panel")) {
      const on = panel.dataset.panel === tab;
      panel.hidden = !on;
      if (!on || !this.motionOn) continue;
      panel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: SETTLE });
      cascade(panel, CASCADE);
    }
    this.element.querySelector(".aim-main")?.classList.toggle("is-scrolled", this.element.querySelector(`[data-panel="${tab}"]`)?.scrollTop > 2);
    this.moveInk();
    return true;
  }

  renderTrade() {
    this._redraws.request(["trade", "main"]);
  }

  landItems(ids) {
    this._equipment.landItems(ids);
  }

  addFavorite(favorite) {
    return this._spells.addFavorite(favorite);
  }

  reorderFavorite(id, targetId, before) {
    return this._spells.reorderFavorite(id, targetId, before);
  }

  attuneWithLimit(item, rowNode) {
    return this._equipment.attuneWithLimit(item, rowNode);
  }

  itemFrom(node) {
    return this.actor.items.get(node?.closest("[data-item-id]")?.dataset.itemId);
  }

  async savePrefs(patch, tab = "equipment") {
    await game.settings.set(MODULE_ID, "listPrefs", withListPref(getSetting("listPrefs") ?? {}, tab, patch, TAB_FILTERS[tab]));
  }

  shake(node) {
    if (!node) return;
    node.classList.remove("is-refused");
    void node.offsetWidth;
    node.classList.add("is-refused");
    node.addEventListener("animationend", () => node.classList.remove("is-refused"), { once: true });
  }
}

export function openActorWindow(actor) {
  if (!isSupportedActor(actor) || !canViewActor(actor, game.user)) return null;
  const key = actor.uuid ?? actor.id;
  const open = liveWindow(key);
  if (open) {
    if (open.rendered) {
      open.bringToFront?.();
      open.maximize?.();
    }
    return open;
  }
  const app = new ActorWindow(actor);
  OPEN_WINDOWS.set(key, app);
  app.render({ force: true }).catch((error) => {
    if (OPEN_WINDOWS.get(key) === app) OPEN_WINDOWS.delete(key);
    LOG.error(`The window of ${actor.name} could not open`, error);
  });
  return app;
}

export function toggleActorWindow(actor) {
  const open = liveWindow(actor?.uuid ?? actor?.id);
  if (open?.minimized) {
    open.bringToFront?.();
    return open.maximize();
  }
  if (open) return open.rendered ? open.close() : open;
  return openActorWindow(actor);
}

/** The registered window, unless its first render failed or it closed without saying so. */
function liveWindow(key) {
  const open = OPEN_WINDOWS.get(key);
  if (open && !(open.state < 0)) return open;
  OPEN_WINDOWS.delete(key);
  return null;
}
