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
import { parseHpEntry, previewHp, vitalState } from "../core/vitals.js";
import { readAbilities, readIdentity, readRail } from "../integrations/dnd5e.js";
import { LOG } from "../foundry/logger.js";
import { glide } from "./motion.js";
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
      endConcentration: ActorWindow.#onEndConcentration
    }
  };

  static PARTS = {
    rail: { template: `${TEMPLATES}/rail.hbs` },
    main: { template: `${TEMPLATES}/main.hbs`, scrollable: [".aim-panel"] },
    inspector: { template: `${TEMPLATES}/inspector.hbs` },
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
    if (event.key !== "Escape") return;
    if (this.element.classList.contains("is-settings")) {
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
