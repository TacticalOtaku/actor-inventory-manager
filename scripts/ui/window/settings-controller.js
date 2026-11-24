// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Settings Drawer, Root Theme & Layout Controller
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../../constants.js";
import {
  ACCENTS,
  ALWAYS_TAB,
  DENSITIES,
  MOTION_LEVELS,
  SHEET_TABS,
  THEMES,
  effectiveMotion,
  layoutForWidth,
  motionCap,
  normalizeAccent,
  railBlocksFor,
  resolveTheme
} from "../../core/actor-window.js";
import { vitalState } from "../../core/vitals.js";
import { readRail } from "../../integrations/dnd5e.js";
import { closeItemMenu } from "../equipment.js";
import { t } from "../html.js";
import { glide } from "../motion.js";
import { readMotionCaps, schemeIsLight, stampTheme } from "../theme-root.js";

/** Width the collapse button shrinks the window to: the compact layout, rail only. */
const COLLAPSED_WIDTH = 320;
const DEFAULT_WIDTH = 1040;

const getSetting = (key) => game.settings.get(MODULE_ID, key);

const SETTINGS_DEFAULTS = Object.freeze({
  windowTheme: "night",
  windowAccent: "brass",
  windowDensity: "comfortable",
  motionLevel: "full",
  useWebFonts: true,
  compareOnHover: true,
  hiddenRailBlocks: [],
  hiddenTabs: []
});

export class SettingsController {
  constructor(app) {
    this.app = app;
    this.askReset = false;
    // useWebFonts takes effect after a reload; the toggle only marks the change.
    this.fontsAtLoad = Boolean(getSetting("useWebFonts"));
    this.expandedWidth = null;
    this._themeFadeTimer = null;
  }

  buildContext({ hasSpells, hasLegendary, missingTabs, tabLabel, railBlockLabel }) {
    const theme = getSetting("windowTheme");
    const accent = normalizeAccent(getSetting("windowAccent"));
    const density = getSetting("windowDensity");
    const caps = readMotionCaps();
    const chosen = getSetting("motionLevel");
    const level = effectiveMotion(chosen, caps);
    const cap = motionCap(caps);
    const capped = level !== chosen;
    const capReason = caps.reducedMotion
      ? t("AIM.window.settings.capReduced")
      : caps.performanceLow ? t("AIM.window.settings.capPerformance") : "";
    const hiddenBlocks = getSetting("hiddenRailBlocks") ?? [];
    const hiddenTabs = getSetting("hiddenTabs") ?? [];
    const actorType = this.app.actor.type;
    const absent = t(`AIM.window.settings.absent${{ npc: "Npc", vehicle: "Vehicle" }[actorType] ?? ""}`);
    return {
      themes: THEMES.map((id) => ({ id, label: t(`AIM.window.settings.themes.${id}`), active: id === theme })),
      themeHint: theme === "auto"
        ? t("AIM.window.settings.themeNow", { theme: t(`AIM.window.settings.themes.${resolveTheme("auto", schemeIsLight())}`) })
        : "",
      accents: ACCENTS.map((id) => ({ id, label: t(`AIM.window.settings.accents.${id}`), active: id === accent })),
      densities: DENSITIES.map((id) => ({ id, label: t(`AIM.window.settings.densities.${id}`), active: id === density })),
      motions: MOTION_LEVELS.toReversed().map((id) => ({
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
      compareOnHover: Boolean(getSetting("compareOnHover")),
      absentText: absent,
      railBlocks: railBlocksFor(actorType, { hasSpells, hasLegendary }, hiddenBlocks)
        .map(({ id, absent: isAbsent, shown }) => ({ id, absent: isAbsent, shown, label: railBlockLabel(id, actorType) })),
      tabs: SHEET_TABS.map((id) => {
        const locked = id === ALWAYS_TAB || missingTabs.includes(id);
        const note = id === ALWAYS_TAB ? t("AIM.window.settings.always") : locked ? absent : "";
        return { id, label: tabLabel(id), shown: id === ALWAYS_TAB || (!locked && !hiddenTabs.includes(id)), locked, note };
      })
    };
  }

  /** Theme, accent, density, motion and role sit on the window root as data attributes. */
  applyRootState() {
    const el = this.app.element;
    if (!el) return;
    stampTheme(el, { fonts: this.fontsAtLoad });
    el.dataset.role = this.app.canEdit ? (game.user.isGM ? "gm" : "owner") : "observer";
    el.classList.toggle("is-trading", this.app.trade.open);
    const tradePart = el.querySelector('[data-application-part="trade"]');
    if (tradePart) tradePart.inert = el.classList.contains("is-settings") || !this.app.trade.open;
    el.dataset.actorType = this.app.actor.type;
    const { hp } = readRail(this.app.actor);
    el.dataset.vital = vitalState(hp.value, hp.max);
  }

  /** Every block glides to its new place when the width crosses a layout boundary. */
  applyLayout({ animate = true } = {}) {
    const el = this.app.element;
    if (!el) return;
    const next = layoutForWidth(el.offsetWidth);
    if (el.dataset.layout === next) return;
    // A tooltip over a block that the new layout hides would otherwise stay on screen.
    game.tooltip?.deactivate?.();
    const change = () => {
      const focus = el.ownerDocument.activeElement;
      const prior = el.dataset.layout;
      el.dataset.layout = next;
      if (!focus || !el.contains(focus)) return;
      if (next === "compact" && focus.closest(".aim-main, .aim-inspector")) {
        el.querySelector('[data-action="expandWindow"]')?.focus({ preventScroll: true });
      } else if (prior === "compact" && focus.matches('[data-action="expandWindow"]')) {
        el.querySelector('[data-action="collapseWindow"]')?.focus({ preventScroll: true });
      } else if (next !== "wide" && focus.closest(".aim-inspector")) {
        el.querySelector('.aim-tab[aria-selected="true"]')?.focus();
      }
    };
    if (!animate || !el.dataset.layout || !this.app.motionOn) change();
    else glide(el, "[data-flip]", change);
    requestAnimationFrame(() => {
      this.app.moveInk();
      this.app.railEdges();
    });
  }

  /** The drawer leaves the tab order while closed; closing it drops a pending reset and gives the focus back to its gear. */
  setSettings(open) {
    const el = this.app.element;
    el.classList.toggle("is-settings", open);
    this.syncDrawer(open);
    if (open) {
      closeItemMenu(el);
      el.querySelector('.aim-drawer-head [data-action="closeSettings"]')?.focus({ preventScroll: true });
      return;
    }
    const trigger = el.dataset.layout === "compact" ? "expandWindow" : "openSettings";
    el.querySelector(`[data-action="${trigger}"]`)?.focus({ preventScroll: true });
    if (this.askReset) {
      this.askReset = false;
      this.app.render({ parts: ["drawer"] });
    }
  }

  syncDrawer(open) {
    const drawer = this.app.element.querySelector('[data-application-part="drawer"]');
    if (drawer) {
      drawer.inert = !open;
      drawer.querySelector(".aim-drawer")?.setAttribute("aria-modal", String(open));
    }
    for (const part of this.app.element.querySelectorAll(
      '[data-application-part="rail"], [data-application-part="main"], [data-application-part="inspector"], [data-application-part="trade"]'
    )) {
      part.inert = open || (part.dataset.applicationPart === "trade" && !this.app.trade.open);
    }
  }

  restoreDrawerFocus(content, drawerFocus) {
    if (!drawerFocus || !this.app.element.classList.contains("is-settings")) return;
    const newDrawer = content.querySelector('[data-application-part="drawer"]');
    if (!newDrawer) return;
    newDrawer.inert = false;
    const keys = ["action", "key", "value", "settingToggle", "railToggle", "tabToggle"];
    const match = [...newDrawer.querySelectorAll("button:not(:disabled), input:not(:disabled)")]
      .find((control) => keys.every((key) => control.dataset[key] === drawerFocus.dataset[key]));
    (match ?? newDrawer.querySelector('.aim-drawer-head [data-action="closeSettings"]'))
      ?.focus({ preventScroll: true });
  }

  async setAndRefresh(key, value) {
    await game.settings.set(MODULE_ID, key, value);
    // The settings' onChange redraws every window; the drawer of this one refreshes too.
    await this.app.render({ parts: ["drawer"] });
  }

  async toggleListed(key, id, hide) {
    const list = new Set(getSetting(key) ?? []);
    if (hide) list.add(id);
    else list.delete(id);
    await this.setAndRefresh(key, [...list]);
  }

  handleChange(input) {
    if (input.dataset.settingToggle) {
      this.setAndRefresh(input.dataset.settingToggle, input.checked);
      return true;
    }
    if (input.dataset.railToggle) {
      this.toggleListed("hiddenRailBlocks", input.dataset.railToggle, !input.checked);
      return true;
    }
    if (input.dataset.tabToggle) {
      this.toggleListed("hiddenTabs", input.dataset.tabToggle, !input.checked);
      return true;
    }
    return false;
  }

  open() {
    this.app._rail.closeMenuIfOpen();
    this.setSettings(true);
  }

  close() {
    this.setSettings(false);
  }

  async setSetting(target) {
    const { key, value } = target.dataset;
    if (!key || target.disabled) return;
    // A new theme or accent transitions locally inside the window without blocking Foundry's canvas.
    if ((key === "windowTheme" || key === "windowAccent") && this.app.motionOn) {
      await game.settings.set(MODULE_ID, key, value);
      const el = this.app.element;
      if (el) {
        clearTimeout(this._themeFadeTimer);
        el.classList.add("aim-theme-fade");
        void el.offsetWidth;
        this.applyRootState();
        this._themeFadeTimer = setTimeout(() => el.classList.remove("aim-theme-fade"), 300);
      } else {
        this.applyRootState();
      }
      return this.app.render({ parts: ["drawer"] });
    }
    await this.setAndRefresh(key, value);
  }

  askResetPrompt() {
    this.askReset = true;
    this.app.render({ parts: ["drawer"] });
  }

  cancelReset() {
    this.askReset = false;
    this.app.render({ parts: ["drawer"] });
  }

  async confirmReset() {
    this.askReset = false;
    for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
      await game.settings.set(MODULE_ID, key, value);
    }
    await this.app.render({ parts: ["drawer"] });
  }

  collapse() {
    if (this.app.position.width > COLLAPSED_WIDTH) this.expandedWidth = this.app.position.width;
    this.app.setPosition({ width: COLLAPSED_WIDTH });
  }

  expand() {
    this.app.setPosition({ width: this.expandedWidth ?? DEFAULT_WIDTH });
  }

  dispose() {
    clearTimeout(this._themeFadeTimer);
  }
}

export const SETTINGS_ACTIONS = {
  openSettings() { return this._settings.open(); },
  closeSettings() { return this._settings.close(); },
  setSetting(event, target) { return this._settings.setSetting(target); },
  askReset() { return this._settings.askResetPrompt(); },
  cancelReset() { return this._settings.cancelReset(); },
  confirmReset() { return this._settings.confirmReset(); },
  reloadPage: () => foundry.utils.debouncedReload(),
  collapseWindow() { return this._settings.collapse(); },
  expandWindow() { return this._settings.expand(); }
};
