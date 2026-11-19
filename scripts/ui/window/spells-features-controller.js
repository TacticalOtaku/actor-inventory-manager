// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Spells, Features & Favorites Controller
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../../constants.js";
import { reorderFavorites, tabForFavorite } from "../../core/favorites.js";
import { applyUsesEntry } from "../../core/features.js";
import { pipTarget } from "../../core/spellbook.js";
import { toggleSpellPreparation } from "../../integrations/dnd5e.js";
import { playBurst } from "../bursts.js";
import { buildFavoritesContext, favoriteIdFor, hasFavorites } from "../favorites.js";
import { buildFeaturesContext } from "../features.js";
import { glideFrom, measure } from "../motion.js";
import { floatText } from "../rail.js";
import { buildSpellsContext, playSlotChanges, preparationWarning, slotSnapshot } from "../spells.js";

const getSetting = (key) => game.settings.get(MODULE_ID, key);

// Uses waiting on dnd5e, whose dialog may stay open: a warning or error meanwhile marks each one refused.
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

export class SpellsFeaturesController {
  constructor(app) {
    this.app = app;
    this.spellQuery = "";
    this.featureQuery = "";
    this._slotsPrev = null;
    this._prepOver = false;
    this._spellGlide = null;
    this._favGlide = null;
    this._castSchool = null;
    this._castSchoolTimer = null;
    this._templateWatch = null;
  }

  hasSpells() {
    return this.app.actor.items.some((item) => item.type === "spell");
  }

  inlineEditAdapter() {
    return {
      selector: "[data-uses-input]",
      part: "main",
      beforeWrite: false,
      editable: (id) => this.app.canEdit && Boolean(this.app.actor.items.get(id)),
      parse: (id, text) => {
        const uses = this.app.actor.items.get(id)?.system.uses;
        const max = Number(uses?.max) || 0;
        return applyUsesEntry({ value: max - (Number(uses?.spent) || 0), max }, text);
      },
      write: async (id, value) => {
        const item = this.app.actor.items.get(id);
        const max = Number(item.system.uses?.max) || 0;
        if (!await item.update({ "system.uses.spent": max - value })) throw new Error("Uses update refused");
      }
    };
  }

  buildSpellsContext(detail, favIds) {
    return buildSpellsContext(this.app.actor, {
      prefs: getSetting("listPrefs"),
      query: this.spellQuery,
      selectedKey: this.app._equipment.selectedKey,
      detail,
      favIds,
      canEdit: this.app.canEdit,
      collapsed: this.app._equipment.collapsed
    });
  }

  prepWarning() {
    return preparationWarning(this.app.actor);
  }

  buildFeaturesContext(detail, favIds) {
    return buildFeaturesContext(this.app.actor, {
      prefs: getSetting("listPrefs"),
      query: this.featureQuery,
      selectedKey: this.app._equipment.selectedKey,
      detail,
      favIds,
      canEdit: this.app.canEdit,
      collapsed: this.app._equipment.collapsed,
      usesEditing: this.app.usesEditing,
      usesDraft: this.app.usesDraft
    });
  }

  buildFavoritesContext() {
    return buildFavoritesContext(this.app.actor, { canEdit: this.app.canEdit });
  }

  capturePreRender() {
    this._slotsPrev = this.app.element ? slotSnapshot(this.app.element) : null;
    this._prepOver = Boolean(this.app.element?.querySelector("[data-prep-counter].is-over"));
  }

  afterRender() {
    const el = this.app.element;
    playSlotChanges(el, this._slotsPrev, this._castSchool, el.dataset.motion);
    if (this._favGlide) {
      if (this.app.motionOn) glideFrom(el.querySelector("[data-favorites]") ?? el, ".aim-fav", this._favGlide);
      this._favGlide = null;
    }
    const counter = el.querySelector("[data-prep-counter].is-over");
    if (counter && !this._prepOver && this.app.motionOn) this.app.shake(counter);
    if (this._spellGlide) {
      if (this.app.motionOn) glideFrom(el.querySelector('[data-panel="spells"]'), ".aim-rowwrap", this._spellGlide);
      this._spellGlide = null;
    }
  }

  awaitTemplate() {
    if (!this.app.minimized) this.app.minimize();
    clearInterval(this._templateWatch);
    const started = Date.now();
    this._templateWatch = setInterval(() => {
      if (canvas?.templates?.preview?.children?.length && Date.now() - started < 120000) return;
      clearInterval(this._templateWatch);
      if (this.app.rendered) this.app.maximize();
    }, 250);
  }

  markCast(item) {
    if (item?.type !== "spell") return;
    this._castSchool = item.system.school;
    clearTimeout(this._castSchoolTimer);
    this._castSchoolTimer = setTimeout(() => { this._castSchool = null; }, 4000);
  }

  async useWithRefusal(doc, target, event) {
    const item = doc.item ?? doc;
    this.markCast(item);
    const holderOf = () => this.app.element.querySelector(`[data-key="${target.closest("[data-key]")?.dataset.key}"]`)
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
      this.app.shake(row);
      if (use.message && row?.isConnected) floatText(this.app.element, row, use.message, "refused");
      return;
    }
    if (!row?.isConnected || !this.app.motionOn) return;
    row.classList.remove("is-landed");
    void row.offsetWidth;
    row.classList.add("is-landed");
    row.addEventListener("animationend", () => row.classList.remove("is-landed"), { once: true });
    const school = item.type === "spell" ? item.system.school : null;
    const rarity = item.system.rarity ? `--rarity-${item.system.rarity}` : null;
    playBurst(this.app.element, row.querySelector(".aim-tile") ?? row, "gem", { token: school ? `--school-${school}` : rarity ?? "--accent" });
  }

  measureSpellList() {
    this._spellGlide = measure(this.app.element.querySelector('[data-panel="spells"]'), ".aim-rowwrap");
  }

  measureFavorites() {
    const list = this.app.element.querySelector("[data-favorites]");
    if (list) this._favGlide = measure(list, ".aim-fav");
  }

  async addFavorite(favorite) {
    if (!this.app.canEdit || !hasFavorites(this.app.actor) || this.app.actor.system.hasFavorite(favorite.id)) return;
    this.measureFavorites();
    await this.app.actor.system.addFavorite(favorite);
  }

  async reorderFavorite(id, targetId, before) {
    if (!this.app.canEdit) return;
    this.measureFavorites();
    await this.app.actor.update({
      "system.favorites": reorderFavorites(this.app.actor.system.favorites, id, targetId, before)
    });
  }

  favoriteFrom(target) {
    const id = target.closest("[data-fav-id]")?.dataset.favId;
    return this.app.actor.system.favorites?.find((f) => f.id === id) ?? null;
  }

  castSpell(event, target) {
    const item = this.app.itemFrom(target);
    if (item && this.app.canEdit) return this.useWithRefusal(item, target, event);
  }

  async prepareSpell(target) {
    const item = this.app.itemFrom(target);
    if (!item || !this.app.canEdit) return;
    this.measureSpellList();
    await toggleSpellPreparation(item);
  }

  async slotPip(target) {
    if (!this.app.canEdit) return;
    const key = target.dataset.slotKey;
    const value = Number(this.app.actor.system.spells?.[key]?.value) || 0;
    const next = pipTarget(value, Number(target.dataset.index));
    if (next !== value) await this.app.actor.update({ [`system.spells.${key}.value`]: next });
  }

  useFeature(event, target) {
    const item = this.app.itemFrom(target);
    if (item && this.app.canEdit) return this.useWithRefusal(item, target, event);
  }

  editUses(target) {
    if (!this.app.canEdit) return;
    this.app._edits.begin("uses", target.closest("[data-item-id]").dataset.itemId);
  }

  rechargeItem(event, target) {
    const item = this.app.itemFrom(target);
    if (item && this.app.canEdit) return item.system.uses?.rollRecharge?.({ apply: true, event });
  }

  addFeature() {
    if (this.app.canEdit) return Item.implementation.createDialog({ type: "feat" }, { parent: this.app.actor, types: ["feat"] });
  }

  async usePip(target) {
    const item = this.app.itemFrom(target);
    if (!item || !this.app.canEdit) return;
    const max = Number(item.system.uses?.max) || 0;
    const value = max - (Number(item.system.uses?.spent) || 0);
    const next = Math.min(max, pipTarget(value, Number(target.dataset.index)));
    if (next !== value) await item.update({ "system.uses.spent": max - next });
  }

  async toggleFavorite(target) {
    const item = this.app.itemFrom(target);
    if (!item || !this.app.canEdit || !hasFavorites(this.app.actor)) return;
    const id = favoriteIdFor(this.app.actor, item);
    this.measureFavorites();
    if (this.app.actor.system.hasFavorite(id)) return this.app.actor.system.removeFavorite(id);
    playBurst(this.app.element, target, "inspired");
    await this.app.actor.system.addFavorite({ type: "item", id });
  }

  async favUse(event, target) {
    const favorite = this.favoriteFrom(target);
    if (!favorite || !this.app.canEdit) return;
    if (favorite.type === "slots") return this.app.switchTo("spells");
    if (favorite.type === "skill") return this.app.actor.rollSkill({ event, skill: favorite.id });
    if (favorite.type === "tool") return this.app.actor.rollToolCheck({ event, tool: favorite.id });
    const doc = await foundry.utils.fromUuid(favorite.id, { relative: this.app.actor });
    if (!doc) return;
    if (favorite.type === "effect") {
      return doc.isSuppressed
        ? this.app.shake(target.closest("[data-fav-id]"))
        : doc.update({ disabled: !doc.disabled });
    }
    if (favorite.type === "activity") return doc.canUse === false ? undefined : this.useWithRefusal(doc, target, event);
    if (doc.type === "container") return doc.sheet.render({ force: true });
    return this.useWithRefusal(doc, target, event);
  }

  async favOpen(target) {
    const favorite = this.favoriteFrom(target);
    if (!favorite) return;
    if (["effect", "skill", "tool"].includes(favorite.type)) return this.app._effects.revealFavorite(favorite);
    const doc = ["item", "activity"].includes(favorite.type)
      ? await foundry.utils.fromUuid(favorite.id, { relative: this.app.actor })
      : null;
    const item = favorite.type === "activity" ? doc?.item : doc;
    const tab = tabForFavorite({ type: favorite.type, itemType: item?.type });
    if (!this.app.switchTo(tab)) return;
    const row = item && this.app.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"] [data-row]`);
    if (!row) return;
    if (this.app._equipment.selected !== item.id) await this.app._equipment.selectRow(row);
    this.app.element.querySelector(`[data-panel="${tab}"] .aim-rowwrap[data-item-id="${item.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: this.app.motionOn ? "smooth" : "auto" });
  }

  handleKeydown(event) {
    const target = event.target;
    if ((event.key === "Enter" || event.key === " ") && target.matches?.("[data-fav-id]")) {
      event.preventDefault();
      this.favOpen(target);
      return true;
    }
    return false;
  }

  dispose() {
    clearInterval(this._templateWatch);
    clearTimeout(this._castSchoolTimer);
  }
}

export const SPELLS_FEATURES_ACTIONS = {
  castSpell(event, target) { return this._spells.castSpell(event, target); },
  prepareSpell(_event, target) { return this._spells.prepareSpell(target); },
  slotPip(_event, target) { return this._spells.slotPip(target); },
  usePip(_event, target) { return this._spells.usePip(target); },
  useFeature(event, target) { return this._spells.useFeature(event, target); },
  editUses(_event, target) { return this._spells.editUses(target); },
  rechargeItem(event, target) { return this._spells.rechargeItem(event, target); },
  addFeature() { return this._spells.addFeature(); },
  toggleFavorite(_event, target) { return this._spells.toggleFavorite(target); },
  favUse(event, target) { return this._spells.favUse(event, target); },
  favOpen(_event, target) { return this._spells.favOpen(target); }
};
