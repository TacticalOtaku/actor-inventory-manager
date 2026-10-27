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
import { applyCoinEntry, chargeChange, listPrefsFor, parseCoinEntry, withListPref } from "../core/inventory.js";
import { parseHpEntry, previewHp, vitalState } from "../core/vitals.js";
import { readAbilities, readIdentity, readRail } from "../integrations/dnd5e.js";
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
import { bindInventoryDrag } from "./inventory-drag.js";
import { toggleAttunement, toggleItemEquipped, useItem } from "./item-actions.js";
import { WEIGHTY_CONTAINERS_MODULE_ID, openWeightyContainersDialog } from "../integrations/weighty-containers.js";
import { SETTLE, glide } from "./motion.js";
import { REST_HOOK, buildRailContext, openStatConfig, playLongRest, playRailChanges, railSnapshot, startRuneGlints } from "./rail.js";

const TEMPLATES = `modules/${MODULE_ID}/templates/window`;

/** Open windows, keyed by actor UUID (a token actor gets its own window). */
const OPEN_WINDOWS = new Map();

/** Bursts of document hooks become one render. */
const RENDER_COALESCE_MS = 40;

/** Width the collapse button shrinks the window to: the compact layout, rail only. */
const COLLAPSED_WIDTH = 320;

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const signed = (n) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

function windowIdFor(actor) {
  return `${MODULE_ID}-window-${String(actor.uuid ?? actor.id).replace(/[^\w-]/g, "-")}`;
}

const getSetting = (key) => game.settings.get(MODULE_ID, key);

/** Caps the OS and Foundry put on motion (#9). */
function readMotionCaps() {
  return {
    reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    performanceLow: document.body.classList.contains("performance-low")
  };
}

/** Foundry resolves its application colour scheme (or the browser's) into a body class. */
const schemeIsLight = () => document.body.classList.contains("theme-light");

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
      openEffect: ActorWindow.#onOpenEffect,
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
      containerRules: ActorWindow.#onContainerRules
    }
  };

  static PARTS = {
    rail: { template: `${TEMPLATES}/rail.hbs` },
    main: { template: `${TEMPLATES}/main.hbs`, templates: EQUIPMENT_TEMPLATES, scrollable: [".aim-panel"] },
    inspector: { template: `${TEMPLATES}/inspector.hbs`, templates: EQUIPMENT_TEMPLATES, scrollable: [""] },
    drawer: { template: `${TEMPLATES}/drawer.hbs`, scrollable: [".aim-drawer-body"] }
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
    if (!selected) this.selected = null;
    const detail = selected ? await buildItemDetail(selected, { canEdit: this.canEdit }) : null;
    return {
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
        canEdit: this.canEdit,
        folds: getSetting("trayFolds") ?? {}
      }),
      inspector: selected ? buildInspector(selected, detail) : null,
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
    const shown = visibleTabs({ hidden, missing });
    return SHEET_TABS.map((id) => ({ id, label: t(`AIM.window.tabs.${id}`), hidden: !shown.includes(id) }));
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
    const mine = (doc) => doc?.uuid === this.actorKey || doc?.parent?.uuid === this.actorKey;
    this.#hook("updateActor", (actor) => mine(actor) && rerender());
    // A transformed actor is deleted when it reverts; its window goes with it.
    this.#hook("deleteActor", (actor) => actor?.uuid === this.actorKey && this.close());
    for (const name of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
      this.#hook(name, (doc) => mine(doc) && rerender());
    }
    this.#hook(REFRESH_HOOK, rerender);
    // Weighty Containers announces a rules change on its own hook; the trays' bands and reductions follow.
    this.#hook(`${WEIGHTY_CONTAINERS_MODULE_ID}.updateContainerRules`, rerender);
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
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    this._equipmentPrev = this.element ? equipmentSnapshot(this.element) : null;
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
    for (const [name, id] of this._hooks) Hooks.off(name, id);
    this._hooks = [];
    this._bodyObserver?.disconnect();
    this._resizeObserver?.disconnect();
    this._reducedMotion?.removeEventListener("change", this._onReducedMotion);
    clearTimeout(this._renderTimer);
    clearTimeout(this._searchTimer);
    clearInterval(this._glints);
    OPEN_WINDOWS.delete(this.actorKey);
    super._onClose(options);
  }

  #hook(name, fn) {
    this._hooks.push([name, Hooks.on(name, fn)]);
  }

  #queueRender() {
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this.rendered && this.render(), RENDER_COALESCE_MS);
  }

  /** Theme, accent, density, motion and role sit on the window root as data attributes. */
  #applyRootState() {
    const el = this.element;
    if (!el) return;
    el.dataset.theme = resolveTheme(getSetting("windowTheme"), schemeIsLight());
    el.dataset.accent = normalizeAccent(getSetting("windowAccent"));
    el.dataset.density = getSetting("windowDensity");
    el.dataset.motion = effectiveMotion(getSetting("motionLevel"), readMotionCaps());
    el.dataset.fonts = this.fontsAtLoad ? "web" : "system";
    el.dataset.role = this.canEdit ? (game.user.isGM ? "gm" : "owner") : "observer";
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
    if (input.name === "inventorySort") return this.#savePrefs({ sort: input.value }).then(() => this.render({ parts: ["main"] }));
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
    const tab = target.dataset.tab;
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

  static async #onOpenEffect(event, target) {
    (await fromUuid(target.dataset.effectUuid))?.sheet?.render({ force: true });
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

  static #onEndConcentration() {
    if (this.canEdit) return this.actor.endConcentration();
  }

  /* ─── Equipment tab ─── */

  /** Listeners the equipment tab needs beyond click actions, delegated once on the window. */
  #bindEquipment() {
    const el = this.element;
    el.addEventListener("pointerdown", (event) => {
      if (!event.target.closest?.('[name="inventorySearch"]')) this._searching = false;
    });
    el.addEventListener("click", (event) => {
      const row = event.target.closest("[data-row]");
      if (row && !event.target.closest("button, input, a, label, select")) this.#toggleSelect(row.closest("[data-item-id]").dataset.itemId);
    });
    el.addEventListener("input", (event) => {
      if (event.target.dataset.coinInput) this.coinDraft = event.target.value;
      if (event.target.name !== "inventorySearch") return;
      this.query = event.target.value;
      // The search field is redrawn while typing; it keeps the focus and the caret.
      this._searching = true;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this.render({ parts: ["main"] }), 120);
    });
    el.addEventListener("contextmenu", (event) => {
      if (!event.target.closest("[data-charge]")) return;
      event.preventDefault();
      this.#changeCharge(this.#itemFrom(event.target), "restore");
    });
    el.addEventListener("focusout", (event) => {
      if (event.target.dataset?.coinInput && this.coinEditing) this.#cancelCoin();
      if (event.target.name === "inventorySearch" && event.relatedTarget) this._searching = false;
    });
    bindInventoryDrag(this);
  }

  /** Enter or Space selects a focused row and toggles a focused section header; the coin field reads Enter and Esc. */
  #onEquipmentKey(event) {
    const target = event.target;
    if (target.dataset?.coinInput) {
      if (event.key === "Enter") { event.preventDefault(); this.#applyCoin(target.value); }
      else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); this.#cancelCoin(); }
      else return false;
      return true;
    }
    if (event.key !== "Enter" && event.key !== " ") return false;
    if (target.matches?.("[data-row]")) {
      event.preventDefault();
      this.#toggleSelect(target.closest("[data-item-id]").dataset.itemId);
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
    playEquipmentChanges(el, this._equipmentPrev, el.dataset.motion);
    const coin = el.querySelector("[data-coin-input]");
    if (coin) {
      coin.focus();
      coin.setSelectionRange(coin.value.length, coin.value.length);
    }
    const search = el.querySelector('[name="inventorySearch"]');
    if (search && this._searching && !coin) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
    if (this._openDetail) {
      this._openDetail = false;
      const detail = el.querySelector(`.aim-rowwrap[data-item-id="${this.selected}"] [data-detail]`);
      if (detail?.offsetHeight && this.motionOn) {
        detail.animate([{ height: "0px", opacity: 0 }, { height: `${detail.offsetHeight}px`, opacity: 1 }], { duration: 260, easing: SETTLE });
      }
    }
  }

  #itemFrom(node) {
    return this.actor.items.get(node?.closest("[data-item-id]")?.dataset.itemId);
  }

  async #savePrefs(patch) {
    await game.settings.set(MODULE_ID, "listPrefs", withListPref(getSetting("listPrefs") ?? {}, "equipment", patch));
  }

  /** Click selects: the inspector shows it in the wide layout, otherwise its details open under the row; again deselects. */
  async #toggleSelect(id) {
    const closing = this.selected === id;
    const open = this.selected && this.element.querySelector(`.aim-rowwrap[data-item-id="${this.selected}"] [data-detail]`);
    if (open?.offsetHeight && this.motionOn) {
      await open.animate([{ height: `${open.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { duration: 200, easing: SETTLE }).finished;
    }
    this.selected = closing ? null : id;
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
    const panel = this.element.querySelector('[data-panel="equipment"]');
    const apply = () => {
      for (const list of panel.querySelectorAll(".aim-section:not([data-section=container]) .aim-items")) list.dataset.view = view;
      for (const button of panel.querySelectorAll("[data-action=listView]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
      for (const row of panel.querySelectorAll(".aim-section:not([data-section=container]) [data-row]")) {
        if (view === "icons") row.dataset.tooltip = row.querySelector(".aim-row-name")?.textContent ?? "";
        else delete row.dataset.tooltip;
      }
    };
    if (this.motionOn) glide(panel, "[data-row]", apply); else apply();
    await this.#savePrefs({ view });
  }

  static async #onListFilter(event, target) {
    const { filters } = listPrefsFor(getSetting("listPrefs"), "equipment");
    const id = target.dataset.filter;
    await this.#savePrefs({ filters: filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id] });
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

  static #onEquipItem(event, target) {
    const item = this.#itemFrom(target);
    if (item) return toggleItemEquipped(this.actor, item);
  }

  /** Past the attunement limit a new attunement is refused with a shake of the row. */
  static #onAttuneItem(event, target) {
    const item = this.#itemFrom(target);
    if (!item || !this.canEdit) return;
    const max = getActorAttunementMax(this.actor);
    if (!isItemAttuned(item) && countAttunedItems(this.actor) >= max) {
      const row = target.closest("[data-item-id]")?.querySelector("[data-row]");
      row?.classList.remove("is-refused");
      void row?.offsetWidth;
      row?.classList.add("is-refused");
      row?.addEventListener("animationend", () => row.classList.remove("is-refused"), { once: true });
      ui.notifications.warn(t("AIM.notifications.maxAttunementReached", { max }));
      return;
    }
    return toggleAttunement(item);
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
