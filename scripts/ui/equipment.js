// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the equipment tab: lists, purse, load, details and the item menu
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { LIST_FILTERS, SORTS, VIEWS, goldParts, groupInventory, listPrefsFor, showsCharges } from "../core/inventory.js";
import { computeActorEncumbrance, getSystemWeightUnit } from "../core/weight-calculator.js";
import { getDnd5eConfig, readCoins, readInventory, resolveItemUses, unitAbbreviation } from "../integrations/dnd5e.js";
import { computeActorCurrency, readPilesCurrencies } from "../integrations/item-piles.js";
import { escapeHTML } from "./html.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const EQUIPMENT_TEMPLATES = ["equipment", "tray", "item-row", "item-detail"].map((name) => `${PARTIALS}/${name}.hbs`);

/** More charges than this show as a number instead of pips. */
const MAX_PIPS = 10;
const VIEW_ICONS = { list: "fa-list", grid: "fa-grid-2", icons: "fa-grid" };

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const typeLabel = (type) => t(CONFIG.Item.typeLabels?.[type] ?? type);

/**
 * Everything the equipment tab draws.
 * @param {Actor} actor
 * @param {{prefs: object, query: string, collapsed: Set<string>, selected: string|null, detail: object|null,
 *   coinEditing: string|null, coinDraft: string, canEdit: boolean}} state
 */
export function buildEquipmentContext(actor, state) {
  const prefs = listPrefsFor(state.prefs, "equipment");
  const entries = readInventory(actor);
  const coins = readCoins(actor);
  const abbr = Object.fromEntries(coins.map((coin) => [coin.key, coin.abbr]));
  const unit = getSystemWeightUnit();
  const unitLabel = unitAbbreviation("weightUnits", unit);
  const { sections, containers, count } = groupInventory(entries, { query: state.query, filters: prefs.filters, sort: prefs.sort, locale: game.i18n.lang });

  const row = (entry) => {
    const charges = entry.charges && showsCharges({ ...entry.charges, quantity: entry.quantity }) ? entry.charges : null;
    const price = goldParts(entry.price * entry.quantity);
    const selected = entry.id === state.selected;
    return {
      ...entry,
      selected,
      detail: selected ? state.detail : null,
      useLabel: t("AIM.window.inv.use", { name: entry.name }),
      weightText: entry.weight ? `${Number(entry.weight.toFixed(2))} ${unitLabel}` : "",
      priceText: price ? `${price.amount} ${abbr[price.denom] ?? price.denom}` : "",
      attuneTag: entry.attunement === "attuned" ? t("AIM.window.inv.attuned") : entry.attunement === "required" ? t("AIM.window.inv.needsAttune") : "",
      attuneable: entry.attunement !== "none",
      attuneLabel: t(entry.attuned ? "AIM.window.inv.unattune" : "AIM.window.inv.attune"),
      equipLabel: t(entry.equipped ? "AIM.window.inv.unequip" : "AIM.window.inv.equip"),
      qtyBadge: entry.quantity > 1,
      showCharges: Boolean(charges),
      charges,
      chargesHint: charges ? t("AIM.window.inv.charges", { value: charges.value, max: charges.max }) : "",
      pips: charges && charges.max <= MAX_PIPS
        ? Array.from({ length: charges.max }, (_, i) => ({ spent: i >= charges.value, label: t("AIM.window.inv.charge", { n: i + 1 }) }))
        : null
    };
  };
  const tray = ({ entry, contents, trays }) => ({ entry: row(entry), contents: contents.map(row), trays: trays.map(tray) });

  return {
    prefs,
    query: state.query,
    count,
    emptyText: t(state.query || prefs.filters.length ? "AIM.window.inv.notFound" : "AIM.window.inv.empty"),
    views: VIEWS.map((id) => ({ id, icon: VIEW_ICONS[id], label: t(`AIM.window.inv.views.${id}`), active: id === prefs.view })),
    sorts: SORTS.map((id) => ({ id, label: t(`AIM.window.inv.sorts.${id}`), selected: id === prefs.sort })),
    filters: LIST_FILTERS.map((id) => ({ id, label: t(`AIM.window.inv.filters.${id}`), on: prefs.filters.includes(id) })),
    sections: sections.map((section) => ({
      id: section.id,
      label: t(`AIM.window.inv.sections.${section.id}`),
      addLabel: t("AIM.window.inv.add", { type: typeLabel(section.id) }),
      collapsed: state.collapsed.has(section.id),
      entries: section.entries.map(row)
    })),
    containers: containers.map(tray),
    containersCollapsed: state.collapsed.has("container"),
    ...purseContext(actor, coins, state),
    load: loadContext(actor, unitLabel)
  };
}

/** dnd5e coins, or Item Piles' currencies and total when it is active. */
function purseContext(actor, coins, { canEdit, coinEditing, coinDraft }) {
  const currency = computeActorCurrency(actor);
  const pileCoins = readPilesCurrencies(actor);
  const piles = pileCoins.length > 0;
  const list = piles
    ? pileCoins.map((c) => {
      // shortcut: only Item Piles currencies stored in system.currency are editable here; item currencies stay read-only.
      const key = /^system\.currency\.(\w+)$/.exec(c.data?.path ?? c.path ?? "")?.[1] ?? null;
      return { key: key ?? c.id ?? c.name, label: game.i18n.localize(c.name), abbr: (c.abbreviation ?? "").replace("{#}", "").trim(), value: c.quantity, img: c.img, editable: canEdit && Boolean(key) };
    })
    : coins.map((coin) => ({ ...coin, editable: canEdit }));
  return {
    coins: list.map((coin) => ({ ...coin, editing: coin.editable && coin.key === coinEditing, editLabel: t("AIM.window.inv.coinEdit", { coin: coin.label }) })),
    coinDraft,
    total: { value: Number(currency.total.toFixed(2)), text: currency.formatted },
    canManage: canEdit && Boolean(dnd5e.applications?.CurrencyManager)
  };
}

/** Carried weight against capacity from system.attributes.encumbrance; hidden without an encumbrance rule and for vehicles. */
function loadContext(actor, unitLabel) {
  if (actor.type === "vehicle") return null;
  const enc = computeActorEncumbrance(actor);
  if (enc.rule === "none" || !enc.max) return null;
  const share = (n) => Math.min(1, Math.max(0, n / enc.max)).toFixed(3);
  return {
    value: enc.value,
    max: enc.max,
    unit: unitLabel,
    tier: enc.tier,
    tierLabel: t(enc.tierLabelKey),
    share: share(enc.value),
    stops: enc.showTierStops,
    t1: share(enc.thresholds.encumbered),
    t2: share(enc.thresholds.heavilyEncumbered)
  };
}

/**
 * The body shared by the inline details and the inspector: enriched description, activities or the main action,
 * the item's own effects, then «В чат» and the menu.
 */
export async function buildItemDetail(item, { canEdit }) {
  const system = item.system ?? {};
  const unidentified = system.identified === false && !game.user.isGM;
  const raw = unidentified ? system.unidentified?.description : system.description?.value;
  const description = raw
    ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, { relativeTo: item, rollData: item.getRollData?.(), secrets: item.isOwner })
    : "";
  const activities = [...(system.activities ?? [])];
  return {
    description,
    canEdit,
    activities: activities.length > 1 ? activities.map((a) => ({ id: a.id, name: a.name, img: a.img })) : [],
    useOnly: activities.length === 1,
    canEquip: "equipped" in system,
    equipLabel: t(system.equipped ? "AIM.window.inv.unequip" : "AIM.window.inv.equip"),
    // An unidentified item does not give its effects away to players.
    effects: unidentified ? [] : item.effects.map((e) => ({ id: e.id, name: e.name, img: e.img, disabled: e.disabled }))
  };
}

/** The inspector's head over the detail body. */
export function buildInspector(item, detail) {
  const uses = resolveItemUses(item);
  const recovery = (item.system.uses?.recovery ?? [])
    .map((r) => getDnd5eConfig().limitedUsePeriods?.[r.period]?.label ?? r.period)
    .filter(Boolean)
    .map((label) => game.i18n.localize(label));
  const rarity = item.system.rarity ?? "";
  return {
    id: item.id,
    name: item.name,
    img: item.img,
    rarity,
    rarityLabel: rarity && rarity !== "common" ? game.i18n.localize(getDnd5eConfig().itemRarity?.[rarity] ?? "") : "",
    typeLabel: typeLabel(item.type),
    tags: readInventory({ items: [item] })[0]?.tags ?? [],
    usesText: uses.usesDisplay,
    recovery: recovery.join(", "),
    detail
  };
}

/**
 * The row menu, with dnd5e's keys so other modules recognise the entries. Entries may be either shape
 * ({name, icon, condition, callback} or {label, icon, visible, onClick}); #39 adds other modules' entries.
 */
export function itemMenuEntries(item) {
  const sheetModes = dnd5e.applications.item.ItemSheet5e?.MODES ?? {};
  const owner = item.isOwner;
  const entries = [
    { name: "DND5E.ItemView", icon: '<i class="fa-light fa-eye"></i>', callback: () => item.sheet.render({ force: true, mode: sheetModes.PLAY }) },
    { name: "DND5E.ContextMenuActionEdit", icon: '<i class="fa-light fa-pen"></i>', condition: () => owner, callback: () => item.sheet.render({ force: true, mode: sheetModes.EDIT }) },
    {
      name: "DND5E.ContextMenuActionDuplicate", icon: '<i class="fa-light fa-copy"></i>', condition: () => owner && item.canDuplicate !== false,
      callback: () => item.clone({ name: game.i18n.format("DOCUMENT.CopyOf", { name: item.name }) }, { save: true, addSource: true })
    },
    { id: "delete", name: "DND5E.ContextMenuActionDelete", icon: '<i class="fa-light fa-trash"></i>', condition: () => owner && item.canDelete !== false, callback: () => item.deleteDialog() },
    { name: "DND5E.DisplayCard", icon: '<i class="fa-light fa-message"></i>', callback: () => item.displayCard() },
    {
      name: "DND5E.Identify", icon: '<i class="fa-light fa-magnifying-glass"></i>',
      condition: () => owner && "identified" in item.system && !item.system.identified,
      callback: () => item.update({ "system.identified": true })
    }
  ];
  if (item.type === "spell") {
    entries.push({
      name: "DND5E.Scroll.CreateScroll", icon: '<i class="fa-light fa-scroll"></i>', condition: () => owner,
      callback: async () => {
        const scroll = await Item.implementation.createScrollFromSpell(item);
        if (scroll) await Item.implementation.create(scroll, { parent: item.parent });
      }
    });
  }
  return entries;
}

/** Shows the window's own menu under the anchor; entries in either shape run on click. */
export function openItemMenu(root, anchor, entries, target) {
  closeItemMenu(root);
  const shown = entries.filter((e) => {
    const test = e.condition ?? e.visible;
    return typeof test === "function" ? test(target) : test ?? true;
  });
  if (!shown.length) return;
  const menu = document.createElement("div");
  menu.className = "aim-menu aim-popmenu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = shown.map((e, i) => `<button type="button" role="menuitem" data-menu-index="${i}">${e.icon ?? ""}<span>${escapeHTML(game.i18n.localize(e.name ?? e.label ?? ""))}</span></button>`).join("");
  root.append(menu);
  const box = root.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const left = Math.min(at.right - box.left - menu.offsetWidth, box.width - menu.offsetWidth - 8);
  const below = at.bottom - box.top + 4;
  const top = below + menu.offsetHeight > box.height - 8 ? at.top - box.top - menu.offsetHeight - 4 : below;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, Math.min(top, box.height - menu.offsetHeight - 8))}px`;
  menu.querySelector("button")?.focus();
  menu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-menu-index]");
    if (!button) return;
    const entry = shown[Number(button.dataset.menuIndex)];
    closeItemMenu(root);
    (entry.callback ?? entry.onClick)?.(target);
  });
  const away = (event) => {
    if (menu.contains(event.target)) return;
    closeItemMenu(root);
  };
  menu._away = away;
  setTimeout(() => document.addEventListener("pointerdown", away, { capture: true }));
}

export function closeItemMenu(root) {
  const menu = root?.querySelector(".aim-popmenu");
  if (!menu) return false;
  document.removeEventListener("pointerdown", menu._away, { capture: true });
  menu.remove();
  return true;
}

/** What the purse and load looked like at the last render, to animate the change. */
export function equipmentSnapshot(element) {
  const coins = {};
  for (const coin of element?.querySelectorAll("[data-coin] [data-coin-value]") ?? []) coins[coin.closest("[data-coin]").dataset.coin] = Number(coin.textContent);
  return {
    coins,
    total: Number(element?.querySelector("[data-coin-total]")?.dataset.coinTotal ?? NaN),
    tier: element?.querySelector("[data-load]")?.dataset.tier ?? null
  };
}

/** A changed coin flips once, the total counts to its new value, a crossed load stop shakes the meter. */
export function playEquipmentChanges(element, prev, motion) {
  if (!prev || motion === "off") return;
  const next = equipmentSnapshot(element);
  for (const [key, value] of Object.entries(next.coins)) {
    if (key in prev.coins && prev.coins[key] !== value) pulse(element.querySelector(`[data-coin="${key}"]`), "is-flip");
  }
  const total = element.querySelector("[data-coin-total]");
  if (total && Number.isFinite(prev.total) && prev.total !== next.total) countTo(total, prev.total, next.total);
  if (prev.tier && next.tier && prev.tier !== next.tier) pulse(element.querySelector("[data-load]"), "is-cross");
}

function pulse(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

function countTo(el, from, to) {
  const text = el.textContent;
  const suffix = text.replace(/^[\d.,\s]+/, "");
  const start = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - start) / 500);
    el.textContent = `${(from + (to - from) * (1 - (1 - k) ** 3)).toFixed(2)} ${suffix}`.trim();
    if (k < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
}
