// ─────────────────────────────────────────────────────────
// AIM: Actor Window - Equipment, Paperdoll & Loadouts Controller
// ─────────────────────────────────────────────────────────

import { FLAGS, MODULE_ID } from "../../constants.js";
import { countAttunedItems, getActorAttunementMax, isItemAttuned } from "../../core/attunement.js";
import { getActorEquippedMap } from "../../core/equipment-rules.js";
import { LIST_FILTERS, applyCoinEntry, chargeChange, listPrefsFor, parseCoinEntry } from "../../core/inventory.js";
import { FEATURE_FILTERS } from "../../core/features.js";
import { SPELL_FILTERS } from "../../core/spellbook.js";
import { isTwoHandedWeapon } from "../../core/item-classifier.js";
import { DEFAULT_LOADOUT_ICON, LOADOUT_ICONS } from "../../core/loadouts.js";
import { setActorPaperdollTemplate } from "../../core/paperdoll-templates.js";
import { applyActorLoadout, deleteActorLoadout, getActorLoadouts, renameActorLoadout, saveActorLoadout } from "../../foundry/loadouts.js";
import { toggleSpellPreparation } from "../../integrations/dnd5e.js";
import { openWeightyContainersDialog } from "../../integrations/weighty-containers.js";
import { playBurst } from "../bursts.js";
import { buildDollContext, firstItemFor } from "../doll.js";
import {
  activityMenuEntries,
  buildEquipmentContext,
  buildInspector,
  equipmentSnapshot,
  itemMenuEntries,
  openItemMenu,
  playEquipmentChanges
} from "../equipment.js";
import { hasFavorites, favoriteIdFor } from "../favorites.js";
import { escapeHTML, t } from "../html.js";
import { equipItemToSlot, toggleAttunement, toggleItemEquipped, unequipItem, useItem } from "../item-actions.js";
import { SETTLE, cascade, glide } from "../motion.js";
import { openPresetEditor } from "../preset-editor.js";
import { isNewItem } from "../trade.js";

const CASCADE = ".aim-rowwrap > [data-row], .aim-effwrap, .aim-check, .aim-card";
const TAB_FILTERS = { equipment: LIST_FILTERS, spells: SPELL_FILTERS, features: FEATURE_FILTERS };
const getSetting = (key) => game.settings.get(MODULE_ID, key);

function suggestLoadoutName(actor, existingCount) {
  const map = getActorEquippedMap(actor);
  const main = map.get("mainHand");
  const off = map.get("offHand");
  if (main && off) {
    const pair = `${main.name} + ${off.name}`;
    if (pair.length <= 32) return pair;
  }
  if (main && main.name.length <= 32) return main.name;
  return t("AIM.window.loadouts.defaultName", { n: existingCount + 1 });
}

function suggestLoadoutIcon(actor) {
  const map = getActorEquippedMap(actor);
  const main = map.get("mainHand");
  const off = map.get("offHand");
  if (main?.type === "weapon") {
    const val = main.system?.type?.value;
    if (val === "simpleR" || val === "martialR") return "fa-crosshairs";
    if (isTwoHandedWeapon(main)) return "fa-hand-fist";
  }
  if (off?.system?.type?.value === "shield") return "fa-shield-halved";
  if (map.size === 0) return "fa-campfire";
  return DEFAULT_LOADOUT_ICON;
}

async function promptLoadoutDialog({ title, initialName, initialIcon }) {
  const icons = LOADOUT_ICONS.map((ico) => `
    <label class="aim-loadout-icon-opt" title="${escapeHTML(ico)}">
      <input type="radio" name="icon" value="${escapeHTML(ico)}" ${ico === initialIcon ? "checked" : ""}>
      <span><i class="fa-light ${escapeHTML(ico)}" aria-hidden="true"></i></span>
    </label>
  `).join("");
  const content = `
    <div class="aim-loadout-dialog">
      <label class="aim-loadout-field">
        <span>${escapeHTML(t("AIM.window.loadouts.name"))}</span>
        <input type="text" name="name" value="${escapeHTML(initialName)}" maxlength="40" required autofocus>
      </label>
      <div class="aim-loadout-field">
        <span>${escapeHTML(t("AIM.window.loadouts.icon"))}</span>
        <div class="aim-loadout-icons">${icons}</div>
      </div>
    </div>
  `;
  return foundry.applications.api.DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: t("AIM.window.save"),
      callback: (_event, button) => {
        const name = button.form.elements.name.value.trim();
        const icon = button.form.elements.icon.value || DEFAULT_LOADOUT_ICON;
        return name ? { name, icon } : null;
      }
    },
    rejectClose: false
  });
}

export class EquipmentController {
  constructor(app) {
    this.app = app;
    this.query = "";
    this.collapsed = new Set();
    this.selected = null;
    this.selectedKey = null;
    this._flight = null;
    this._equipmentPrev = null;
    this._openDetail = false;
    this._searching = null;
    this._searchTimer = null;
    this._landed = null;
  }

  inlineEditAdapter() {
    return {
      selector: "[data-coin-input]",
      part: "main",
      beforeWrite: true,
      editable: (key) => this.app.canEdit && Object.hasOwn(this.app.actor.system.currency ?? {}, key),
      parse: (_target, text) => parseCoinEntry(text),
      write: async (key, entry) => {
        const current = Number(foundry.utils.getProperty(this.app.actor, `system.currency.${key}`)) || 0;
        if (!await this.app.actor.update({ [`system.currency.${key}`]: applyCoinEntry(current, entry) })) {
          throw new Error("Coin update refused");
        }
      }
    };
  }

  buildContext(detail, favIds) {
    return buildEquipmentContext(this.app.actor, {
      prefs: getSetting("listPrefs"),
      query: this.query,
      collapsed: this.collapsed,
      selected: this.selected,
      detail,
      coinEditing: this.app.coinEditing,
      coinDraft: this.app.coinDraft,
      favIds,
      canEdit: this.app.canEdit,
      folds: getSetting("trayFolds") ?? {}
    });
  }

  buildInspector(selectedItem, detail) {
    return buildInspector(selectedItem, detail);
  }

  buildDollContext() {
    return buildDollContext(this.app.actor, {
      canEdit: this.app.canEdit,
      selected: this.selected,
      hidden: Boolean(getSetting("dollHidden"))
    });
  }

  capturePreRender() {
    this._equipmentPrev = this.app.element ? equipmentSnapshot(this.app.element) : null;
  }

  afterRender() {
    const el = this.app.element;
    this.fly();
    playEquipmentChanges(el, this._equipmentPrev, el.dataset.motion);
    this.bindLoadoutToolbar();
    const coin = el.querySelector("[data-coin-input], [data-uses-input]");
    const search = this._searching && el.querySelector(`[name="${this._searching}"]`);
    if (search && !coin) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
    if (this._openDetail) {
      this._openDetail = false;
      const detail = el.querySelector(`.aim-rowwrap[data-key="${this.selectedKey}"] [data-detail]`);
      if (detail?.offsetHeight && this.app.motionOn) {
        // Opacity and a short slide, not the height: only transform and opacity animate (#9).
        detail.animate([{ opacity: 0, transform: "translateY(-6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: SETTLE });
      }
      const inspector = el.querySelector(".aim-insp");
      if (inspector?.offsetHeight && this.app.motionOn) {
        inspector.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: SETTLE });
      }
    }
  }

  /** Roving tabindex fallback for the Loadouts toolbar when native `focusgroup` is unsupported. */
  bindLoadoutToolbar() {
    const bar = this.app.element?.querySelector('.aim-loadouts[role="toolbar"]');
    if (!bar || "focusGroup" in HTMLElement.prototype) return;
    const buttons = [...bar.querySelectorAll("button")];
    if (!buttons.length) return;
    const currentIndex = buttons.findIndex((b) => b.getAttribute("aria-pressed") === "true");
    const activeIndex = currentIndex >= 0 ? currentIndex : 0;
    buttons.forEach((b, i) => { b.tabIndex = i === activeIndex ? 0 : -1; });
    if (bar.dataset.rovingBound) return;
    bar.dataset.rovingBound = "1";
    bar.addEventListener("focusin", ({ target }) => {
      const items = [...bar.querySelectorAll("button")];
      if (items.includes(target)) items.forEach((b) => { b.tabIndex = b === target ? 0 : -1; });
    });
    bar.addEventListener("keydown", (event) => {
      const items = [...bar.querySelectorAll("button")];
      const idx = items.indexOf(event.target);
      if (idx < 0) return;
      const rtl = getComputedStyle(bar).direction === "rtl";
      const steps = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
      let next = null;
      if (event.key in steps) next = (idx + steps[event.key] + items.length) % items.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      if (next === null) return;
      event.preventDefault();
      items[next]?.focus({ preventScroll: true });
    });
  }

  landItems(ids) {
    this._landed = new Set([...(this._landed ?? []), ...ids]);
  }

  playLanding() {
    if (!this._landed?.size) return;
    for (const id of this._landed) {
      const row = this.app.element.querySelector(`[data-panel="${this.app.tab}"] [data-item-id="${CSS.escape(id)}"] [data-row]`);
      if (!row) continue;
      this._landed.delete(id);
      if (!this.app.motionOn) continue;
      row.classList.add("is-landed");
      row.addEventListener("animationend", () => row.classList.remove("is-landed"), { once: true });
    }
  }

  clearSearchIfAway(target) {
    if (target.name !== this._searching) this._searching = null;
  }

  handleSearchInput(input, searchField) {
    this.app[searchField] = input.value;
    this._searching = input.name;
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.app.render({ parts: ["main"] }), 120);
  }

  handleFocusOut(event) {
    if (event.target.name === this._searching && (event.relatedTarget || event.target.isConnected)) {
      this._searching = null;
    }
  }

  handleKeydown(event) {
    const target = event.target;
    if (event.key === "Delete" && !event.repeat && this.app.canEdit && target.matches?.(".aim-slot, .aim-socket, .aim-slotless-item")) {
      const control = (target.closest(".aim-slot-wrap") ?? target).querySelector(".aim-slot-x[data-action]");
      if (control) {
        event.preventDefault();
        this.app.constructor.DEFAULT_OPTIONS.actions[control.dataset.action]?.call(this.app, event, control);
        return true;
      }
    }
    if (target.matches?.("[data-coin-input], [data-uses-input]")) return true;
    if (event.key !== "Enter" && event.key !== " ") return false;
    if (target.matches?.("[data-row]")) {
      event.preventDefault();
      this.selectRow(target);
      return true;
    }
    if (target.matches?.('[data-action="toggleSection"]')) {
      event.preventDefault();
      this.foldSection(target);
      return true;
    }
    return false;
  }

  handleChange(input) {
    if (input.name === "dollPreset" && input.value && game.user.isGM) {
      setActorPaperdollTemplate(this.app.actor, input.value);
      return true;
    }
    if (input.name === "inventorySort") {
      this.app.savePrefs({ sort: input.value }).then(() => this.app.render({ parts: ["main"] }));
      return true;
    }
    return false;
  }

  selectRow(row) {
    const wrap = row.closest("[data-item-id]");
    return this.toggleSelect(wrap.dataset.itemId, wrap.dataset.key);
  }

  async toggleSelect(id, key = id) {
    const closing = this.selectedKey === key;
    const item = this.app.actor.items.get(id);
    if (!closing && isNewItem(item) && item.isOwner) item.unsetFlag(MODULE_ID, FLAGS.TRADE_NEW);
    const open = this.selectedKey && this.app.element.querySelector(`.aim-rowwrap[data-key="${this.selectedKey}"] [data-detail]`);
    if (open?.offsetHeight && this.app.motionOn) {
      await open.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 160, easing: SETTLE }).finished;
    }
    this.selected = closing ? null : id;
    this.selectedKey = closing ? null : key;
    this._openDetail = !closing;
    await this.app.render({ parts: ["main", "inspector"] });
  }

  async selectAndReveal(id) {
    await this.toggleSelect(id);
    if (this.selected !== id || this.app.element.dataset.layout === "wide") return;
    this.app.element.querySelector(`[data-panel="${this.app.tab}"] .aim-rowwrap[data-item-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: this.app.motionOn ? "smooth" : "auto" });
  }

  foldSection(head) {
    const section = head.closest(".aim-section");
    const id = head.dataset.sectionId;
    const folded = !this.collapsed.has(id);
    if (folded) this.collapsed.add(id);
    else this.collapsed.delete(id);
    section.classList.toggle("is-collapsed", folded);
    head.setAttribute("aria-expanded", String(!folded));
    if (!folded && this.app.motionOn) cascade(section, CASCADE);
  }

  async changeCharge(item, direction) {
    if (!item || !this.app.canEdit) return;
    const { max = 0, spent = 0 } = item.system.uses ?? {};
    const next = chargeChange(spent, max, direction);
    if (next !== spent) await item.update({ "system.uses.spent": next });
  }

  async listView(target) {
    const view = target.dataset.view;
    const tab = target.dataset.tab ?? "equipment";
    const panel = this.app.element.querySelector(`[data-panel="${tab}"]`);
    const apply = () => {
      for (const list of panel.querySelectorAll(".aim-section:not([data-section=container]) .aim-items")) list.dataset.view = view;
      for (const button of panel.querySelectorAll("[data-action=listView]")) button.setAttribute("aria-pressed", String(button.dataset.view === view));
      for (const row of panel.querySelectorAll(".aim-section:not([data-section=container]) [data-row]")) {
        if (view === "icons") row.dataset.tooltip = row.querySelector(".aim-row-name")?.textContent ?? "";
        else delete row.dataset.tooltip;
      }
    };
    if (this.app.motionOn) glide(panel, "[data-row]", apply);
    else apply();
    await this.app.savePrefs({ view }, tab);
  }

  async listFilter(target) {
    const tab = target.dataset.tab ?? "equipment";
    const { filters } = listPrefsFor(getSetting("listPrefs"), tab, TAB_FILTERS[tab]);
    const id = target.dataset.filter;
    await this.app.savePrefs({ filters: filters.includes(id) ? filters.filter((f) => f !== id) : [...filters, id] }, tab);
    this.app.render({ parts: ["main"] });
  }

  addItem(target) {
    if (!this.app.canEdit) return;
    const type = target.dataset.type;
    return Item.implementation.createDialog({ type }, { parent: this.app.actor, types: [type] });
  }

  useItem(event, target) {
    const item = this.app.itemFrom(target);
    if (item && this.app.canEdit && typeof item.use === "function") return this.app._spells.useWithRefusal(item, target, event);
    return useItem(item, event);
  }

  useActivity(event, target) {
    if (!this.app.canEdit) return;
    const item = this.app.itemFrom(target);
    const activity = item?.system.activities?.get(target.dataset.activityId);
    if (activity) return this.app._spells.useWithRefusal(activity, target, event);
  }

  async equipItem(target) {
    const item = this.app.itemFrom(target);
    if (!item) return;
    this.prepareFlight(item, target.closest("[data-item-id]")?.querySelector(".aim-tile"));
    await toggleItemEquipped(this.app.actor, item);
  }

  attuneItem(target) {
    const item = this.app.itemFrom(target);
    if (item && this.app.canEdit) return this.attuneWithLimit(item, target.closest("[data-item-id]")?.querySelector("[data-row]"));
  }

  stepQty(target) {
    const item = this.app.itemFrom(target);
    if (!item || !this.app.canEdit) return;
    const next = Math.max(0, (Number(item.system.quantity) || 0) + Number(target.dataset.step));
    if (next !== item.system.quantity) return item.update({ "system.quantity": next });
  }

  spendCharge(target) {
    return this.changeCharge(this.app.itemFrom(target), "spend");
  }

  itemMenu(target) {
    const item = this.app.itemFrom(target);
    if (item) openItemMenu(this.app.element, target, itemMenuEntries(item, this.menuActions(item, target)), target.closest("[data-item-id]"));
  }

  menuActions(item, target) {
    const holder = target.closest("[data-item-id]");
    const id = hasFavorites(this.app.actor) ? favoriteIdFor(this.app.actor, item) : null;
    return {
      equip: async () => {
        this.prepareFlight(item, holder?.querySelector(".aim-tile"));
        await toggleItemEquipped(this.app.actor, item);
      },
      attune: () => this.app.canEdit && this.attuneWithLimit(item, holder?.querySelector("[data-row]")),
      prepare: async () => {
        this.app._spells.measureSpellList();
        await toggleSpellPreparation(item);
      },
      favorite: id && this.app.canEdit ? async () => {
        this.app._spells.measureFavorites();
        if (this.app.actor.system.hasFavorite(id)) return this.app.actor.system.removeFavorite(id);
        playBurst(this.app.element, holder?.querySelector('[data-action="toggleFavorite"]') ?? holder, "inspired");
        await this.app.actor.system.addFavorite({ type: "item", id });
      } : null,
      isFavorite: Boolean(id && this.app.actor.system.hasFavorite(id))
    };
  }

  openContextMenu(event) {
    const holder = event.target.closest("[data-item-id]");
    const item = holder && this.app.itemFrom(holder);
    if (!item) return false;
    const at = { getBoundingClientRect: () => new DOMRect(event.clientX, event.clientY, 0, 0) };
    const activityTarget = event.target.closest("[data-activity-id]");
    const activity = activityTarget && item.system.activities?.get(activityTarget.dataset.activityId);
    const entries = activity
      ? activityMenuEntries(activity, activityTarget)
      : itemMenuEntries(item, this.menuActions(item, holder));
    openItemMenu(this.app.element, at, entries, activity ? activityTarget : holder);
    return true;
  }

  itemToChat(target) {
    return this.app.itemFrom(target)?.displayCard();
  }

  manageCurrency() {
    if (this.app.canEdit) return new dnd5e.applications.CurrencyManager({ document: this.app.actor }).render({ force: true });
  }

  async toggleTray(target) {
    const tray = target.closest("[data-tray]");
    const item = this.app.actor.items.get(tray?.dataset.tray);
    if (!item) return;
    const folded = !tray.classList.contains("is-folded");
    tray.classList.toggle("is-folded", folded);
    target.setAttribute("aria-expanded", String(!folded));
    await game.settings.set(MODULE_ID, "trayFolds", { ...getSetting("trayFolds"), [item.uuid]: folded });
  }

  async foldAllTrays(target) {
    const folded = target.dataset.fold === "fold";
    const folds = { ...getSetting("trayFolds") };
    for (const item of this.app.actor.items) if (item.type === "container") folds[item.uuid] = folded;
    await game.settings.set(MODULE_ID, "trayFolds", folds);
    this.app.render({ parts: ["main"] });
  }

  containerRules(target) {
    if (game.user.isGM) return openWeightyContainersDialog(this.app.itemFrom(target));
  }

  prepareFlight(item, from) {
    if (!from || !this.app.motionOn) return;
    this._flight = { id: item.id, from: from.getBoundingClientRect(), img: item.img, toDoll: !item.system.equipped };
  }

  fly() {
    const flight = this._flight;
    this._flight = null;
    if (!flight) return;
    const item = this.app.actor.items.get(flight.id);
    if (!item || Boolean(item.system.equipped) !== flight.toDoll) return;
    const el = this.app.element;
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

  async toggleDoll() {
    const hidden = !getSetting("dollHidden");
    await game.settings.set(MODULE_ID, "dollHidden", hidden);
    const panel = this.app.element.querySelector('[data-panel="equipment"]');
    const before = new Map([...panel.querySelectorAll("[data-row]")].map((row) => [row.closest("[data-item-id]")?.dataset.itemId, row.getBoundingClientRect()]));
    await this.app.render({ parts: ["main"] });
    if (!this.app.motionOn) return;
    for (const row of this.app.element.querySelectorAll('[data-panel="equipment"] [data-row]')) {
      const from = before.get(row.closest("[data-item-id]")?.dataset.itemId);
      const to = row.getBoundingClientRect();
      if (!from || !to.width) continue;
      row.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 420, easing: SETTLE });
    }
  }

  async slotClick(target) {
    const id = target.dataset.itemId;
    if (id) return this.selectAndReveal(id);
    if (!this.app.canEdit) return;
    const slotId = target.dataset.slot;
    const item = firstItemFor(this.app.actor, slotId);
    if (!item) {
      this.app.shake(target);
      return ui.notifications.warn(t("AIM.window.doll.nothingFits", { slot: target.querySelector(".aim-slot-label")?.textContent ?? slotId }));
    }
    this.prepareFlight(item, this.app.element.querySelector(`.aim-rowwrap[data-item-id="${item.id}"] .aim-tile-btn .aim-tile`));
    if (!await equipItemToSlot(this.app.actor, item, slotId)) this.app.shake(target);
  }

  async unequipSlot(event, target) {
    event.stopPropagation();
    const holder = target.closest(".aim-slot-wrap") ?? target.closest("[data-item-id]");
    const itemId = target.dataset.itemId ?? holder?.querySelector("[data-item-id]")?.dataset.itemId ?? holder?.dataset.itemId;
    const item = this.app.actor.items.get(itemId);
    if (!item || !this.app.canEdit) return;
    this.prepareFlight(item, holder?.querySelector(".aim-tile"));
    await unequipItem(this.app.actor, item);
  }

  socketClick(target) {
    return this.selectAndReveal(target.dataset.itemId);
  }

  endAttunement(event, target) {
    event.stopPropagation();
    const item = this.app.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item && this.app.canEdit) return toggleAttunement(item);
  }

  attuneWithLimit(item, rowNode) {
    const max = getActorAttunementMax(this.app.actor);
    if (!isItemAttuned(item) && countAttunedItems(this.app.actor) >= max) {
      this.app.shake(rowNode);
      this.app.shake(this.app.element.querySelector("[data-attune]"));
      ui.notifications.warn(t("AIM.notifications.maxAttunementReached", { max }));
      return false;
    }
    return toggleAttunement(item);
  }

  editCoin(target) {
    if (!this.app.canEdit) return;
    this.app._edits.begin("coin", target.dataset.coin);
  }

  async applyLoadout(target) {
    if (!this.app.canEdit) return;
    const ok = await applyActorLoadout(this.app.actor, target.dataset.loadoutId);
    if (!ok) this.app.shake(target);
  }

  async saveLoadout() {
    if (!this.app.canEdit) return;
    const actor = this.app.actor;
    const existing = getActorLoadouts(actor);
    const result = await promptLoadoutDialog({
      title: t("AIM.window.loadouts.saveTitle"),
      initialName: suggestLoadoutName(actor, existing.length),
      initialIcon: suggestLoadoutIcon(actor)
    });
    if (!result) return;
    await saveActorLoadout(actor, result);
  }

  openLoadoutMenu(pill) {
    if (!this.app.canEdit) return false;
    const actor = this.app.actor;
    const loadout = getActorLoadouts(actor).find((entry) => entry.id === pill.dataset.loadoutId);
    if (!loadout) return false;
    const entries = [
      {
        name: t("AIM.window.loadouts.apply"),
        icon: '<i class="fa-light fa-check"></i>',
        callback: async () => {
          if (!await applyActorLoadout(actor, loadout.id)) this.app.shake(pill);
        }
      },
      {
        name: t("AIM.window.loadouts.update"),
        icon: '<i class="fa-light fa-floppy-disk"></i>',
        callback: () => saveActorLoadout(actor, { id: loadout.id, name: loadout.name, icon: loadout.icon })
      },
      {
        name: t("AIM.window.loadouts.edit"),
        icon: '<i class="fa-light fa-pen"></i>',
        callback: async () => {
          const patch = await promptLoadoutDialog({
            title: t("AIM.window.loadouts.editTitle"),
            initialName: loadout.name,
            initialIcon: loadout.icon
          });
          if (patch) await renameActorLoadout(actor, loadout.id, patch);
        }
      },
      {
        name: t("AIM.window.loadouts.delete"),
        icon: '<i class="fa-light fa-trash"></i>',
        callback: () => deleteActorLoadout(actor, loadout.id)
      }
    ];
    openItemMenu(this.app.element, pill, entries, pill);
    return true;
  }

  dispose() {
    clearTimeout(this._searchTimer);
  }
}

export const EQUIPMENT_ACTIONS = {
  listView(_event, target) { return this._equipment.listView(target); },
  listFilter(_event, target) { return this._equipment.listFilter(target); },
  selectRow(_event, target) { const row = target.closest("[data-row]"); if (row) return this._equipment.selectRow(row); },
  toggleSection(_event, target) { return this._equipment.foldSection(target); },
  addItem(_event, target) { return this._equipment.addItem(target); },
  useItem(event, target) { return this._equipment.useItem(event, target); },
  useActivity(event, target) { return this._equipment.useActivity(event, target); },
  equipItem(_event, target) { return this._equipment.equipItem(target); },
  attuneItem(_event, target) { return this._equipment.attuneItem(target); },
  stepQty(_event, target) { return this._equipment.stepQty(target); },
  spendCharge(_event, target) { return this._equipment.spendCharge(target); },
  itemMenu(_event, target) { return this._equipment.itemMenu(target); },
  itemToChat(_event, target) { return this._equipment.itemToChat(target); },
  manageCurrency() { return this._equipment.manageCurrency(); },
  editCoin(_event, target) { return this._equipment.editCoin(target); },
  toggleTray(_event, target) { return this._equipment.toggleTray(target); },
  foldAllTrays(_event, target) { return this._equipment.foldAllTrays(target); },
  containerRules(_event, target) { return this._equipment.containerRules(target); },
  toggleDoll() { return this._equipment.toggleDoll(); },
  slotClick(_event, target) { return this._equipment.slotClick(target); },
  unequipSlot(event, target) { return this._equipment.unequipSlot(event, target); },
  socketClick(_event, target) { return this._equipment.socketClick(target); },
  endAttunement(event, target) { return this._equipment.endAttunement(event, target); },
  openPresetEditor() { return openPresetEditor(this.actor); },
  applyLoadout(_event, target) { return this._equipment.applyLoadout(target); },
  saveLoadout() { return this._equipment.saveLoadout(); }
};
