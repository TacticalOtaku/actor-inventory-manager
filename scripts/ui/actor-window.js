// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the window for a supported actor (ApplicationV2)
// ─────────────────────────────────────────────────────────

import { MODULE_ID, REFRESH_HOOK } from "../constants.js";
import { canEditActor, canViewActor, isSupportedActor } from "../core/actor-scope.js";
import {
  ACCENTS,
  ALWAYS_TAB,
  DENSITIES,
  MOTION_LEVELS,
  SHEET_MENU_TABS,
  SHEET_TABS,
  THEMES,
  crLabel,
  effectiveMotion,
  fallbackTab,
  layoutForWidth,
  motionCap,
  mergeParts,
  normalizeAccent,
  partsForActorChange,
  partsForEffectChange,
  railBlocksFor,
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
import { readAbilities, readFeatures, readIdentity, readNpc, readRail, readVehicle, toggleSpellPreparation } from "../integrations/dnd5e.js";
import { isPhysicalItem } from "../core/item-classifier.js";
import { LOG } from "../foundry/logger.js";
import {
  EQUIPMENT_TEMPLATES,
  buildEquipmentContext,
  buildInspector,
  buildItemDetail,
  closeItemMenu,
  equipmentSnapshot,
  activityMenuEntries,
  itemMenuEntries,
  openItemMenu,
  playEquipmentChanges
} from "./equipment.js";
import { buildDollContext, firstItemFor } from "./doll.js";
import { FEATURE_TEMPLATES, buildFeaturesContext, featureMode, hasFeatures } from "./features.js";
import { EFFECT_TEMPLATES, buildEffectsContext, createActorEffect, effectMenuEntries } from "./effects.js";
import { OVERVIEW_TEMPLATES, buildBiographyContext, buildOverviewContext, cardDialogs, hasOverview } from "./overview.js";
import { OfferDraft, buildTradeContext, isNewItem, offerButton, offerWithQuantity, sendTradeRequest } from "./trade.js";
import { TRADE_HOOK, isTradeLocked, sessionFor } from "../trade/service.js";
import { FLAGS } from "../constants.js";
import { bindTooltips, releaseTooltips } from "./tooltips.js";
import { buildFavoritesContext, favoriteIdFor, favoriteItemIds, hasFavorites } from "./favorites.js";
import { SPELL_TEMPLATES, buildSpellsContext, playSlotChanges, preparationWarning, slotSnapshot } from "./spells.js";
import { openPresetEditor } from "./preset-editor.js";
import { bindInventoryDrag } from "./inventory-drag.js";
import { morph } from "./morph.js";
import { equipItemToSlot, toggleAttunement, toggleItemEquipped, unequipItem, useItem } from "./item-actions.js";
import { setActorPaperdollTemplate } from "../core/paperdoll-templates.js";
import { CONTAINER_RULES_HOOK, openWeightyContainersDialog } from "../integrations/weighty-containers.js";
import { styleScItemRows } from "../integrations/sc-rarity-colors.js";
import { SETTLE, bindPointerFx, cascade, glide, glideFrom, measure } from "./motion.js";
import { readMotionCaps, schemeIsLight, stampTheme } from "./theme-root.js";
import { REST_HOOK, buildRailContext, floatText, holdRestored, openStatConfig, playLongRest, playRailChanges, railSnapshot, startRuneGlints } from "./rail.js";
import { playBurst, preloadBursts } from "./bursts.js";
import { vehicleKind } from "./vehicle.js";
import { t } from "./html.js";
import { signed } from "../core/overview.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/window`;

/** Open windows, keyed by actor UUID (a token actor gets its own window). */
const OPEN_WINDOWS = new Map();

// Uses waiting on dnd5e, whose dialog may stay open: a warning or error meanwhile marks each one refused. One wrapper
// for all of them, so two uses closed in either order leave the real methods in place.
const watchedUses = new Set();
let realNotices = null;

function watchNotices(use) {
  if (!watchedUses.size) {
    const notifications = ui.notifications;
    realNotices = { warn: notifications.warn, error: notifications.error };
    for (const kind of ["warn", "error"]) {
      notifications[kind] = (...args) => {
        for (const watched of watchedUses) {
          watched.refused = true;
          watched.message ??= typeof args[0] === "string" ? args[0] : null;
        }
        return realNotices[kind].apply(notifications, args);
      };
    }
  }
  watchedUses.add(use);
}

function unwatchNotices(use) {
  watchedUses.delete(use);
  if (!watchedUses.size && realNotices) {
    Object.assign(ui.notifications, realNotices);
    realNotices = null;
  }
}

/** Bursts of document hooks become one render. */
const RENDER_COALESCE_MS = 40;

/** What comes in as a cascade when a tab or a section opens. */
const CASCADE = ".aim-rowwrap > [data-row], .aim-effwrap, .aim-check, .aim-card";

/** The search fields and the window state each one filters. */
const SEARCH_FIELDS = { inventorySearch: "query", spellSearch: "spellQuery", featureSearch: "featureQuery" };

/** The filters each tab knows. */
const TAB_FILTERS = { equipment: LIST_FILTERS, spells: SPELL_FILTERS, features: FEATURE_FILTERS };

/** Width the collapse button shrinks the window to: the compact layout, rail only. */
const COLLAPSED_WIDTH = 320;

const hasLegendary = (actor) => Object.values(readNpc(actor)?.legendary ?? {}).some(Boolean);
/** The settings list names a block by what it holds for this actor type: an NPC's stats add its rating, its chips lack inspiration. */
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
      xpAdd: ActorWindow.#onXpChange,
      xpSet: ActorWindow.#onXpChange,
      collapseWindow: ActorWindow.#onCollapse,
      expandWindow: ActorWindow.#onExpand,
      toggleMenu: ActorWindow.#onToggleMenu,
      openSheet: ActorWindow.#onOpenSheet,
      openTraits: ActorWindow.#onOpenTraits,
      openBastion: ActorWindow.#onOpenBastion,
      revertForm: ActorWindow.#onRevertForm,
      openDocument: ActorWindow.#onOpenDocument,
      openCrew: ActorWindow.#onOpenCrew,
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
    this.tradePartner = null;
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
    const identity = this.#identity();
    const tabs = this.#tabs();
    this.tab = fallbackTab(this.tab, tabs.filter((tab) => !tab.hidden).map((tab) => tab.id));
    for (const tab of tabs) tab.active = tab.id === this.tab;
    const selected = this.selected ? actor.items.get(this.selected) : null;
    if (!selected) this.selected = this.selectedKey = null;
    // A redraw without the tabs or the inspector (an HP tick) skips their rows, the details and the biography.
    const body = options.parts?.some((part) => part === "main" || part === "inspector") ?? true;
    const detail = body && selected ? await buildItemDetail(selected, { canEdit: this.canEdit }) : null;
    const favIds = favoriteItemIds(actor);
    const trade = buildTradeContext(actor, { canEdit: this.canEdit, open: this.tradeOpen, draft: this.tradeDraft,
      askRestore: this.tradeAskRestore, dismissed: this.tradeDismissed, seen: this.tradeSeen, error: this.tradeError, partner: this.tradePartner });
    if (!trade.button) this.tradeOpen = false;
    return {
      trade,
      tradeLock: isTradeLocked(actor),
      offerRows: body ? Object.fromEntries(actor.items.map((item) => [item.id, offerButton(trade, item)]).filter(([, state]) => state)) : {},
      newItems: body ? Object.fromEntries(actor.items.filter(isNewItem).map((item) => [item.id, true])) : {},
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
      xpSteps: [50, 100, 250, 1000],
      sheetLabel: t(`AIM.window.menu.openSheet${{ npc: "Npc", vehicle: "Vehicle" }[actor.type] ?? ""}`),
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
      inv: body && await buildEquipmentContext(actor, {
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
      inspector: body && selected ? buildInspector(selected, detail) : null,
      spells: body && this.#hasSpells() ? buildSpellsContext(actor, {
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
      features: body && buildFeaturesContext(actor, {
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
      overview: body && hasOverview(actor) ? buildOverviewContext(actor, { canFavorite: hasFavorites(actor) && this.canEdit }) : null,
      bio: body && await buildBiographyContext(actor),
      doll: body && buildDollContext(actor, { canEdit: this.canEdit, selected: this.selected, hidden: Boolean(getSetting("dollHidden")) }),
      ...buildRailContext(actor, { canEdit: this.canEdit, hasSpells: this.#hasSpells(), hiddenBlocks: getSetting("hiddenRailBlocks") ?? [] })
    };
  }

  #identity() {
    const id = readIdentity(this.actor);
    const npc = readNpc(this.actor);
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
      xpNear: share >= 0.9,
      orbLabel: id.xp.ready ? t("AIM.window.xp.ready", { level: id.level + 1 }) : t("AIM.window.xp.orb", { value: id.xp.value, max: id.xp.max }),
      // An NPC's challenge rating sits in the level orb's place, its size and type under the name.
      cr: npc && { text: crLabel(npc.cr), hint: t("AIM.window.npc.crHint", { xp: npc.xp.toLocaleString(game.i18n.lang) }) },
      kind: npc ? [npc.type, npc.size].filter(Boolean).join(" · ") : this.actor.type === "vehicle" ? vehicleKind(this.actor) : "",
      summary: npc
        ? [t("AIM.window.npc.crShort", { cr: crLabel(npc.cr) }), npc.type].filter(Boolean).join(" · ")
        : this.actor.type === "vehicle" ? (readVehicle(this.actor)?.typeLabel ?? "") : links.slice(0, 2).map((l) => l.label).join(" · ")
    };
  }

  /** Tabs this actor has nothing for: no spells, a vehicle without actions, no overview. */
  #missingTabs() {
    const missing = this.#hasSpells() ? [] : ["spells"];
    // A vehicle shows «Действия» only when it has any (siege weapons, vehicle features).
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
    const missing = this.#missingTabs();
    const absent = t(`AIM.window.settings.absent${{ npc: "Npc", vehicle: "Vehicle" }[this.actor.type] ?? ""}`);
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
      absentText: absent,
      railBlocks: railBlocksFor(this.actor.type, { hasSpells, hasLegendary: hasLegendary(this.actor) }, hiddenBlocks)
        .map(({ id, absent, shown }) => ({ id, absent, shown, label: railBlockLabel(id, this.actor.type) })),
      tabs: SHEET_TABS.map((id) => {
        const locked = id === ALWAYS_TAB || missing.includes(id);
        const note = id === ALWAYS_TAB ? t("AIM.window.settings.always") : locked ? absent : "";
        return { id, label: this.#tabLabel(id), shown: id === ALWAYS_TAB || (!locked && !hiddenTabs.includes(id)), locked, note };
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
    this.#hook("updateActor", (actor, changes) => mine(actor) && this.#queueRender(actor === this.actor ? partsForActorChange(changes) : null));
    // A transformed actor is deleted when it reverts; its window goes with it.
    this.#hook("deleteActor", (actor) => actor?.uuid === this.actorKey && this.close());
    // An unlinked token's actor goes with its token, and no deleteActor says so.
    this.#hook("deleteToken", (token) => this.actorKey.startsWith(`${token.uuid}.`) && this.close());
    // Deleting a scene fires no deleteToken for its tokens.
    this.#hook("deleteScene", (scene) => this.actorKey.startsWith(`${scene.uuid}.`) && this.close());
    for (const name of ["createItem", "updateItem", "deleteItem"]) this.#hook(name, (doc) => mine(doc) && rerender());
    for (const name of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      this.#hook(name, (effect) => mine(effect) && this.#queueRender(partsForEffectChange({
        onActor: effect.parent === this.actor,
        changes: effect.changes ?? [],
        statuses: [...(effect.statuses ?? [])]
      }, this.tab)));
    }
    this.#hook(REFRESH_HOOK, rerender);
    // A trade redraws only its own actors' windows, and any open panel (it shows who is busy).
    this.#hook(TRADE_HOOK, (state) => {
      const key = JSON.stringify((state?.sessions ?? []).filter((s) => s.actors?.includes(this.actor.id)));
      if (key === this._tradeKey && !this.tradeOpen) return;
      this._tradeKey = key;
      this.renderTrade();
    });
    // Weighty Containers announces a rules change on its own hook; the trays' bands and reductions follow.
    this.#hook(CONTAINER_RULES_HOOK, rerender);
    // Placing a spell template minimises the window; it comes back once the template is placed or cancelled.
    this.#hook("dnd5e.createActivityTemplate", (activity) => activity?.actor?.uuid === this.actorKey && this.#awaitTemplate());
    this.#hook(REST_HOOK, (actor, result, config) => actor?.uuid === this.actorKey && config?.type === "long" && playLongRest(this.element));
    this.#hook("dnd5e.preRestCompleted", (actor, result, config) => actor?.uuid === this.actorKey && config?.type === "long" && holdRestored(this.element));
    // Looping effects run only in the actor window in front.
    this.element.addEventListener("pointerdown", () => this.#bringFront(), { capture: true });
    this.#bringFront();
    this._glints = startRuneGlints(this);
    if (this.element.dataset.motion !== "off") preloadBursts();
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
    // A click outside the «⋯» menu or the experience card closes it, as Escape does.
    this._away = (event) => {
      if (!(this.menuOpen || this.xpOpen) || event.target.closest?.(".aim-menu-wrap, .aim-xp-card, .aim-level")) return;
      this.menuOpen = this.xpOpen = false;
      this.render({ parts: ["main"] });
    };
    this._awayDoc = this.element.ownerDocument;
    this._awayDoc.addEventListener("pointerdown", this._away, { capture: true });
    this.#bindScrolling();
    bindPointerFx(this.element);
    this.element.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.element.addEventListener("change", (event) => this.#onChange(event));
    this.#bindEquipment();
    bindTooltips(this);
    // The window settles in from below; the rail's blocks follow one after another.
    if (this.motionOn) {
      this.element.querySelector(".window-content")?.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: SETTLE });
      [...this.element.querySelector(".aim-rail")?.children ?? []].slice(0, 12).forEach((block, i) => block.animate(
        [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: 90 + i * 45, easing: SETTLE, fill: "backwards" }));
    }
  }

  /**
   * Scrolling: once a panel is scrolled the tab strip casts a shadow over it. In the narrow layout the rail is one row
   * that scrolls sideways: the wheel scrolls it, and its edges fade where more blocks wait.
   */
  #bindScrolling() {
    const el = this.element;
    el.addEventListener("scroll", (event) => {
      const target = event.target;
      if (target.matches?.(".aim-panel")) el.querySelector(".aim-main")?.classList.toggle("is-scrolled", target.scrollTop > 2);
      else if (target.matches?.(".aim-rail")) this.#railEdges();
    }, { capture: true, passive: true });
    el.addEventListener("wheel", (event) => {
      const rail = event.target.closest?.(".aim-rail");
      if (!rail || el.dataset.layout !== "narrow" || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      // A block that scrolls by itself (a long effect list) keeps the wheel.
      for (let node = event.target; node && node !== rail; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY !== "visible") return;
      }
      if (rail.scrollWidth <= rail.clientWidth) return;
      event.preventDefault();
      rail.scrollLeft += event.deltaY;
    }, { passive: false });
  }

  #railEdges() {
    const rail = this.element?.querySelector(".aim-rail");
    if (!rail) return;
    const narrow = this.element.dataset.layout === "narrow";
    rail.classList.toggle("has-more-left", narrow && rail.scrollLeft > 2);
    rail.classList.toggle("has-more-right", narrow && rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2);
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    // A number field of the trade panel keeps the focus and the caret across the redraw its own send causes.
    const active = this.element?.ownerDocument.activeElement;
    const field = this.element?.contains(active) ? active : null;
    const key = field?.dataset?.offerQty ?? field?.dataset?.tradeCoin;
    this._tradeFocus = key ? { attr: field.dataset.offerQty ? "data-offer-qty" : "data-trade-coin", key } : null;
    this._equipmentPrev = this.element ? equipmentSnapshot(this.element) : null;
    this._slotsPrev = this.element ? slotSnapshot(this.element) : null;
    this._prepOver = Boolean(this.element?.querySelector("[data-prep-counter].is-over"));
  }

  /** The main part is patched in place, not replaced: only what changed is restyled and laid out again (#9). */
  _replaceHTML(result, content, options) {
    const prior = result.main && content.querySelector('[data-application-part="main"]');
    if (prior) {
      const state = {};
      this._preSyncPartState("main", result.main, prior, state);
      morph(prior, result.main);
      this._syncPartState("main", prior, prior, state);
      delete result.main;
    }
    super._replaceHTML(result, content, options);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const drawer = this.element.querySelector('[data-application-part="drawer"]');
    if (drawer) drawer.inert = !this.element.classList.contains("is-settings");
    this.#applyRootState();
    this.#applyLayout({ animate: false });
    this.#moveInk();
    this.#railEdges();
    // The rail's own listeners go on its fresh elements only; a redraw of another part keeps them.
    if (options.parts.includes("rail")) {
      this.#bindRail();
      // Only a redrawn rail shows the change; a later rail redraw (dnd5e adding Bloodied) waits until it has played.
      const next = railSnapshot(this.actor);
      if (playRailChanges(this.element, this._railPrev, next)) this._railBusyUntil = performance.now() + 1100;
      this._railPrev = next;
    }
    // The orb that just became ready to level throws golden stars.
    const ready = Boolean(this.element.querySelector(".aim-level.is-ready"));
    if (ready && this._orbReady === false) playBurst(this.element, this.element.querySelector(".aim-level"), "inspired");
    this._orbReady = ready;
    this.#afterEquipmentRender();
    // A main redraw patches the rows back to the template, so SC styles them again each time.
    if (options.parts.includes("main")) styleScItemRows(this.element, this.actor);
    this.#playLanding();
    this.#afterTradeRender(options);
    if (this._tradeFocus) {
      const field = this.element.querySelector(`[${this._tradeFocus.attr}="${CSS.escape(this._tradeFocus.key)}"]`);
      field?.focus();
      this._tradeFocus = null;
    }
  }

  /** Rows of items just dropped in from outside land with a flash, once. */
  landItems(ids) {
    this._landed = new Set([...(this._landed ?? []), ...ids]);
  }

  #playLanding() {
    if (!this._landed?.size) return;
    for (const id of this._landed) {
      const row = this.element.querySelector(`[data-panel="${this.tab}"] [data-item-id="${CSS.escape(id)}"] [data-row]`);
      if (!row) continue;
      this._landed.delete(id);
      if (!this.motionOn) continue;
      row.classList.add("is-landed");
      row.addEventListener("animationend", () => row.classList.remove("is-landed"), { once: true });
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
      // A rail redraw from another client takes the field away; only leaving it cancels the entry.
      input.addEventListener("blur", () => input.isConnected && this.hpEditing && this.#cancelHp());
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

  /** The field closes first; the change then plays once, on the redraw the actor update brings. */
  async #applyHp(text) {
    const entry = parseHpEntry(text);
    if (!entry) return this.element.querySelector("[data-hp-input]")?.classList.add("is-invalid");
    this.hpEditing = false;
    this.hpDraft = "";
    await this.render({ parts: ["rail"] });
    await this.#changeHp(entry);
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

  async _preClose(options) {
    // An open row menu holds a listener on the document; it goes with the window (by _onClose the element is gone).
    closeItemMenu(this.element);
    return super._preClose(options);
  }

  _onClose(options) {
    this._awayDoc?.removeEventListener("pointerdown", this._away, { capture: true });
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
    // A window opened twice in a row must not drop the entry of the one that stays.
    if (OPEN_WINDOWS.get(this.actorKey) === this) OPEN_WINDOWS.delete(this.actorKey);
    super._onClose(options);
  }

  #hook(name, fn) {
    this._hooks.push([name, Hooks.on(name, fn)]);
  }

  #queueRender(parts = null) {
    this._queuedParts = mergeParts(this._queuedParts, parts);
    clearTimeout(this._renderTimer);
    const wait = Math.max(RENDER_COALESCE_MS, (this._railBusyUntil ?? 0) - performance.now());
    this._renderTimer = setTimeout(() => {
      const queued = this._queuedParts;
      this._queuedParts = undefined;
      if (this.rendered) this.#renderAroundBio(queued);
    }, wait);
  }

  /** Renders these parts, all when none are named; a biography being typed in holds the main part back. */
  #renderAroundBio(parts) {
    if (!this.#editingBio()) return this.render(parts ? { parts } : undefined);
    this._mainStale = true;
    const rest = (parts ?? ["rail", "inspector", "drawer"]).filter((part) => part !== "main");
    if (rest.length) this.render({ parts: rest });
  }

  #editingBio() {
    const el = this.element;
    const active = el?.ownerDocument.activeElement;
    return Boolean(el?.querySelector("[data-bio-editor][open]") || active?.closest?.("[data-bio-field]") && el.contains(active));
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
    requestAnimationFrame(() => {
      this.#moveInk();
      this.#railEdges();
    });
  }

  #moveInk() {
    const tab = this.element?.querySelector(`.aim-tab[data-tab="${this.tab}"]`);
    const ink = this.element?.querySelector(".aim-tab-ink");
    if (!tab || !ink) return;
    // The ink is 100 px wide and scales to the tab, so a tab switch animates a transform only (#9).
    ink.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth / 100})`;
  }

  #onKeydown(event) {
    if (this.#onEquipmentKey(event)) return;
    if (event.key === "Enter" && event.target.matches?.('[data-xp-form] [name="xp"]')) {
      event.preventDefault();
      return ActorWindow.#onXpChange.call(this, event, event.target);
    }
    if (event.key !== "Escape") return;
    if (closeItemMenu(this.element)) {
      event.stopPropagation();
    } else if (this.element.classList.contains("is-settings")) {
      event.stopPropagation();
      this.#setSettings(false);
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
  }

  /** A quick step or the field's amount adds to the experience, «Задать» sets it; the field empties after. */
  static async #onXpChange(event, target) {
    const field = this.element.querySelector('[data-xp-form] [name="xp"]');
    const raw = target.dataset.amount ?? field?.value ?? "";
    const amount = Math.trunc(Number(raw));
    const set = target.dataset.action === "xpSet";
    if (!this.canEdit || raw === "" || !Number.isFinite(amount) || (!set && !amount)) return;
    if (field) field.value = "";
    const value = set ? amount : readIdentity(this.actor).xp.value + amount;
    await this.actor.update({ "system.details.xp.value": Math.max(0, value) });
  }

  /** The drawer leaves the tab order while closed; closing it drops a pending reset and gives the focus back to its gear. */
  #setSettings(open) {
    const el = this.element;
    el.classList.toggle("is-settings", open);
    const drawer = el.querySelector('[data-application-part="drawer"]');
    if (drawer) drawer.inert = !open;
    if (open) return;
    el.querySelector('[data-action="openSettings"]')?.focus({ preventScroll: true });
    if (this.askReset) {
      this.askReset = false;
      this.render({ parts: ["drawer"] });
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

  /** Shows a tab; false for one the user hid, which a favorite does not open either. */
  #switchTo(tab) {
    if (!tab || this.element.querySelector(`.aim-tab[data-tab="${tab}"]`)?.hidden) return false;
    if (tab === this.tab) return true;
    this.tab = tab;
    for (const button of this.element.querySelectorAll(".aim-tab")) button.setAttribute("aria-selected", String(button.dataset.tab === tab));
    for (const panel of this.element.querySelectorAll(".aim-panel")) {
      const on = panel.dataset.panel === tab;
      panel.hidden = !on;
      if (!on || !this.motionOn) continue;
      // The panel fades in from below and its entries come in as a short cascade.
      panel.animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: SETTLE });
      cascade(panel, CASCADE);
    }
    this.element.querySelector(".aim-main")?.classList.toggle("is-scrolled", this.element.querySelector(`[data-panel="${tab}"]`)?.scrollTop > 2);
    this.#moveInk();
    return true;
  }

  static #onOpenSettings() {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.render({ parts: ["main"] });
    }
    this.#setSettings(true);
  }

  static #onCloseSettings() {
    this.#setSettings(false);
  }

  static async #onSetSetting(event, target) {
    const { key, value } = target.dataset;
    if (!key || target.disabled) return;
    // A new theme or accent flows over the window instead of switching at once.
    if ((key === "windowTheme" || key === "windowAccent") && document.startViewTransition && this.motionOn) {
      await game.settings.set(MODULE_ID, key, value);
      const html = document.documentElement;
      html.classList.add("aim-vt");
      document.startViewTransition(() => this.#applyRootState()).finished.finally(() => html.classList.remove("aim-vt"));
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

  /** Expanding gives back the width the window had, however narrow the user kept it. */
  static #onCollapse() {
    if (this.position.width > COLLAPSED_WIDTH) this.expandedWidth = this.position.width;
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

  /** Someone aboard opens in their own window, or on their sheet when the window cannot show them. */
  static #onOpenCrew(event, target) {
    const member = fromUuidSync(target.dataset.uuid);
    if (!member?.testUserPermission?.(game.user, "LIMITED")) return;
    if (isSupportedActor(member) && member.testUserPermission(game.user, "OBSERVER")) openActorWindow(member);
    else member.sheet?.render({ force: true });
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
    this.#showRoll(await this.actor.rollHitDie(), '[data-block="hitDice"]');
  }

  /** A roll's result shows beside what was rolled («к8: 5 + 2 = 7»), as well as in the chat. */
  #showRoll(result, selector) {
    const roll = Array.isArray(result) ? result[0] : result;
    if (typeof roll?.total !== "number") return;
    const die = roll.dice?.[0];
    const rolled = die?.total ?? roll.total;
    const mod = roll.total - rolled;
    const text = [
      die ? `${t("AIM.window.rail.die", { faces: die.faces })}: ${rolled}` : String(rolled),
      mod ? ` ${mod > 0 ? "+" : "−"} ${Math.abs(mod)} = ${roll.total}` : ""
    ].join("");
    const anchor = this.element?.querySelector(selector) ?? this.element?.querySelector("[data-hpcard]");
    if (anchor) floatText(this.element, anchor, text, "roll");
  }

  /** Click the n-th mark to set that many; click the last set mark to remove it. */
  static async #onMarkDeath(event, target) {
    if (!this.canEdit) return;
    const kind = target.dataset.kind;
    const current = readRail(this.actor).death[kind];
    const index = Number(target.dataset.index) + 1;
    await this.actor.update({ [`system.attributes.death.${kind}`]: index === current ? index - 1 : index });
  }

  static async #onRollDeathSave(event) {
    if (this.canEdit) this.#showRoll(await this.actor.rollDeathSave({ event }), ".aim-death");
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

  static async #onRollConcentration(event) {
    if (this.canEdit) this.#showRoll(await this.actor.rollConcentration({ event }), ".aim-chip.is-conc");
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
    if (this.rendered) this.#renderAroundBio(["trade", "main"]);
  }

  #tradeSession() {
    return sessionFor(this.actor.id);
  }

  /** After a redraw: the panel's slide, the shakes of the status and of a new error, the chosen partner. */
  #afterTradeRender(options) {
    // A redrawn panel is already where it ends; it starts again from where it was, so opening and closing slide.
    const panel = this.element.querySelector(".aim-trade");
    if (panel && this._tradeShown !== undefined && this._tradeShown !== this.tradeOpen) {
      this.element.classList.toggle("is-trading", this._tradeShown);
      void panel.offsetWidth;
      this.element.classList.toggle("is-trading", this.tradeOpen);
    }
    this._tradeShown = this.tradeOpen;
    // Confirmations reset by an offer change (a new revision) shake the status once; a withdrawn one does not.
    const session = sessionFor(this.actor.id);
    const confirmed = Boolean(session?.confirmed.some(Boolean));
    const prev = this._tradePrev;
    if (prev?.id === session?.id && prev?.confirmed && !confirmed && prev.revision !== session?.revision && session?.status === "open") {
      this.#shake(this.element.querySelector("[data-trade-status]"));
    }
    this._tradePrev = session ? { id: session.id, confirmed, revision: session.revision } : null;
    // An error shakes when it appears or changes, not on each redraw while it stays.
    const error = this.element.querySelector(".aim-trade-err");
    if (error && error.textContent !== this._tradeErrorShown) this.#shake(error);
    this._tradeErrorShown = error?.textContent ?? null;
    // An item that joined either offer slides in; the panel is redrawn whole, so the rest stay put.
    const offered = new Set([...this.element.querySelectorAll("[data-offer-item]")].map((row) => `${row.closest("[data-offer-drop]") ? "mine" : "theirs"}:${row.dataset.offerItem}`));
    if (this._offeredPrev && this.motionOn) {
      for (const row of this.element.querySelectorAll("[data-offer-item]")) {
        if (!this._offeredPrev.has(`${row.closest("[data-offer-drop]") ? "mine" : "theirs"}:${row.dataset.offerItem}`)) row.classList.add("is-new");
      }
    }
    this._offeredPrev = offered;
    // The chosen partner stays selected across redraws until the trade starts.
    if (options.parts.includes("trade")) {
      this.element.querySelector("[data-trade-partner]")?.addEventListener("change", (event) => { this.tradePartner = event.target.value; });
    }
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

  /** «Подарить» starts the same session as a one-way trade (`data-kind="gift"`). */
  static #onTradeStart(event, target) {
    const select = this.element.querySelector("[data-trade-partner]");
    const option = select?.selectedOptions?.[0];
    if (!option || option.disabled || game.user.isGM) return;
    return this.#tradeRequest("start", { targetId: option.value, targetUserId: option.dataset.user, kind: target.dataset.kind });
  }

  /** Toggles this side's confirmation; confirming is accepting, the coordinator moves the assets once both did. */
  static #onTradeConfirm(event, target) {
    const session = this.#tradeSession();
    if (!session || this.tradeDraft.pending) return;
    const side = session.actors.indexOf(this.actor.id);
    if (session.confirmed[side]) return this.#tradeRequest("unconfirm", { sessionId: session.id });
    // The revision drawn on the button: an offer changed a moment ago and not yet redrawn is not what was accepted.
    return this.#tradeRequest("confirm", { sessionId: session.id, revision: Number(target.dataset.revision) });
  }

  /** Nothing has moved yet, so both sides leave at once without a dialog. */
  static #onTradeCancel() {
    const session = this.#tradeSession();
    if (session) return this.#tradeRequest("cancel", { sessionId: session.id });
  }

  static #onTradeQty(event, target) {
    const id = target.dataset.id;
    const item = this.actor.items.get(id);
    if (!item) return this.#dropFromOffer(id);
    const current = this.tradeDraft.offer.items.find((e) => e.id === id)?.quantity ?? 0;
    this.offerItem(item, current + Number(target.dataset.step), { absolute: true });
  }

  /** An item used up or deleted since it was offered can only leave the offer. */
  #dropFromOffer(id) {
    const session = this.#tradeSession();
    if (!session || session.status !== "open" || game.user.isGM || !this.canEdit) return;
    this.tradeDraft.sync(session, session.actors.indexOf(this.actor.id));
    this.tradeDraft.change(offerWithQuantity(this.tradeDraft.offer, id, 0, 0));
    this.renderTrade();
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
    if (session.users[session.actors.indexOf(this.actor.id)] !== game.user.id) return;
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
      if (!item) return this.#dropFromOffer(input.dataset.offerQty);
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
    const focused = this.element.ownerDocument.activeElement;
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
    if (!this.#switchTo(tab)) return;
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
      // Right click on the ready orb still opens the experience card.
      if (event.target.closest(".aim-level")) {
        event.preventDefault();
        this.xpOpen = !this.xpOpen;
        return this.render({ parts: ["main"] });
      }
      const effectRow = event.target.closest("[data-effect-row]");
      if (effectRow) {
        event.preventDefault();
        return this.#openEffectMenu(effectRow, event);
      }
      if (event.target.closest("[data-charge]")) {
        event.preventDefault();
        return this.#changeCharge(this.#itemFrom(event.target), "restore");
      }
      if (event.target.closest("input, textarea, [contenteditable]")) return;
      if (this.#openContextMenu(event)) event.preventDefault();
    });
    el.addEventListener("focusout", (event) => {
      if (event.target.dataset?.coinInput && this.coinEditing) this.#cancelCoin();
      if (event.target.matches?.("[data-uses-input]") && this.usesEditing) this.#cancelUses();
      // Focus left for another control or for the canvas (the field is still there); only a redraw that took the
      // field away keeps the search to give it back.
      if (event.target.name === this._searching && (event.relatedTarget || event.target.isConnected)) this._searching = null;
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
        // Opacity and a short slide, not the height: only transform and opacity animate (#9).
        detail.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: SETTLE });
      }
      const inspector = el.querySelector(".aim-insp");
      if (inspector?.offsetHeight && this.motionOn) inspector.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: SETTLE });
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
      await open.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 160, easing: SETTLE }).finished;
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
    if (!folded && this.motionOn) cascade(section, CASCADE);
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
    // The field closes first; the coin then flips once, on the redraw the actor update brings.
    await this.render({ parts: ["main"] });
    const current = Number(foundry.utils.getProperty(this.actor, `system.currency.${key}`)) || 0;
    if (this.canEdit) await this.actor.update({ [`system.currency.${key}`]: applyCoinEntry(current, entry) });
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
    const item = this.#itemFrom(target);
    if (item && this.canEdit && typeof item.use === "function") return this.#useWithRefusal(item, target, event);
    return useItem(item, event);
  }

  static #onUseActivity(event, target) {
    if (!this.canEdit) return;
    const item = this.#itemFrom(target);
    const activity = item?.system.activities?.get(target.dataset.activityId);
    if (activity) return this.#useWithRefusal(activity, target, event);
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
    if (item) openItemMenu(this.element, target, itemMenuEntries(item, this.#menuActions(item, target)), target.closest("[data-item-id]"));
  }

  /** What the row menu's state entries do: the same paths as the row's own buttons. */
  #menuActions(item, target) {
    const holder = target.closest("[data-item-id]");
    const id = hasFavorites(this.actor) ? favoriteIdFor(this.actor, item) : null;
    return {
      equip: async () => {
        this.#prepareFlight(item, holder?.querySelector(".aim-tile"));
        await toggleItemEquipped(this.actor, item);
      },
      attune: () => this.canEdit && this.attuneWithLimit(item, holder?.querySelector("[data-row]")),
      prepare: async () => {
        this._spellGlide = measure(this.element.querySelector('[data-panel="spells"]'), ".aim-rowwrap");
        await toggleSpellPreparation(item);
      },
      favorite: id && this.canEdit ? async () => {
        this.#measureFavorites();
        if (this.actor.system.hasFavorite(id)) return this.actor.system.removeFavorite(id);
        playBurst(this.element, holder?.querySelector('[data-action="toggleFavorite"]') ?? holder, "inspired");
        await this.actor.system.addFavorite({ type: "item", id });
      } : null,
      isFavorite: Boolean(id && this.actor.system.hasFavorite(id))
    };
  }

  /** A right click on an activity opens its menu; on a row, the row's menu; both at the pointer. */
  #openContextMenu(event) {
    const holder = event.target.closest("[data-item-id]");
    const item = holder && this.#itemFrom(holder);
    if (!item) return false;
    const at = { getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0) };
    const activityTarget = event.target.closest("[data-activity-id]");
    const activity = activityTarget && item.system.activities?.get(activityTarget.dataset.activityId);
    const entries = activity ? activityMenuEntries(activity, activityTarget) : itemMenuEntries(item, this.#menuActions(item, holder));
    openItemMenu(this.element, at, entries, activity ? activityTarget : holder);
    return true;
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
    if (id) return this.#selectAndReveal(id);
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
    if (item && this.canEdit) return this.#useWithRefusal(item, target, event);
  }

  /** A gem spent by this cast bursts in the school's colour, wherever the cast came from. */
  #markCast(item) {
    if (item?.type !== "spell") return;
    this._castSchool = item.system.school;
    clearTimeout(this._castSchoolTimer);
    this._castSchoolTimer = setTimeout(() => { this._castSchool = null; }, 4000);
  }

  /** The tile of an active feature uses it through dnd5e; with no uses left dnd5e refuses and the row shakes. */
  static #onUseFeature(event, target) {
    const item = this.#itemFrom(target);
    if (item && this.canEdit) return this.#useWithRefusal(item, target, event);
  }

  /**
   * An item or an activity used through dnd5e. Used, its tile lands and throws sparks in the spell school's or the
   * rarity's colour; refused (no uses, no slots), the row shakes and says why beside it.
   */
  async #useWithRefusal(doc, target, event) {
    const item = doc.item ?? doc;
    this.#markCast(item);
    const holderOf = () => this.element.querySelector(`[data-key="${target.closest("[data-key]")?.dataset.key}"]`)
      ?? target.closest("[data-fav-id]") ?? target;
    const use = { refused: false, message: null };
    watchNotices(use);
    let result;
    try {
      result = await doc.use({ event });
    } finally {
      unwatchNotices(use);
    }
    const holder = holderOf();
    const row = holder?.querySelector?.("[data-row]") ?? holder;
    if (!result) {
      if (!use.refused) return;
      this.#shake(row);
      if (use.message && row?.isConnected) floatText(this.element, row, use.message, "refused");
      return;
    }
    if (!row?.isConnected || !this.motionOn) return;
    row.classList.remove("is-landed");
    void row.offsetWidth;
    row.classList.add("is-landed");
    row.addEventListener("animationend", () => row.classList.remove("is-landed"), { once: true });
    const school = item.type === "spell" ? item.system.school : null;
    const rarity = item.system.rarity ? `--rarity-${item.system.rarity}` : null;
    playBurst(this.element, row.querySelector(".aim-tile") ?? row, "gem", { token: school ? `--school-${school}` : rarity ?? "--accent" });
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
    if (this.actor.system.hasFavorite(id)) return this.actor.system.removeFavorite(id);
    // A new favorite throws amber sparks from its star.
    playBurst(this.element, target, "inspired");
    await this.actor.system.addFavorite({ type: "item", id });
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
    if (favorite.type === "activity") return doc.canUse === false ? undefined : this.#useWithRefusal(doc, target, event);
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
    if (!this.#switchTo(tab)) return;
    const row = item && this.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"] [data-row]`);
    if (!row) return;
    if (this.selected !== item.id) await this.#selectRow(row);
    this.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"]`)?.scrollIntoView({ block: "nearest", behavior: this.motionOn ? "smooth" : "auto" });
  }

  static #onOpenPresetEditor() {
    return openPresetEditor(this.actor);
  }

  static #onSocketClick(event, target) {
    return this.#selectAndReveal(target.dataset.itemId);
  }

  /** From the doll: the item's details open under its row, which scrolls into view (the inspector needs no scroll). */
  async #selectAndReveal(id) {
    await this.#toggleSelect(id);
    if (this.selected !== id || this.element.dataset.layout === "wide") return;
    this.element.querySelector(`[data-panel="${this.tab}"] .aim-rowwrap[data-item-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: this.motionOn ? "smooth" : "auto" });
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
  // The API, macros included, honours Observer like the sheet button and the key.
  if (!isSupportedActor(actor) || !canViewActor(actor, game.user)) return null;
  const key = actor.uuid ?? actor.id;
  const open = liveWindow(key);
  if (open) {
    // One still preparing its first render comes up by itself.
    if (open.rendered) {
      open.bringToFront?.();
      open.maximize?.();
    }
    return open;
  }
  const app = new ActorWindow(actor);
  // Registered before the first render: a second click while it prepares finds this window, not a new one.
  OPEN_WINDOWS.set(key, app);
  // A first render that throws (broken item data, another module's hook) must not keep the place: the next press opens anew.
  app.render({ force: true }).catch((error) => {
    if (OPEN_WINDOWS.get(key) === app) OPEN_WINDOWS.delete(key);
    LOG.error(`The window of ${actor.name} could not open`, error);
  });
  return app;
}

export function toggleActorWindow(actor) {
  const open = liveWindow(actor?.uuid ?? actor?.id);
  // A second press while the first window is still preparing leaves it be; a minimised one comes back.
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
  // ApplicationV2 states: NONE 0, RENDERING 1, RENDERED 2; closing, closed and failed ones are negative.
  if (open && !(open.state < 0)) return open;
  OPEN_WINDOWS.delete(key);
  return null;
}
