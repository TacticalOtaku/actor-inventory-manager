// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the window for a supported actor (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { canEditActor, isSupportedActor } from "../core/actor-scope.js";
import {
  ACCENTS,
  ALWAYS_TAB,
  DENSITIES,
  MOTION_LEVELS,
  RAIL_BLOCKS,
  SHEET_MENU_TABS,
  SHEET_TABS,
  THEMES,
  effectiveMotion,
  fallbackTab,
  layoutForWidth,
  motionCap,
  normalizeAccent,
  orbAction,
  resolveTheme,
  sheetMenuEntries,
  visibleTabs
} from "../core/actor-window.js";
import { countAttunedItems, getActorAttunementMax, isItemAttuned } from "../core/attunement.js";
import { LIST_FILTERS, applyCoinEntry, chargeChange, listPrefsFor, parseCoinEntry, withListPref } from "../core/inventory.js";
import { SPELL_FILTERS, pipTarget } from "../core/spellbook.js";
import { FEATURE_FILTERS, applyUsesEntry } from "../core/features.js";
import { reorderFavorites, tabForFavorite } from "../core/favorites.js";
import { parseHpEntry, previewHp, vitalState } from "../core/vitals.js";
import { readAbilities, readIdentity, readRail, toggleSpellPreparation } from "../integrations/dnd5e.js";
import { LOG } from "../foundry/logger.js";
import {
  EQUIPMENT_TEMPLATES,
  buildEquipmentContext,
  buildInspector,
  buildItemDetail,
  closeItemMenu,
  equipmentSnapshot,
  itemMenuEntries,
  openItemMenu,
  playEquipmentChanges
} from "./equipment.js";
import { buildDollContext, firstItemFor } from "./doll.js";
import { FEATURE_TEMPLATES, buildFeaturesContext, featureMode, hasFeatures } from "./features.js";
import { EFFECT_TEMPLATES, buildEffectsContext, createActorEffect, effectMenuEntries } from "./effects.js";
import { OVERVIEW_TEMPLATES, buildBiographyContext, buildOverviewContext, cardDialogs, hasOverview } from "./overview.js";
import { OfferDraft, buildTradeContext, isNewItem, offerButton, offerWithQuantity, sendTradeRequest } from "./trade.js";
import { TRADE_HOOK, sessionFor } from "../trade/service.js";
import { FLAGS } from "../constants.js";
import { bindTooltips, releaseTooltips } from "./tooltips.js";
import { buildFavoritesContext, favoriteIdFor, favoriteItemIds, hasFavorites } from "./favorites.js";
import { SPELL_TEMPLATES, buildSpellsContext, playSlotChanges, preparationWarning, slotSnapshot } from "./spells.js";
import { openPresetEditor } from "./preset-editor.js";
import { bindInventoryDrag } from "./inventory-drag.js";
import { equipItemToSlot, toggleAttunement, toggleItemEquipped, unequipItem, useItem } from "./item-actions.js";
import { setActorPaperdollTemplate } from "../core/paperdoll-templates.js";
import { WEIGHTY_CONTAINERS_MODULE_ID, openWeightyContainersDialog } from "../integrations/weighty-containers.js";
import { SETTLE, glide, glideFrom, measure } from "./motion.js";
import { readMotionCaps, schemeIsLight, stampTheme } from "./theme-root.js";
import { REST_HOOK, buildRailContext, openStatConfig, playLongRest, playRailChanges, railSnapshot, startRuneGlints } from "./rail.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/window`;

/** Open windows, keyed by actor UUID (a token actor gets its own window). */
const OPEN_WINDOWS = new Map();

/** Bursts of document hooks become one render. */
const RENDER_COALESCE_MS = 40;

/** The search fields and the window state each one filters. */
const SEARCH_FIELDS = { inventorySearch: "query", spellSearch: "spellQuery", featureSearch: "featureQuery" };

/** The filters each tab knows. */
const TAB_FILTERS = { equipment: LIST_FILTERS, spells: SPELL_FILTERS, features: FEATURE_FILTERS };

/** Width the collapse button shrinks the window to: the compact layout, rail only. */
const COLLAPSED_WIDTH = 320;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

function windowIdFor(actor) {
  return `${MODULE_ID}-window-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`;
}

const getSetting = (key) => game.settings.get(MODULE_ID, key);


const WindowBase = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

export class ActorWindow extends WindowBase {
  static DEFAULT_OPTIONS = {
    classes: ["aim-root", "aim-window"],
    tag: "section",
    position: { width: 1040, height: 720 },
    window: { icon: "fa-light fa-shirt", resizable: true, minimizable: true },
    actions: {
      switchTab: ActorWindow.#onSwitchTab,
      openSettings: ActorWindow.#onOpenSettings,
      closeSettings: ActorWindow.#onCloseSettings,
      setSetting: ActorWindow.#onSetSetting,
      askReset: ActorWindow.#onAskReset,
      cancelReset: ActorWindow.#onCancelReset,
      confirmReset: ActorWindow.#onConfirmReset,
      reloadPage: () => foundry.utils.debouncedReload(),
      collapseWindow: ActorWindow.#onCollapse,
      expandWindow: ActorWindow.#onExpand,
      toggleMenu: ActorWindow.#onToggleMenu,
      openSheet: ActorWindow.#onOpenSheet,
      openTraits: ActorWindow.#onOpenTraits,
      openBastion: ActorWindow.#onOpenBastion,
      revertForm: ActorWindow.#onRevertForm,
      openDocument: ActorWindow.#onOpenDocument,
      rollAbility: ActorWindow.#onRollAbility,
      levelOrb: ActorWindow.#onLevelOrb,
      editHp: ActorWindow.#onEditHp,
      stepHp: ActorWindow.#onStepHp,
      tempHp: ActorWindow.#onTempHp,
      rollHitDie: ActorWindow.#onRollHitDie,
      markDeath: ActorWindow.#onMarkDeath,
      rollDeathSave: ActorWindow.#onRollDeathSave,
      shortRest: ActorWindow.#onShortRest,
      longRest: ActorWindow.#onLongRest,
      rollInitiative: ActorWindow.#onRollInitiative,
      toggleEffect: ActorWindow.#onToggleEffect,
      removeCondition: ActorWindow.#onRemoveCondition,
      toggleCondition: ActorWindow.#onToggleCondition,
      createEffect: ActorWindow.#onCreateEffect,
      rollSkill: ActorWindow.#onRollSkill,
      rollSave: ActorWindow.#onRollSave,
      rollTool: ActorWindow.#onRollTool,
      cardConfig: ActorWindow.#onCardConfig,
      toggleTrade: ActorWindow.#onToggleTrade,
      tradeStart: ActorWindow.#onTradeStart,
      tradeConfirm: ActorWindow.#onTradeConfirm,
      tradeCancel: ActorWindow.#onTradeCancel,
      tradeQty: ActorWindow.#onTradeQty,
      tradeOffer: ActorWindow.#onTradeOffer,
      tradeRecover: ActorWindow.#onTradeRecover,
      tradeRecoverYes: ActorWindow.#onTradeRecoverYes,
      tradeRecoverNo: ActorWindow.#onTradeRecoverNo,
      tradeDismiss: ActorWindow.#onTradeDismiss,
      toggleInspiration: ActorWindow.#onToggleInspiration,
      exhaustion: ActorWindow.#onExhaustion,
      rollConcentration: ActorWindow.#onRollConcentration,
      endConcentration: ActorWindow.#onEndConcentration,
      listView: ActorWindow.#onListView,
      listFilter: ActorWindow.#onListFilter,
      toggleSection: ActorWindow.#onToggleSection,
      addItem: ActorWindow.#onAddItem,
      useItem: ActorWindow.#onUseItem,
      useActivity: ActorWindow.#onUseActivity,
      equipItem: ActorWindow.#onEquipItem,
      attuneItem: ActorWindow.#onAttuneItem,
      stepQty: ActorWindow.#onStepQty,
      spendCharge: ActorWindow.#onSpendCharge,
      itemMenu: ActorWindow.#onItemMenu,
      itemToChat: ActorWindow.#onItemToChat,
      manageCurrency: ActorWindow.#onManageCurrency,
      editCoin: ActorWindow.#onEditCoin,
      toggleTray: ActorWindow.#onToggleTray,
      foldAllTrays: ActorWindow.#onFoldAllTrays,
      containerRules: ActorWindow.#onContainerRules,
      toggleDoll: ActorWindow.#onToggleDoll,
      slotClick: ActorWindow.#onSlotClick,
      unequipSlot: ActorWindow.#onUnequipSlot,
      socketClick: ActorWindow.#onSocketClick,
      endAttunement: ActorWindow.#onEndAttunement,
      openPresetEditor: ActorWindow.#onOpenPresetEditor,
      castSpell: ActorWindow.#onCastSpell,
      prepareSpell: ActorWindow.#onPrepareSpell,
      slotPip: ActorWindow.#onSlotPip,
      usePip: ActorWindow.#onUsePip,
      useFeature: ActorWindow.#onUseFeature,
      editUses: ActorWindow.#onEditUses,
      rechargeItem: ActorWindow.#onRechargeItem,
      addFeature: ActorWindow.#onAddFeature,
      toggleFavorite: ActorWindow.#onToggleFavorite,
      favUse: ActorWindow.#onFavUse,
      favOpen: ActorWindow.#onFavOpen
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
    this.menuOpen = false;
    this.xpOpen = false;
    this.askReset = false;
    // useWebFonts takes effect after a reload; the toggle only marks the change.
    this.fontsAtLoad = Boolean(getSetting("useWebFonts"));
    this.expandedWidth = null;
    this.hpEditing = false;
    this.hpDraft = "";
    this._railPrev = null;
    // The equipment tab: search, folded sections, the selected entry, the coin being edited.
    this.query = "";
    this.spellQuery = "";
    this.featureQuery = "";
    this.usesEditing = null;
    this.usesDraft = "";
    // «where:uuid» of the effect row whose details are open.
    this.effectOpen = null;
    // The trade panel: open or not, the offer being edited, invitations seen and finished trades dismissed here.
    this.tradeOpen = false;
    this.tradeDraft = new OfferDraft(this);
    this.tradeSeen = new Set();
    this.tradeDismissed = new Set();
    this.tradeAskRestore = false;
    this.tradeError = null;
    this.selectedKey = null;
    this.collapsed = new Set();
    this.selected = null;
    this.coinEditing = null;
    this.coinDraft = "";
    this._hooks = [];
    this._renderTimer = null;
  }

  get canEdit() {
    return canEditActor(this.actor, game.user);
  }

  /* ─── Context ─── */

  async _prepareContext(options) {
    const live = foundry.utils.fromUuidSync(this.actorKey);
    if (live?.documentName === "Actor") this.actor = live;
    const actor = this.actor;
    const identity = this.#identity();
    const tabs = this.#tabs();
    this.tab = fallbackTab(this.tab, tabs.filter((tab) => !tab.hidden).map((tab) => tab.id));
    for (const tab of tabs) tab.active = tab.id === this.tab;
    const selected = this.selected ? actor.items.get(this.selected) : null;
    if (!selected) this.selected = this.selectedKey = null;
    const detail = selected ? await buildItemDetail(selected, { canEdit: this.canEdit }) : null;
    const favIds = favoriteItemIds(actor);
    const trade = buildTradeContext(actor, { canEdit: this.canEdit, open: this.tradeOpen, draft: this.tradeDraft,
      askRestore: this.tradeAskRestore, dismissed: this.tradeDismissed, seen: this.tradeSeen, error: this.tradeError });
    if (!trade.button) this.tradeOpen = false;
    return {
      trade,
      tradeLock: ["executing", "recovery"].includes(sessionFor(actor.id)?.status),
      offerRows: Object.fromEntries(actor.items.map((item) => [item.id, offerButton(trade, item)]).filter(([, state]) => state)),
      newItems: Object.fromEntries(actor.items.filter(isNewItem).map((item) => [item.id, true])),
      ...(await super._prepareContext(options)),
      actor,
      canEdit: this.canEdit,
      identity,
      abilities: readAbilities(actor).map((a) => ({ ...a, modText: signed(a.mod), saveText: signed(a.save) })),
      abilityHint: t("AIM.window.abilityHint"),
      tabs,
      pendingText: t("AIM.window.panelPending"),
      menuOpen: this.menuOpen,
      xpOpen: this.xpOpen,
      menu: Object.fromEntries(sheetMenuEntries({
        type: actor.type,
        // dnd5e shows the bastion tab only when bastions are on and the character has reached the threshold level.
        bastion: Boolean(dnd5e.applications.actor.CharacterActorSheet?.hasBastion?.(actor)),
        polymorphed: Boolean(actor.isPolymorphed)
      }).map((entry) => [entry, true])),
      askReset: this.askReset,
      settings: this.#settingsContext(),
      hpEditing: this.hpEditing,
      hpDraft: this.hpDraft,
      inv: await buildEquipmentContext(actor, {
        prefs: getSetting("listPrefs"),
        query: this.query,
        collapsed: this.collapsed,
        selected: this.selected,
        detail,
        coinEditing: this.coinEditing,
        coinDraft: this.coinDraft,
        favIds,
        canEdit: this.canEdit,
        folds: getSetting("trayFolds") ?? {}
      }),
      inspector: selected ? buildInspector(selected, detail) : null,
      spells: this.#hasSpells() ? buildSpellsContext(actor, {
        prefs: getSetting("listPrefs"),
        query: this.spellQuery,
        selectedKey: this.selectedKey,
        detail,
        favIds,
        canEdit: this.canEdit,
        collapsed: this.collapsed
      }) : null,
      prepWarning: preparationWarning(actor),
      favorites: await buildFavoritesContext(actor, { canEdit: this.canEdit }),
      canFavorite: hasFavorites(actor) && this.canEdit,
      features: buildFeaturesContext(actor, {
        prefs: getSetting("listPrefs"),
        query: this.featureQuery,
        selectedKey: this.selectedKey,
        detail,
        favIds,
        canEdit: this.canEdit,
        collapsed: this.collapsed,
        usesEditing: this.usesEditing,
        usesDraft: this.usesDraft
      }),
      effects: await buildEffectsContext(actor, { open: this.effectOpen, canFavorite: hasFavorites(actor) && this.canEdit }),
      overview: hasOverview(actor) ? buildOverviewContext(actor, { canFavorite: hasFavorites(actor) && this.canEdit }) : null,
      bio: await buildBiographyContext(actor),
      doll: buildDollContext(actor, { canEdit: this.canEdit, selected: this.selected, hidden: Boolean(getSetting("dollHidden")) }),
      ...buildRailContext(actor, { canEdit: this.canEdit, hasSpells: this.#hasSpells(), hiddenBlocks: getSetting("hiddenRailBlocks") ?? [] })
    };
  }

  #identity() {
    const id = readIdentity(this.actor);
    const links = [];
    for (const cls of id.classes) {
      links.push({ id: cls.id, label: `${cls.name} ${cls.levels}` });
      if (cls.subclass) links.push({ id: cls.subclass.id, label: cls.subclass.name });
    }
    if (id.species) links.push({ id: id.species.id, label: id.species.name });
    if (id.background) links.push({ id: id.background.id, label: id.background.name });
    const span = Math.max(1, id.xp.max - id.xp.min);
    const share = Math.min(1, Math.max(0, (id.xp.value - id.xp.min) / span));
    return {
      ...id,
      links,
      hasLevel: this.actor.type === "character",
      nextLevel: id.level + 1,
      xpShare: id.xp.ready ? 1 : share.toFixed(3),
      orbLabel: id.xp.ready ? t("AIM.window.xp.ready", { level: id.level + 1 }) : t("AIM.window.xp.orb", { value: id.xp.value, max: id.xp.max }),
      summary: links.slice(0, 2).map((l) => l.label).join(" · ")
    };
  }

  #tabs() {
    const hidden = getSetting("hiddenTabs") ?? [];
    const missing = this.#hasSpells() ? [] : ["spells"];
    // A vehicle shows «Действия» only when it has any (siege weapons, vehicle features).
    if (this.actor.type === "vehicle" && !hasFeatures(this.actor)) missing.push("features");
    if (!hasOverview(this.actor)) missing.push("overview");
    const shown = visibleTabs({ hidden, missing });
    const label = (id) => t(id === "features" && featureMode(this.actor) === "action" ? "AIM.window.tabs.actions" : `AIM.window.tabs.${id}`);
    return SHEET_TABS.map((id) => ({ id, label: label(id), hidden: !shown.includes(id) }));
  }

  #hasSpells() {
    return this.actor.items.some((item) => item.type === "spell");
  }

  #settingsContext() {
    const theme = getSetting("windowTheme");
    const accent = normalizeAccent(getSetting("windowAccent"));
    const density = getSetting("windowDensity");
    const caps = readMotionCaps();
    const chosen = getSetting("motionLevel");
    const level = effectiveMotion(chosen, caps);
    const cap = motionCap(caps);
    const capped = level !== chosen;
    const capReason = caps.reducedMotion ? t("AIM.window.settings.capReduced") : caps.performanceLow ? t("AIM.window.settings.capPerformance") : "";
    const hiddenBlocks = getSetting("hiddenRailBlocks") ?? [];
    const hiddenTabs = getSetting("hiddenTabs") ?? [];
    const hasSpells = this.#hasSpells();
    return {
      themes: THEMES.map((id) => ({ id, label: t(`AIM.window.settings.themes.${id}`), active: id === theme })),
      themeHint: theme === "auto" ? t("AIM.window.settings.themeNow", { theme: t(`AIM.window.settings.themes.${resolveTheme("auto", schemeIsLight())}`) }) : "",
      accents: ACCENTS.map((id) => ({ id, label: t(`AIM.window.settings.accents.${id}`), active: id === accent })),
      densities: DENSITIES.map((id) => ({ id, label: t(`AIM.window.settings.densities.${id}`), active: id === density })),
      motions: [...MOTION_LEVELS].reverse().map((id) => ({
        id,
        label: t(`AIM.window.settings.motions.${id}`),
        active: id === level,
        disabled: MOTION_LEVELS.indexOf(id) > MOTION_LEVELS.indexOf(cap)
      })),
      motionHint: capped
        ? `${capReason} ${t("AIM.window.settings.capKeeps", { level: t(`AIM.window.settings.motions.${chosen}`) })}`
        : `${capReason ? `${capReason} ` : ""}${t(`AIM.window.settings.motionAbout.${level}`)}`,
      webFonts: Boolean(getSetting("useWebFonts")),
      fontsPending: Boolean(getSetting("useWebFonts")) !== this.fontsAtLoad,
      absentText: t("AIM.window.settings.absent"),
      railBlocks: RAIL_BLOCKS.map(({ id, needs }) => {
        const absent = needs === "magic" && !hasSpells;
        return { id, label: t(`AIM.window.rail.${id}`), shown: !absent && !hiddenBlocks.includes(id), absent };
      }),
      tabs: SHEET_TABS.map((id) => {
        const locked = id === ALWAYS_TAB || (id === "spells" && !hasSpells);
        const note = id === ALWAYS_TAB ? t("AIM.window.settings.always") : locked ? t("AIM.window.settings.absent") : "";
        return { id, label: t(`AIM.window.tabs.${id}`), shown: id === ALWAYS_TAB || (!locked && !hiddenTabs.includes(id)), locked, note };
      })
    };
  }

  /* ─── Rendering ─── */

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    OPEN_WINDOWS.set(this.actorKey, this);
    const rerender = () => this.#queueRender();
    // An item's own effect is the actor's grandchild.
    const mine = (doc) => [doc, doc?.parent, doc?.parent?.parent].some((d) => d?.uuid === this.actorKey);
    this.#hook("updateActor", (actor) => mine(actor) && rerender());
    // A transformed actor is deleted when it reverts; its window goes with it.
    this.#hook("deleteActor", (actor) => actor?.uuid === this.actorKey && this.close());
    for (const name of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      this.#hook(name, (doc) => mine(doc) && rerender());
    }
    this.#hook(REFRESH_HOOK, rerender);
    this.#hook(TRADE_HOOK, rerender);
    // Weighty Containers announces a rules change on its own hook; the trays' bands and reductions follow.
    this.#hook(`${WEIGHTY_CONTAINERS_MODULE_ID}.updateContainerRules`, rerender);
    // Placing a spell template minimises the window; it comes back once the template is placed or cancelled.
    this.#hook("dnd5e.createActivityTemplate", (activity) => activity?.actor?.uuid === this.actorKey && this.#awaitTemplate());
    this.#hook(REST_HOOK, (actor, result, config) => actor?.uuid === this.actorKey && config?.type === "long" && playLongRest(this.element));
    // Looping effects run only in the actor window in front.
    this.element.addEventListener("pointerdown", () => this.#bringFront(), { capture: true });
    this.#bringFront();
    this._glints = startRuneGlints(this);
    // The window follows Foundry's colour scheme for «Авто» and its performance mode for the motion cap.
    this._bodyObserver = new MutationObserver(() => {
      this.#applyRootState();
      if (this.element?.classList.contains("is-settings")) this.render({ parts: ["drawer"] });
    });
    this._bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    this._reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._onReducedMotion = () => this.render({ parts: ["drawer"] }).then(() => this.#applyRootState());
    this._reducedMotion?.addEventListener("change", this._onReducedMotion);
    this._resizeObserver = new ResizeObserver(() => this.#applyLayout());
    this._resizeObserver.observe(this.element);
    this.element.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.element.addEventListener("change", (event) => this.#onChange(event));
    this.#bindEquipment();
    bindTooltips(this);
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    // A number field of the trade panel keeps the focus and the caret across the redraw its own send causes.
    const field = this.element?.contains(document.activeElement) ? document.activeElement : null;
    const key = field?.dataset?.offerQty ?? field?.dataset?.tradeCoin;
    this._tradeFocus = key ? { attr: field.dataset.offerQty ? "data-offer-qty" : "data-trade-coin", key } : null;
    this._equipmentPrev = this.element ? equipmentSnapshot(this.element) : null;
    this._slotsPrev = this.element ? slotSnapshot(this.element) : null;
    this._prepOver = Boolean(this.element?.querySelector("[data-prep-counter].is-over"));
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Right click on the ready orb still opens the experience card.
    this.element.querySelector(".aim-level")?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.xpOpen = !this.xpOpen;
      this.render({ parts: ["main"] });
    });
    this.#applyRootState();
    this.#applyLayout({ animate: false });
    this.#moveInk();
    this.#bindRail();
    const next = railSnapshot(this.actor);
    playRailChanges(this.element, this._railPrev, next);
    this._railPrev = next;
    this.#afterEquipmentRender();
    // A reset of the confirmations (an offer changed) shakes the status once.
    const session = sessionFor(this.actor.id);
    const confirmed = Boolean(session?.confirmed.some(Boolean));
    if (this._tradePrev?.id === session?.id && this._tradePrev?.confirmed && !confirmed && session?.status === "open") {
      this.#shake(this.element.querySelector("[data-trade-status]"));
    }
    this._tradePrev = session ? { id: session.id, confirmed } : null;
    if (this._tradeFocus) {
      const field = this.element.querySelector(`[${this._tradeFocus.attr}="${CSS.escape(this._tradeFocus.key)}"]`);
      field?.focus();
      this._tradeFocus = null;
    }
  }

  #bringFront() {
    for (const app of OPEN_WINDOWS.values()) app.element?.classList.toggle("is-front", app === this);
  }

  /** Listeners the rail needs beyond click actions: the HP field, right clicks. */
  #bindRail() {
    const el = this.element;
    const input = el.querySelector("[data-hp-input]");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      this.#previewHp(input);
      input.addEventListener("input", () => this.#previewHp(input));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") { event.preventDefault(); this.#applyHp(input.value); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.#cancelHp(); }
      });
      input.addEventListener("blur", () => this.hpEditing && this.#cancelHp());
    }
    el.querySelector('[data-action="editHp"]')?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.canEdit) this.#openHpField("в");
    });
    el.querySelector("[data-exhaustion]")?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      if (this.canEdit) this.#setExhaustion(-1);
    });
    for (const stat of el.querySelectorAll("[data-config]")) {
      stat.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (this.canEdit) openStatConfig(this.actor, stat.dataset.config);
      });
    }
  }

  #openHpField(draft = "") {
    this.hpEditing = true;
    this.hpDraft = draft;
    this.render({ parts: ["rail"] });
  }

  #cancelHp() {
    this.hpEditing = false;
    this.hpDraft = "";
    this.render({ parts: ["rail"] });
  }

  /** While typing, the result is drawn on the bar: red for damage (after temporary HP), green for healing. */
  #previewHp(input) {
    this.hpDraft = input.value;
    const band = this.element.querySelector("[data-hp-preview]");
    const entry = parseHpEntry(input.value);
    input.classList.toggle("is-invalid", Boolean(input.value.trim()) && !entry);
    if (!band) return;
    const hp = readRail(this.actor).hp;
    if (!entry || !hp.max) { band.hidden = true; return; }
    const after = previewHp(hp, entry);
    const from = Math.min(hp.value, after.value) / hp.max;
    const to = Math.max(hp.value, after.value) / hp.max;
    band.hidden = from === to;
    band.classList.toggle("is-heal", after.value > hp.value);
    band.style.left = `${from * 100}%`;
    band.style.width = `${(to - from) * 100}%`;
  }

  async #applyHp(text) {
    const entry = parseHpEntry(text);
    if (!entry) return this.element.querySelector("[data-hp-input]")?.classList.add("is-invalid");
    this.hpEditing = false;
    this.hpDraft = "";
    await this.#changeHp(entry);
    this.render({ parts: ["rail"] });
  }

  /** Damage and healing go through applyDamage (so preApplyDamage listeners run), temporary HP through applyTempHP. */
  async #changeHp({ kind, amount }) {
    if (!this.canEdit) return;
    if (kind === "damage") return this.actor.applyDamage(amount);
    if (kind === "heal") return this.actor.applyDamage(-amount);
    if (kind === "temp") return this.actor.applyTempHP(amount);
    return this.actor.update({ "system.attributes.hp.value": Math.max(0, Math.min(readRail(this.actor).hp.max, amount)) });
  }

  async #setExhaustion(delta) {
    const { value, max } = readRail(this.actor).exhaustion;
    const next = Math.max(0, Math.min(max, value + delta));
    if (next !== value) await this.actor.update({ "system.attributes.exhaustion": next });
  }

  _onClose(options) {
    this.tradeDraft.close();
    releaseTooltips(this);
    for (const [name, id] of this._hooks) Hooks.off(name, id);
    this._hooks = [];
    this._bodyObserver?.disconnect();
    this._resizeObserver?.disconnect();
    this._reducedMotion?.removeEventListener("change", this._onReducedMotion);
    clearTimeout(this._renderTimer);
    clearTimeout(this._searchTimer);
    clearInterval(this._templateWatch);
    clearTimeout(this._castSchoolTimer);
    clearInterval(this._glints);
    OPEN_WINDOWS.delete(this.actorKey);
    super._onClose(options);
  }

  #hook(name, fn) {
    this._hooks.push([name, Hooks.on(name, fn)]);
  }

  #queueRender() {
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      if (!this.rendered) return;
      // A biography field being typed in, or the open editor, would be redrawn away: the main part waits for it.
      if (!this.#editingBio()) return this.render();
      this._mainStale = true;
      this.render({ parts: ["rail", "inspector", "drawer"] });
    }, RENDER_COALESCE_MS);
  }

  #editingBio() {
    const el = this.element;
    return Boolean(el?.querySelector("[data-bio-editor][open]") || document.activeElement?.closest?.("[data-bio-field]") && el.contains(document.activeElement));
  }

  /** After a biography edit ends, the main part catches up with what changed meanwhile. */
  #catchUpBio() {
    setTimeout(() => {
      if (!this._mainStale || this.#editingBio()) return;
      this._mainStale = false;
      this.render({ parts: ["main"] });
    });
  }

  /** Theme, accent, density, motion and role sit on the window root as data attributes. */
  #applyRootState() {
    const el = this.element;
    if (!el) return;
    stampTheme(el, { fonts: this.fontsAtLoad });
    el.dataset.role = this.canEdit ? (game.user.isGM ? "gm" : "owner") : "observer";
    el.classList.toggle("is-trading", this.tradeOpen);
    el.dataset.actorType = this.actor.type;
    const { hp } = readRail(this.actor);
    el.dataset.vital = vitalState(hp.value, hp.max);
  }

  get motionOn() {
    return this.element?.dataset.motion !== "off";
  }

  /** Every block glides to its new place when the width crosses a layout boundary. */
  #applyLayout({ animate = true } = {}) {
    const el = this.element;
    if (!el) return;
    const next = layoutForWidth(el.offsetWidth);
    if (el.dataset.layout === next) return;
    // A tooltip over a block that the new layout hides would otherwise stay on screen.
    game.tooltip?.deactivate?.();
    const change = () => { el.dataset.layout = next; };
    if (!animate || !el.dataset.layout || !this.motionOn) change();
    else glide(el, "[data-flip]", change);
    requestAnimationFrame(() => this.#moveInk());
  }

  #moveInk() {
    const tab = this.element?.querySelector(`.aim-tab[data-tab="${this.tab}"]`);
    const ink = this.element?.querySelector(".aim-tab-ink");
    if (!tab || !ink) return;
    ink.style.width = `${tab.offsetWidth}px`;
    ink.style.transform = `translateX(${tab.offsetLeft}px)`;
  }

  #onKeydown(event) {
    if (this.#onEquipmentKey(event)) return;
    if (event.key !== "Escape") return;
    if (closeItemMenu(this.element)) {
      event.stopPropagation();
    } else if (this.element.classList.contains("is-settings")) {
      event.stopPropagation();
      this.element.classList.remove("is-settings");
    } else if (this.menuOpen || this.xpOpen) {
      event.stopPropagation();
      this.menuOpen = this.xpOpen = false;
      this.render({ parts: ["main"] });
    }
  }

  async #onChange(event) {
    const input = event.target;
    if (input.dataset.settingToggle) return this.#setAndRefresh(input.dataset.settingToggle, input.checked);
    if (input.dataset.railToggle) return this.#toggleListed("hiddenRailBlocks", input.dataset.railToggle, !input.checked);
    if (input.dataset.tabToggle) return this.#toggleListed("hiddenTabs", input.dataset.tabToggle, !input.checked);
    if (input.name === "dollPreset" && input.value && game.user.isGM) return setActorPaperdollTemplate(this.actor, input.value);
    if (input.name === "inventorySort") return this.#savePrefs({ sort: input.value }).then(() => this.render({ parts: ["main"] }));
    // dnd5e's own fields, so the vanilla sheet shows the same; the editor saves its HTML on «Save».
    if (input.matches?.("[data-bio-field], [data-bio-editor]")) {
      if (this.canEdit) await this.actor.update({ [input.name]: input.value });
      return;
    }
    if (input.dataset.effectToggle) {
      const item = this.#itemFrom(input);
      if (this.canEdit) return item?.effects.get(input.dataset.effectToggle)?.update({ disabled: !input.checked });
    }
    if (input.name === "xp" && input.closest("[data-xp-form]")) {
      const add = Number(input.value);
      if (!this.canEdit || !Number.isFinite(add) || !add) return;
      await this.actor.update({ "system.details.xp.value": Math.max(0, readIdentity(this.actor).xp.value + Math.trunc(add)) });
    }
  }

  async #setAndRefresh(key, value) {
    await game.settings.set(MODULE_ID, key, value);
    // The settings' onChange redraws every window; the drawer of this one refreshes too.
    await this.render({ parts: ["drawer"] });
  }

  async #toggleListed(key, id, hide) {
    const list = new Set(getSetting(key) ?? []);
    if (hide) list.add(id); else list.delete(id);
    await this.#setAndRefresh(key, [...list]);
  }

  /* ─── Actions ─── */

  static #onSwitchTab(event, target) {
    this.#switchTo(target.dataset.tab);
  }

  #switchTo(tab) {
    if (!tab || tab === this.tab) return;
    this.tab = tab;
    for (const button of this.element.querySelectorAll(".aim-tab")) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    for (const panel of this.element.querySelectorAll(".aim-panel")) {
      const on = panel.dataset.panel === tab;
      panel.hidden = !on;
      if (on && this.motionOn) panel.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
    this.#moveInk();
  }

  static #onOpenSettings() {
    this.menuOpen = false;
    this.element.classList.add("is-settings");
  }

  static #onCloseSettings() {
    this.element.classList.remove("is-settings");
    this.askReset = false;
  }

  static async #onSetSetting(event, target) {
    const { key, value } = target.dataset;
    if (!key || target.disabled) return;
    if (key === "windowTheme" && document.startViewTransition && this.motionOn) {
      await game.settings.set(MODULE_ID, key, value);
      document.startViewTransition(() => this.#applyRootState());
      return this.render({ parts: ["drawer"] });
    }
    await this.#setAndRefresh(key, value);
  }

  static #onAskReset() {
    this.askReset = true;
    this.render({ parts: ["drawer"] });
  }

  static #onCancelReset() {
    this.askReset = false;
    this.render({ parts: ["drawer"] });
  }

  static async #onConfirmReset() {
    this.askReset = false;
    const defaults = { windowTheme: "night", windowAccent: "brass", windowDensity: "comfortable", motionLevel: "full", useWebFonts: true, hiddenRailBlocks: [], hiddenTabs: [] };
    for (const [key, value] of Object.entries(defaults)) await game.settings.set(MODULE_ID, key, value);
    await this.render({ parts: ["drawer"] });
  }

  static #onCollapse() {
    this.expandedWidth = Math.max(this.position.width, 1040);
    this.setPosition({ width: COLLAPSED_WIDTH });
  }

  static #onExpand() {
    this.setPosition({ width: this.expandedWidth ?? 1040 });
  }

  static #onToggleMenu() {
    this.menuOpen = !this.menuOpen;
    this.render({ parts: ["main"] });
  }

  static #onOpenSheet() {
    this.menuOpen = false;
    this.actor.sheet.render({ force: true });
    this.render({ parts: ["main"] });
  }

  static #onOpenTraits() {
    return this.#openSheetTab(SHEET_MENU_TABS.traits);
  }

  static #onOpenBastion() {
    return this.#openSheetTab(SHEET_MENU_TABS.bastion);
  }

  /** dnd5e 5.3.3 has no standalone dialog for special traits or the bastion: the actor's sheet opens on that tab. */
  async #openSheetTab(tab) {
    this.menuOpen = false;
    this.render({ parts: ["main"] });
    const sheet = this.actor.sheet;
    await sheet.render({ force: true });
    // Another sheet (Tidy or a third-party one) may not have that tab; then it simply opens.
    if (sheet.constructor.TABS?.some?.((entry) => entry.tab === tab)) sheet.changeTab(tab, "primary");
  }

  static async #onRevertForm() {
    this.menuOpen = false;
    await this.actor.revertOriginalForm?.();
  }

  static #onOpenDocument(event, target) {
    this.actor.items.get(target.dataset.id)?.sheet?.render({ force: true });
  }

  static #onRollAbility(event, target) {
    if (!this.canEdit) return;
    const ability = target.dataset.ability;
    if (event.shiftKey) this.actor.rollSavingThrow({ ability, event });
    else this.actor.rollAbilityCheck({ ability, event });
  }

  /** The ready orb levels up through dnd5e; otherwise it opens the experience card. */
  static async #onLevelOrb(event) {
    const { xp, classes } = readIdentity(this.actor);
    const action = orbAction({ ready: xp.ready, canEdit: this.canEdit, shift: event.shiftKey, classCount: classes.length });
    if (action === "card") {
      this.xpOpen = !this.xpOpen;
      return this.render({ parts: ["main"] });
    }
    const classId = action === "level" ? classes[0].id : await chooseClass(classes);
    if (!classId) return;
    const cls = this.actor.items.get(classId);
    try {
      const manager = dnd5e.applications.advancement.AdvancementManager.forLevelChange(this.actor, classId, 1);
      if (manager.steps.length) manager.render({ force: true });
      else await cls.update({ "system.levels": cls.system.levels + 1 });
    } catch (error) {
      LOG.error("Level up failed", error);
    }
  }

  /* ─── Rail actions ─── */

  static #onEditHp() {
    if (this.canEdit) this.#openHpField("");
  }

  static #onStepHp(event, target) {
    const step = Number(target.dataset.step);
    if (!game.user.isGM || !step) return;
    return this.#changeHp(step < 0 ? { kind: "damage", amount: -step } : { kind: "heal", amount: step });
  }

  // The GM enters the amount; temporary HP never stack, the higher value stays.
  static #onTempHp() {
    if (game.user.isGM) this.#openHpField("в");
  }

  static async #onRollHitDie(event, target) {
    if (!this.canEdit) return;
    if (!readRail(this.actor).hitDice.value) {
      target.closest("[data-block]")?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 300 });
      return;
    }
    await this.actor.rollHitDie();
  }

  /** Click the n-th mark to set that many; click the last set mark to remove it. */
  static async #onMarkDeath(event, target) {
    if (!this.canEdit) return;
    const kind = target.dataset.kind;
    const current = readRail(this.actor).death[kind];
    const index = Number(target.dataset.index) + 1;
    await this.actor.update({ [`system.attributes.death.${kind}`]: index === current ? index - 1 : index });
  }

  static #onRollDeathSave(event) {
    if (this.canEdit) return this.actor.rollDeathSave({ event });
  }

  static #onShortRest() {
    if (this.canEdit) return this.actor.shortRest();
  }

  static #onLongRest() {
    if (this.canEdit) return this.actor.longRest();
  }

  static #onRollInitiative() {
    if (this.canEdit) return this.actor.rollInitiativeDialog();
  }


  static #onToggleInspiration() {
    if (this.canEdit) return this.actor.update({ "system.attributes.inspiration": !readRail(this.actor).inspiration });
  }

  static #onExhaustion() {
    if (this.canEdit) return this.#setExhaustion(1);
  }

  static #onRollConcentration(event) {
    if (this.canEdit) return this.actor.rollConcentration({ event });
  }

  /** The chip ends every concentration; the × on a concentration effect row ends that one. */
  static async #onEndConcentration(event, target) {
    if (!this.canEdit) return;
    const effect = await this.#effectFrom(target);
    this.#measureEffects();
    return this.actor.endConcentration(effect ?? undefined);
  }

  /* ─── Trade ─── */

  /** Redraws the panel and the rows whose offer buttons follow the draft. */
  renderTrade() {
    if (this.rendered) this.render({ parts: ["trade", "main"] });
  }

  #tradeSession() {
    return sessionFor(this.actor.id);
  }

  /** Opens beside the inventory, without a scrim; opening clears the invitation dot. */
  static #onToggleTrade() {
    this.tradeOpen = !this.tradeOpen;
    const session = this.#tradeSession();
    if (this.tradeOpen && session) this.tradeSeen.add(session.id);
    if (this.tradeOpen) this.#switchTo("equipment");
    this.#applyRootState();
    this.render({ parts: ["trade", "main"] });
  }

  async #tradeRequest(action, data = {}) {
    this.tradeError = await sendTradeRequest(this.actor, action, data);
    this.renderTrade();
    return !this.tradeError;
  }

  static #onTradeStart() {
    const select = this.element.querySelector("[data-trade-partner]");
    const option = select?.selectedOptions?.[0];
    if (!option || option.disabled || game.user.isGM) return;
    return this.#tradeRequest("start", { targetId: option.value, targetUserId: option.dataset.user });
  }

  /** Toggles this side's confirmation; confirming is accepting, the coordinator moves the assets once both did. */
  static #onTradeConfirm() {
    const session = this.#tradeSession();
    if (!session || this.tradeDraft.pending) return;
    const side = session.actors.indexOf(this.actor.id);
    if (session.confirmed[side]) return this.#tradeRequest("unconfirm", { sessionId: session.id });
    return this.#tradeRequest("confirm", { sessionId: session.id, revision: session.revision });
  }

  /** Nothing has moved yet, so both sides leave at once without a dialog. */
  static #onTradeCancel() {
    const session = this.#tradeSession();
    if (session) return this.#tradeRequest("cancel", { sessionId: session.id });
  }

  static #onTradeQty(event, target) {
    const id = target.dataset.id;
    const current = this.tradeDraft.offer.items.find((e) => e.id === id)?.quantity ?? 0;
    this.offerItem(this.actor.items.get(id), current + Number(target.dataset.step), { absolute: true });
  }

  /** The row's button offers one more of the item; the tile flies into the panel. */
  static #onTradeOffer(event, target) {
    const item = this.#itemFrom(target);
    if (!item) return;
    if (!this.tradeOpen) { this.tradeOpen = true; this.#applyRootState(); }
    this.#flyToOffer(target.closest("[data-item-id]")?.querySelector(".aim-tile"), item.img);
    return this.offerItem(item, 1);
  }

  /** Adds to the offer (a dropped row brings its whole stack) or sets the quantity, within the stack. */
  offerItem(item, quantity, { absolute = false } = {}) {
    const session = this.#tradeSession();
    if (!item || !session || session.status !== "open" || game.user.isGM || !this.canEdit) return;
    // The draft follows this trade before it changes, or the first redraw after a start would drop the edit.
    this.tradeDraft.sync(session, session.actors.indexOf(this.actor.id));
    const draft = this.tradeDraft.offer;
    const current = draft.items.find((e) => e.id === item.id)?.quantity ?? 0;
    const max = Number(item.system?.quantity ?? 1);
    this.tradeDraft.change(offerWithQuantity(draft, item.id, absolute ? quantity : current + quantity, max));
    this.renderTrade();
  }

  #onOfferInput(input) {
    const session = this.#tradeSession();
    if (!session || session.status !== "open" || game.user.isGM) return;
    this.tradeDraft.sync(session, session.actors.indexOf(this.actor.id));
    const draft = this.tradeDraft.offer;
    if (input.dataset.offerQty) {
      // A field cleared to type a new number is not yet a 0 that takes the item out.
      if (input.value === "") return;
      const item = this.actor.items.get(input.dataset.offerQty);
      this.tradeDraft.change(offerWithQuantity(draft, item.id, input.value, Number(item.system?.quantity ?? 1)));
      return this.render({ parts: ["trade"] });
    }
    // dnd5e coins are capped by the purse; Item Piles decides by value whether the purse covers the sum.
    const max = input.max === "" ? Infinity : Number(input.max);
    const value = Math.max(0, Math.min(max, Math.floor(Number(input.value) || 0)));
    if (String(value) !== input.value && input.value !== "") input.value = value;
    const money = { ...draft.money, [input.dataset.tradeCoin]: value };
    if (!value) delete money[input.dataset.tradeCoin];
    this.tradeDraft.change({ ...draft, money });
    // The panel follows the typing (status, the Item Piles sum); the field keeps its focus across the redraw.
    this.render({ parts: ["trade"] });
  }

  #flyToOffer(from, img) {
    const to = this.element.querySelector("[data-offer-drop]");
    if (!from || !to || !this.motionOn) return;
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ghost = Object.assign(document.createElement("img"), { src: img, className: "aim-flight" });
    Object.assign(ghost.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.append(ghost);
    ghost.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${b.left + 24 - a.left}px, ${b.top + 40 - a.top}px) scale(0.7)`, opacity: 0.2 }],
      { duration: 480, easing: SETTLE }).finished.finally(() => ghost.remove());
  }

  /** GM only: restoring (or unlocking) asks first. */
  static #onTradeRecover() {
    this.tradeAskRestore = true;
    this.render({ parts: ["trade"] });
  }

  static #onTradeRecoverNo() {
    this.tradeAskRestore = false;
    this.render({ parts: ["trade"] });
  }

  static async #onTradeRecoverYes() {
    const session = this.#tradeSession();
    this.tradeAskRestore = false;
    if (session && game.user.isGM) await this.#tradeRequest("recover", { sessionId: session.id });
  }

  static #onTradeDismiss() {
    const last = foundry.utils.deepClone(this.#lastFinishedTrade());
    if (last) this.tradeDismissed.add(last.id);
    this.tradeError = null;
    this.render({ parts: ["trade", "main"] });
  }

  #lastFinishedTrade() {
    return game.settings.get(MODULE_ID, "tradeState")?.sessions?.filter((s) => s.actors.includes(this.actor.id)).at(-1) ?? null;
  }

  /* ─── Overview ─── */

  static #onRollSkill(event, target) {
    if (this.canEdit) return this.actor.rollSkill({ skill: target.dataset.key, event });
  }

  static #onRollSave(event, target) {
    if (this.canEdit) return this.actor.rollSavingThrow({ ability: target.dataset.key, event });
  }

  static #onRollTool(event, target) {
    if (this.canEdit) return this.actor.rollToolCheck({ tool: target.dataset.key, event });
  }

  /** The card's gear: its one dnd5e dialog, or a menu when the card has several. */
  static #onCardConfig(event, target) {
    if (!this.canEdit) return;
    const dialogs = cardDialogs(this.actor, target.dataset.card);
    if (dialogs.length === 1) return dialogs[0].open();
    openItemMenu(this.element, target, dialogs.map((d) => ({ name: d.label, icon: '<i class="fa-light fa-gear"></i>', callback: d.open })), target);
  }

  /* ─── Effects ─── */

  async #effectFrom(node) {
    const uuid = node?.closest("[data-effect-uuid]")?.dataset.effectUuid;
    return uuid ? fromUuid(uuid) : null;
  }

  /** Before an effect change: rows glide to their new places and the focused control keeps the focus. */
  #measureEffects() {
    this._effectGlide = measure(this.element, ".aim-effwrap, .aim-eff-cat");
    const focused = document.activeElement;
    const wrap = this.element.contains(focused) ? focused.closest("[data-effect-uuid]") : null;
    this._effectFocus = wrap ? { key: wrap.dataset.key, action: focused.dataset.action ?? null } : null;
  }

  /** The switch: effect.update({ disabled }); a suppressed effect stays locked until its item is equipped and attuned. */
  static async #onToggleEffect(event, target) {
    const effect = await this.#effectFrom(target);
    if (!effect || !this.canEdit) return;
    if (effect.isSuppressed) return this.#shake(target.closest("[data-effect-row]"));
    this.#measureEffects();
    await effect.update({ disabled: !effect.disabled });
  }

  /** The × on a condition and a lit cell of the grid: actor.toggleStatusEffect, which also clears its exclusive group. */
  static #onRemoveCondition(event, target) {
    if (!this.canEdit) return;
    this.#measureEffects();
    return this.actor.toggleStatusEffect(target.dataset.status, { active: false });
  }

  static #onToggleCondition(event, target) {
    if (!this.canEdit) return;
    this.#measureEffects();
    return this.actor.toggleStatusEffect(target.dataset.status);
  }

  static #onCreateEffect() {
    if (this.canEdit) return createActorEffect(this.actor);
  }

  /** A click on the row opens its description and changes under it; again closes them. */
  #toggleEffectOpen(row) {
    const key = `${row.dataset.where}:${row.closest("[data-effect-uuid]").dataset.effectUuid}`;
    this.effectOpen = this.effectOpen === key ? null : key;
    this.#measureEffects();
    return this.render({ parts: ["rail", "main"] });
  }

  async #openEffectMenu(row, event) {
    const effect = await this.#effectFrom(row);
    if (!effect) return;
    const wrap = row.closest("[data-effect-uuid]");
    const entries = effectMenuEntries(this.actor, effect, { concentration: row.classList.contains("is-concentration") });
    openItemMenu(this.element, { getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0) }, entries, wrap);
  }

  /** A favorite effect, skill or tool opens its tab and highlights its row. */
  #revealFavorite({ type, id }) {
    const tab = type === "effect" ? "effects" : "overview";
    this.#switchTo(tab);
    const panel = this.element.querySelector(`[data-panel="${tab}"]`);
    const row = type === "effect"
      ? [...panel.querySelectorAll("[data-effect-rel]")].find((el) => el.dataset.effectRel === id)?.querySelector("[data-effect-row]")
      : panel.querySelector(`.aim-check[data-action="${type === "skill" ? "rollSkill" : "rollTool"}"][data-key="${CSS.escape(id)}"]`);
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: this.motionOn ? "smooth" : "auto" });
    row.classList.remove("is-found");
    void row.offsetWidth;
    row.classList.add("is-found");
    row.addEventListener("animationend", () => row.classList.remove("is-found"), { once: true });
  }

  /* ─── Equipment tab ─── */

  /** Listeners the equipment tab needs beyond click actions, delegated once on the window. */
  #bindEquipment() {
    const el = this.element;
    el.addEventListener("pointerdown", (event) => {
      if (event.target.name !== this._searching) this._searching = null;
    });
    el.addEventListener("click", (event) => {
      if (event.target.closest("button, input, a, label, select")) return;
      const row = event.target.closest("[data-row]");
      if (row) this.#selectRow(row);
      const effectRow = event.target.closest("[data-effect-row]");
      if (effectRow) this.#toggleEffectOpen(effectRow);
    });
    el.addEventListener("input", (event) => {
      if (event.target.dataset.coinInput) this.coinDraft = event.target.value;
      if (event.target.matches?.("[data-uses-input]")) this.usesDraft = event.target.value;
      if (event.target.matches?.("[data-offer-qty], [data-trade-coin]")) return this.#onOfferInput(event.target);
      const field = SEARCH_FIELDS[event.target.name];
      if (!field) return;
      this[field] = event.target.value;
      // The search field is redrawn while typing; it keeps the focus and the caret.
      this._searching = event.target.name;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.render({ parts: ["main"] }), 120);
    });
    el.addEventListener("contextmenu", (event) => {
      const effectRow = event.target.closest("[data-effect-row]");
      if (effectRow) {
        event.preventDefault();
        return this.#openEffectMenu(effectRow, event);
      }
      if (!event.target.closest("[data-charge]")) return;
      event.preventDefault();
      this.#changeCharge(this.#itemFrom(event.target), "restore");
    });
    el.addEventListener("focusout", (event) => {
      if (event.target.dataset?.coinInput && this.coinEditing) this.#cancelCoin();
      if (event.target.matches?.("[data-uses-input]") && this.usesEditing) this.#cancelUses();
      if (event.target.name === this._searching && event.relatedTarget) this._searching = null;
      if (event.target.matches?.("[data-bio-field]")) this.#catchUpBio();
    });
    el.addEventListener("close", (event) => event.target.matches?.("[data-bio-editor]") && this.#catchUpBio(), { capture: true });
    bindInventoryDrag(this);
  }

  /** Enter or Space selects a focused row and toggles a focused section header; the coin field reads Enter and Esc. */
  #onEquipmentKey(event) {
    const target = event.target;
    if (target.dataset?.usesInput !== undefined && target.matches?.("[data-uses-input]")) {
      if (event.key === "Enter") { event.preventDefault(); this.#applyUses(target.value); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.#cancelUses(); }
      else return false;
      return true;
    }
    if (target.dataset?.coinInput) {
      if (event.key === "Enter") { event.preventDefault(); this.#applyCoin(target.value); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.#cancelCoin(); }
      else return false;
      return true;
    }
    if (event.key !== "Enter" && event.key !== " ") return false;
    if (target.matches?.("[data-row]")) {
      event.preventDefault();
      this.#selectRow(target);
      return true;
    }
    if (target.matches?.("[data-effect-row]")) {
      event.preventDefault();
      this.#toggleEffectOpen(target);
      return true;
    }
    if (target.matches?.("[data-fav-id]")) {
      event.preventDefault();
      ActorWindow.#onFavOpen.call(this, event, target);
      return true;
    }
    if (target.matches?.('[data-action="toggleSection"]')) {
      event.preventDefault();
      this.#foldSection(target);
      return true;
    }
    return false;
  }

  #afterEquipmentRender() {
    const el = this.element;
    this.#fly();
    playSlotChanges(el, this._slotsPrev, this._castSchool, el.dataset.motion);
    if (this._effectGlide) {
      if (this.motionOn) glideFrom(el, ".aim-effwrap, .aim-eff-cat", this._effectGlide);
      this._effectGlide = null;
    }
    if (this._effectFocus) {
      const wrap = el.querySelector(`.aim-effwrap[data-key="${CSS.escape(this._effectFocus.key)}"]`);
      const action = this._effectFocus.action && wrap?.querySelector(`[data-action="${this._effectFocus.action}"]`);
      (action ?? wrap?.querySelector("[data-effect-row]"))?.focus({ preventScroll: true });
      this._effectFocus = null;
    }
    if (this._favGlide) {
      if (this.motionOn) glideFrom(el.querySelector("[data-favorites]") ?? el, ".aim-fav", this._favGlide);
      this._favGlide = null;
    }
    // Preparing past the class limit turns the counter red with one shake.
    const counter = el.querySelector("[data-prep-counter].is-over");
    if (counter && !this._prepOver && this.motionOn) this.#shake(counter);
    if (this._spellGlide) {
      if (this.motionOn) glideFrom(el.querySelector('[data-panel="spells"]'), ".aim-rowwrap", this._spellGlide);
      this._spellGlide = null;
    }
    playEquipmentChanges(el, this._equipmentPrev, el.dataset.motion);
    const coin = el.querySelector("[data-coin-input], [data-uses-input]");
    if (coin) {
      coin.focus();
      coin.setSelectionRange(coin.value.length, coin.value.length);
    }
    const search = this._searching && el.querySelector(`[name="${this._searching}"]`);
    if (search && !coin) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
    if (this._openDetail) {
      this._openDetail = false;
      const detail = el.querySelector(`.aim-rowwrap[data-key="${this.selectedKey}"] [data-detail]`);
      if (detail?.offsetHeight && this.motionOn) {
        detail.animate([{ height: "0px", opacity: 0 }, { height: `${detail.offsetHeight}px`, opacity: 1 }], { duration: 260, easing: SETTLE });
      }
    }
  }

  #itemFrom(node) {
    return this.actor.items.get(node?.closest("[data-item-id]")?.dataset.itemId);
  }

  async #savePrefs(patch, tab = "equipment") {
    await game.settings.set(MODULE_ID, "listPrefs", withListPref(getSetting("listPrefs") ?? {}, tab, patch, TAB_FILTERS[tab]));
  }

  /** A row selects its entry; the details open under that row, so a spell listed twice opens where it was clicked. */
  #selectRow(row) {
    const wrap = row.closest("[data-item-id]");
    return this.#toggleSelect(wrap.dataset.itemId, wrap.dataset.key);
  }

  /** Click selects: the inspector shows it in the wide layout, otherwise its details open under the row; again deselects. */
  async #toggleSelect(id, key = id) {
    const closing = this.selectedKey === key;
    // Opening a received item takes its «Новое» mark off.
    const item = this.actor.items.get(id);
    if (!closing && isNewItem(item) && item.isOwner) item.unsetFlag(MODULE_ID, FLAGS.TRADE_NEW);
    const open = this.selectedKey && this.element.querySelector(`.aim-rowwrap[data-key="${this.selectedKey}"] [data-detail]`);
    if (open?.offsetHeight && this.motionOn) {
      await open.animate([{ height: `${open.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 200, easing: SETTLE }).finished;
    }
    this.selected = closing ? null : id;
    this.selectedKey = closing ? null : key;
    this._openDetail = !closing;
    await this.render({ parts: ["main", "inspector"] });
  }

  #foldSection(head) {
    const section = head.closest(".aim-section");
    const id = head.dataset.sectionId;
    const folded = !this.collapsed.has(id);
    if (folded) this.collapsed.add(id); else this.collapsed.delete(id);
    section.classList.toggle("is-collapsed", folded);
    head.setAttribute("aria-expanded", String(!folded));
  }

  async #changeCharge(item, direction) {
    if (!item || !this.canEdit) return;
    const { max = 0, spent = 0 } = item.system.uses ?? {};
    const next = chargeChange(spent, max, direction);
    if (next !== spent) await item.update({ "system.uses.spent": next });
  }

  async #applyCoin(text) {
    const entry = parseCoinEntry(text);
    if (!entry) return this.element.querySelector("[data-coin-input]")?.classList.add("is-invalid");
    const key = this.coinEditing;
    this.coinEditing = null;
    this.coinDraft = "";
    const current = Number(foundry.utils.getProperty(this.actor, `system.currency.${key}`)) || 0;
    if (this.canEdit) await this.actor.update({ [`system.currency.${key}`]: applyCoinEntry(current, entry) });
    this.render({ parts: ["main"] });
  }

  #cancelCoin() {
    this.coinEditing = null;
    this.coinDraft = "";
    this.render({ parts: ["main"] });
  }

  /** The lists glide from the old view to the new one; no redraw, the next render reads the saved choice. */
  static async #onListView(event, target) {
    const view = target.dataset.view;
    const tab = target.dataset.tab ?? "equipment";
    const panel = this.element.querySelector(`[data-panel="${tab}"]`);
    const apply = () => {
      for (const list of panel.querySelectorAll(".aim-section:not([data-section=container]) .aim-items")) list.dataset.view = view;
      for (const button of panel.querySelectorAll("[data-action=listView]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
      for (const row of panel.querySelectorAll(".aim-section:not([data-section=container]) [data-row]")) {
        if (view === "icons") row.dataset.tooltip = row.querySelector(".aim-row-name")?.textContent ?? "";
        else delete row.dataset.tooltip;
      }
    };
    if (this.motionOn) glide(panel, "[data-row]", apply); else apply();
    await this.#savePrefs({ view }, tab);
  }

  static async #onListFilter(event, target) {
    const tab = target.dataset.tab ?? "equipment";
    const { filters } = listPrefsFor(getSetting("listPrefs"), tab, TAB_FILTERS[tab]);
    const id = target.dataset.filter;
    await this.#savePrefs({ filters: filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id] }, tab);
    this.render({ parts: ["main"] });
  }

  static #onToggleSection(event, target) {
    this.#foldSection(target);
  }

  static #onAddItem(event, target) {
    if (!this.canEdit) return;
    const type = target.dataset.type;
    // dnd5e's CreateDocumentDialog reads the allowed types from the creation options.
    return Item.implementation.createDialog({ type }, { parent: this.actor, types: [type] });
  }

  static #onUseItem(event, target) {
    return useItem(this.#itemFrom(target), event);
  }

  static #onUseActivity(event, target) {
    if (!this.canEdit) return;
    return this.#itemFrom(target)?.system.activities?.get(target.dataset.activityId)?.use({ event });
  }

  static async #onEquipItem(event, target) {
    const item = this.#itemFrom(target);
    if (!item) return;
    this.#prepareFlight(item, target.closest("[data-item-id]")?.querySelector(".aim-tile"));
    await toggleItemEquipped(this.actor, item);
  }

  /** Past the attunement limit a new attunement is refused with a shake of the row. */
  static #onAttuneItem(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.canEdit) return this.attuneWithLimit(item, target.closest("[data-item-id]")?.querySelector("[data-row]"));
  }

  static #onStepQty(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit) return;
    const next = Math.max(0, (Number(item.system.quantity) || 0) + Number(target.dataset.step));
    if (next !== item.system.quantity) return item.update({ "system.quantity": next });
  }

  static #onSpendCharge(event, target) {
    return this.#changeCharge(this.#itemFrom(target), "spend");
  }

  static #onItemMenu(event, target) {
    const item = this.#itemFrom(target);
    if (item) openItemMenu(this.element, target, itemMenuEntries(item), target.closest("[data-item-id]"));
  }

  static #onItemToChat(event, target) {
    return this.#itemFrom(target)?.displayCard();
  }

  static #onManageCurrency() {
    if (this.canEdit) return new dnd5e.applications.CurrencyManager({ document: this.actor }).render({ force: true });
  }

  /** The tray folds or unfolds at once; the choice is remembered per container. */
  static async #onToggleTray(event, target) {
    const tray = target.closest("[data-tray]");
    const item = this.actor.items.get(tray?.dataset.tray);
    if (!item) return;
    const folded = !tray.classList.contains("is-folded");
    tray.classList.toggle("is-folded", folded);
    target.setAttribute("aria-expanded", String(!folded));
    await game.settings.set(MODULE_ID, "trayFolds", { ...getSetting("trayFolds"), [item.uuid]: folded });
  }

  static async #onFoldAllTrays(event, target) {
    const folded = target.dataset.fold === "fold";
    const folds = { ...getSetting("trayFolds") };
    for (const item of this.actor.items) if (item.type === "container") folds[item.uuid] = folded;
    await game.settings.set(MODULE_ID, "trayFolds", folds);
    this.render({ parts: ["main"] });
  }

  static #onContainerRules(event, target) {
    if (game.user.isGM) return openWeightyContainersDialog(this.#itemFrom(target));
  }

  /* ─── Paperdoll ─── */

  /** The tile flies to the doll on equip and back to its row on unequip; it is measured before the change. */
  #prepareFlight(item, from) {
    if (!from || !this.motionOn) return;
    this._flight = { id: item.id, from: from.getBoundingClientRect(), img: item.img, toDoll: !item.system.equipped };
  }

  #fly() {
    const flight = this._flight;
    this._flight = null;
    if (!flight) return;
    const item = this.actor.items.get(flight.id);
    if (!item || Boolean(item.system.equipped) !== flight.toDoll) return;
    const el = this.element;
    const target = flight.toDoll
      ? el.querySelector(`.aim-slot[data-item-id="${flight.id}"] .aim-tile, .aim-slotless-item[data-item-id="${flight.id}"] .aim-tile`)
      : el.querySelector(`.aim-rowwrap[data-item-id="${flight.id}"] .aim-tile-btn .aim-tile`);
    if (!target?.offsetWidth) return;
    const to = target.getBoundingClientRect();
    const ghost = document.createElement("img");
    ghost.src = flight.img;
    ghost.className = "aim-flight";
    Object.assign(ghost.style, { left: `${flight.from.left}px`, top: `${flight.from.top}px`, width: `${flight.from.width}px`, height: `${flight.from.height}px` });
    document.body.append(ghost);
    target.style.visibility = "hidden";
    const dx = to.left - flight.from.left;
    const dy = to.top - flight.from.top;
    const scale = to.width / flight.from.width;
    ghost.animate([
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 40}px) scale(${(1 + scale) / 2 * 1.15})`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: 520, easing: SETTLE }).finished.finally(() => {
      ghost.remove();
      target.style.visibility = "";
      const slot = target.closest(".aim-slot");
      slot?.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 320, easing: SETTLE });
    });
  }

  static async #onToggleDoll() {
    const hidden = !getSetting("dollHidden");
    await game.settings.set(MODULE_ID, "dollHidden", hidden);
    const panel = this.element.querySelector('[data-panel="equipment"]');
    const before = new Map([...panel.querySelectorAll("[data-row]")].map((row) => [row.closest("[data-item-id]")?.dataset.itemId, row.getBoundingClientRect()]));
    await this.render({ parts: ["main"] });
    // The inventory glides to fill the space the doll left, or makes room for it.
    if (!this.motionOn) return;
    for (const row of this.element.querySelectorAll('[data-panel="equipment"] [data-row]')) {
      const from = before.get(row.closest("[data-item-id]")?.dataset.itemId);
      const to = row.getBoundingClientRect();
      if (!from || !to.width) continue;
      row.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 420, easing: SETTLE });
    }
  }

  /** A filled slot selects its item; an empty one equips the first unequipped item that fits, or shakes. */
  static async #onSlotClick(event, target) {
    const id = target.dataset.itemId;
    if (id) return this.#toggleSelect(id);
    if (!this.canEdit) return;
    const slotId = target.dataset.slot;
    const item = firstItemFor(this.actor, slotId);
    if (!item) {
      this.#shake(target);
      return ui.notifications.warn(t("AIM.window.doll.nothingFits", { slot: target.querySelector(".aim-slot-label")?.textContent ?? slotId }));
    }
    this.#prepareFlight(item, this.element.querySelector(`.aim-rowwrap[data-item-id="${item.id}"] .aim-tile-btn .aim-tile`));
    if (!await equipItemToSlot(this.actor, item, slotId)) this.#shake(target);
  }

  static async #onUnequipSlot(event, target) {
    event.stopPropagation();
    const holder = target.closest("[data-item-id]");
    const item = this.actor.items.get(holder?.dataset.itemId);
    if (!item || !this.canEdit) return;
    this.#prepareFlight(item, holder.querySelector(".aim-tile"));
    await unequipItem(this.actor, item);
  }

  /* ─── Spells tab ─── */

  #awaitTemplate() {
    // Not awaited: the minimise animation must not hold up watching the placement.
    if (!this.minimized) this.minimize();
    clearInterval(this._templateWatch);
    const started = Date.now();
    this._templateWatch = setInterval(() => {
      // dnd5e draws the template as a preview on the templates layer until it is placed or cancelled.
      if (canvas?.templates?.preview?.children?.length && Date.now() - started < 120000) return;
      clearInterval(this._templateWatch);
      if (this.rendered) this.maximize();
    }, 250);
  }

  /** item.use(): dnd5e chooses the slot, upcasting or ritual casting; a refusal shakes the row beside dnd5e's message. */
  static async #onCastSpell(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit) return;
    this._castSchool = item.system.school;
    clearTimeout(this._castSchoolTimer);
    this._castSchoolTimer = setTimeout(() => { this._castSchool = null; }, 4000);
    return this.#useWithRefusal(item, target, event);
  }

  /** The tile of an active feature uses it through dnd5e; with no uses left dnd5e refuses and the row shakes. */
  static #onUseFeature(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.canEdit) return this.#useWithRefusal(item, target, event);
  }

  async #useWithRefusal(item, target, event) {
    const notifications = ui.notifications;
    const { warn, error } = notifications;
    let refused = false;
    notifications.warn = (...args) => { refused = true; return warn.apply(notifications, args); };
    notifications.error = (...args) => { refused = true; return error.apply(notifications, args); };
    let result;
    try {
      result = await item.use({ event });
    } finally {
      notifications.warn = warn;
      notifications.error = error;
    }
    if (!result && refused) {
      const holder = this.element.querySelector(`[data-key="${target.closest("[data-key]")?.dataset.key}"]`);
      this.#shake(holder?.querySelector("[data-row]") ?? holder);
    }
  }

  /** The row glides into or out of the prepared list; past the class limit dnd5e only warns. */
  static async #onPrepareSpell(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit) return;
    this._spellGlide = measure(this.element.querySelector('[data-panel="spells"]'), ".aim-rowwrap");
    await toggleSpellPreparation(item);
  }

  /** A lit gem spends slots down to it, a hollow one restores up to it. */
  static async #onSlotPip(event, target) {
    if (!this.canEdit) return;
    const key = target.dataset.slotKey;
    const value = Number(this.actor.system.spells?.[key]?.value) || 0;
    const next = pipTarget(value, Number(target.dataset.index));
    if (next !== value) await this.actor.update({ [`system.spells.${key}.value`]: next });
  }

  static #onEditUses(event, target) {
    if (!this.canEdit) return;
    this.usesEditing = target.closest("[data-item-id]").dataset.itemId;
    this.usesDraft = "";
    this.render({ parts: ["main"] });
  }

  async #applyUses(text) {
    const item = this.actor.items.get(this.usesEditing);
    const max = Number(item?.system.uses?.max) || 0;
    const value = applyUsesEntry({ value: max - (Number(item?.system.uses?.spent) || 0), max }, text);
    if (value === null) return this.element.querySelector("[data-uses-input]")?.classList.add("is-invalid");
    this.usesEditing = null;
    this.usesDraft = "";
    if (this.canEdit && item) await item.update({ "system.uses.spent": max - value });
    this.render({ parts: ["main"] });
  }

  #cancelUses() {
    this.usesEditing = null;
    this.usesDraft = "";
    this.render({ parts: ["main"] });
  }

  /** A recharge feature rolls its d6 through dnd5e; a 5–6 (or its own threshold) refills it. */
  static #onRechargeItem(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.canEdit) return item.system.uses?.rollRecharge?.({ apply: true, event });
  }

  static #onAddFeature() {
    if (this.canEdit) return Item.implementation.createDialog({ type: "feat" }, { parent: this.actor, types: ["feat"] });
  }

  /** Uses pips of spells and features work like slot gems, written as system.uses.spent. */
  static async #onUsePip(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit) return;
    const max = Number(item.system.uses?.max) || 0;
    const value = max - (Number(item.system.uses?.spent) || 0);
    const next = Math.min(max, pipTarget(value, Number(target.dataset.index)));
    if (next !== value) await item.update({ "system.uses.spent": max - next });
  }

  /* ─── Favorites ─── */

  /** Stars or unstars an entry in dnd5e's system.favorites; the rail list glides to its new order. */
  static async #onToggleFavorite(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit || !hasFavorites(this.actor)) return;
    const id = favoriteIdFor(this.actor, item);
    this.#measureFavorites();
    if (this.actor.system.hasFavorite(id)) await this.actor.system.removeFavorite(id);
    else await this.actor.system.addFavorite({ type: "item", id });
  }

  #measureFavorites() {
    const list = this.element.querySelector("[data-favorites]");
    if (list) this._favGlide = measure(list, ".aim-fav");
  }

  /** Adds a favorite of any kind dnd5e allows; a new one goes to the end. */
  async addFavorite(favorite) {
    if (!this.canEdit || !hasFavorites(this.actor) || this.actor.system.hasFavorite(favorite.id)) return;
    this.#measureFavorites();
    await this.actor.system.addFavorite(favorite);
  }

  /** Moves a favorite before or after another, written to system.favorites sort. */
  async reorderFavorite(id, targetId, before) {
    if (!this.canEdit) return;
    this.#measureFavorites();
    await this.actor.update({ "system.favorites": reorderFavorites(this.actor.system.favorites, id, targetId, before) });
  }

  #favoriteFrom(target) {
    const id = target.closest("[data-fav-id]")?.dataset.favId;
    return this.actor.system.favorites?.find((f) => f.id === id) ?? null;
  }

  /** The tile acts like dnd5e's useFavorite: uses an item or activity, toggles an effect, rolls a skill or tool. */
  static async #onFavUse(event, target) {
    const favorite = this.#favoriteFrom(target);
    if (!favorite || !this.canEdit) return;
    if (favorite.type === "slots") return this.#switchTo("spells");
    if (favorite.type === "skill") return this.actor.rollSkill({ event, skill: favorite.id });
    if (favorite.type === "tool") return this.actor.rollToolCheck({ event, tool: favorite.id });
    const doc = await fromUuid(favorite.id, { relative: this.actor });
    if (!doc) return;
    // A suppressed effect stays locked here as on its row: its item must be equipped and attuned first.
    if (favorite.type === "effect") return doc.isSuppressed ? this.#shake(target.closest("[data-fav-id]")) : doc.update({ disabled: !doc.disabled });
    if (favorite.type === "activity") return doc.canUse === false ? undefined : doc.use({ event });
    if (doc.type === "container") return doc.sheet.render({ force: true });
    return this.#useWithRefusal(doc, target, event);
  }

  /** A click elsewhere on the row opens the entry's tab and selects it there. */
  static async #onFavOpen(event, target) {
    const favorite = this.#favoriteFrom(target);
    if (!favorite) return;
    if (["effect", "skill", "tool"].includes(favorite.type)) return this.#revealFavorite(favorite);
    const doc = ["item", "activity"].includes(favorite.type) ? await fromUuid(favorite.id, { relative: this.actor }) : null;
    const item = favorite.type === "activity" ? doc?.item : doc;
    const tab = tabForFavorite({ type: favorite.type, itemType: item?.type });
    this.#switchTo(tab);
    const row = item && this.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"] [data-row]`);
    if (!row) return;
    if (this.selected !== item.id) await this.#selectRow(row);
    this.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"]`)?.scrollIntoView({ block: "nearest", behavior: this.motionOn ? "smooth" : "auto" });
  }

  static #onOpenPresetEditor() {
    return openPresetEditor(this.actor);
  }

  static #onSocketClick(event, target) {
    return this.#toggleSelect(target.dataset.itemId);
  }

  static #onEndAttunement(event, target) {
    event.stopPropagation();
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item && this.canEdit) return toggleAttunement(item);
  }

  #shake(node) {
    if (!node) return;
    node.classList.remove("is-refused");
    void node.offsetWidth;
    node.classList.add("is-refused");
    node.addEventListener("animationend", () => node.classList.remove("is-refused"), { once: true });
  }

  /** Past the attunement limit a new attunement is refused with a shake of the row and of the attunement track. */
  attuneWithLimit(item, rowNode) {
    const max = getActorAttunementMax(this.actor);
    if (!isItemAttuned(item) && countAttunedItems(this.actor) >= max) {
      this.#shake(rowNode);
      this.#shake(this.element.querySelector("[data-attune]"));
      ui.notifications.warn(t("AIM.notifications.maxAttunementReached", { max }));
      return false;
    }
    return toggleAttunement(item);
  }

  static #onEditCoin(event, target) {
    if (!this.canEdit) return;
    this.coinEditing = target.dataset.coin;
    this.coinDraft = "";
    this.render({ parts: ["main"] });
  }
}

/** With several classes the level goes to the one the player picks. */
async function chooseClass(classes) {
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("AIM.window.xp.chooseClass") },
    content: `<p>${t("AIM.window.xp.chooseClassHint")}</p>`,
    buttons: classes.map((cls) => ({ action: cls.id, label: `${cls.name} ${cls.levels}` })),
    rejectClose: false
  });
}

export function openActorWindow(actor) {
  if (!isSupportedActor(actor)) return null;
  const key = actor.uuid ?? actor.id;
  const open = OPEN_WINDOWS.get(key);
  if (open) {
    open.bringToFront?.();
    open.maximize?.();
    return open;
  }
  const app = new ActorWindow(actor);
  app.render({ force: true });
  return app;
}

export function toggleActorWindow(actor) {
  const open = OPEN_WINDOWS.get(actor?.uuid ?? actor?.id);
  if (open) return open.close();
  return openActorWindow(actor);
}
