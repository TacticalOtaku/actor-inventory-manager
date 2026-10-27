// ─────────────────────────────────────────────────────────
// AIM: Actor Window - the equipment tab: lists, purse, load, details and the item menu
// ─────────────────────────────────────────────────────────

import { MODULE_ID } from "../constants.js";
import { LIST_FILTERS, SORTS, VIEWS, goldParts, groupInventory, listPrefsFor, loadBand, showsCharges, trayFolded, trayPeek } from "../core/inventory.js";
import { computeActorEncumbrance, getSystemWeightUnit } from "../core/weight-calculator.js";
import { getDnd5eConfig, readCoins, readContainerCapacity, readInventory, readSpellbook, resolveItemUses, unitAbbreviation } from "../integrations/dnd5e.js";
import { castable, ready } from "../core/spellbook.js";
import { usableActivities } from "../integrations/midi-qol.js";
import { computeActorCurrency, readPilesCurrencies } from "../integrations/item-piles.js";
import { getContainerLoad, getContainerWeightReductionPct, isWeightyContainersActive } from "../integrations/weighty-containers.js";
import { escapeHTML } from "./html.js";
import { playBurst } from "./bursts.js";
import { menuLayout } from "../core/menu.js";

const PARTIALS = `modules/${MODULE_ID}/templates/window`;
export const EQUIPMENT_TEMPLATES = ["equipment", "doll", "tray", "item-row", "item-detail"].map((name) => `${PARTIALS}/${name}.hbs`);

/** More charges than this show as a number instead of pips. */
const MAX_PIPS = 10;
const VIEW_ICONS = { list: "fa-list", grid: "fa-grid-2", icons: "fa-grid" };

const t = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const typeLabel = (type) => t(CONFIG.Item.typeLabels?.[type] ?? type);

/**
 * Everything the equipment tab draws.
 * @param {Actor} actor
 * @param {{prefs: object, query: string, collapsed: Set<string>, selected: string|null, detail: object|null,
 *   coinEditing: string|null, coinDraft: string, canEdit: boolean, folds: Record<string, boolean>}} state
 */
export async function buildEquipmentContext(actor, state) {
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
      favorite: Boolean(state.favIds?.has(entry.id)),
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
  const wc = isWeightyContainersActive();
  const narrowed = Boolean(state.query.trim() || prefs.filters.length);
  const total = entries.filter((e) => e.type === "container").length;
  const loads = new Map();
  for (const entry of entries) if (entry.type === "container") loads.set(entry.id, await containerLoad(actor, actor.items.get(entry.id), wc, unitLabel));
  let anyOpen = false;
  const tray = ({ entry, contents, trays }) => {
    const folded = trayFolded(entry.uuid, state.folds, total, narrowed);
    if (!folded) anyOpen = true;
    const peek = trayPeek(contents, trays);
    return {
      entry: row(entry),
      folded,
      toggleLabel: t(folded ? "AIM.window.inv.trayUnfold" : "AIM.window.inv.trayFold", { name: entry.name }),
      ...loads.get(entry.id),
      peek: peek.tiles,
      more: peek.more,
      contents: contents.map(row),
      trays: trays.map(tray)
    };
  };
  const trayList = containers.map(tray);

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
    containers: trayList,
    foldAll: anyOpen ? "fold" : "unfold",
    foldAllLabel: t(anyOpen ? "AIM.window.inv.foldAll" : "AIM.window.inv.unfoldAll"),
    rulesButton: wc && game.user.isGM,
    containersCollapsed: state.collapsed.has("container"),
    ...purseContext(actor, coins, state),
    load: loadContext(actor, unitLabel)
  };
}

/** A tray's load band and weight reduction: Weighty Containers' load when it is active, else dnd5e's capacity. */
async function containerLoad(actor, container, wc, unitLabel) {
  if (wc) {
    const load = getContainerLoad(actor, container.id);
    const reduction = getContainerWeightReductionPct(container);
    const byCount = load?.kind === "count";
    const band = loadBand(byCount ? { value: load.count, max: load.capacityCount } : { value: load?.load, max: load?.capacity });
    return {
      band: band && { ...band, text: byCount ? `${load.count} / ${load.capacityCount} ${t("AIM.window.inv.pieces")}` : `${load.load} / ${load.capacity} ${unitLabel}`, hint: t("AIM.window.inv.loadByWc") },
      reduction
    };
  }
  const capacity = await readContainerCapacity(container);
  const band = loadBand(capacity);
  const unit = capacity?.kind === "count" ? t("AIM.window.inv.pieces") : unitAbbreviation("weightUnits", capacity?.unit);
  return { band: band && { ...band, text: `${capacity.value} / ${capacity.max} ${unit}`, hint: t("AIM.window.inv.loadByDnd5e") }, reduction: 0 };
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
  // The player picks among the activities dnd5e allows; midi-qol's automation-only ones stay with midi.
  const activities = usableActivities(item);
  const spell = item.type === "spell" ? readSpellbook({ items: [item] })[0] : null;
  return {
    description,
    canEdit,
    activities: activities.length > 1 ? activities.map((a) => ({ id: a.id, name: a.name, img: a.img })) : [],
    useOnly: !spell && activities.length === 1,
    // A spell's main actions are casting and preparing.
    spell: spell && {
      castable: castable(spell),
      castLabel: t(castable(spell) && !ready(spell) ? "AIM.window.spells.castRitual" : "AIM.window.spells.cast"),
      canPrepare: spell.canPrepare && spell.prepared < 2,
      prepared: spell.prepared >= 1,
      prepareLabel: t(spell.prepared >= 1 ? "AIM.window.spells.unprepare" : "AIM.window.spells.prepare")
    },
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
    // A spell names its circle and school instead of its document type.
    typeLabel: item.type === "spell"
      ? [item.system.level ? t("AIM.window.spells.circle", { level: item.system.level }) : t("AIM.window.spells.cantrips"), item.labels?.school].filter(Boolean).join(" · ")
      : typeLabel(item.type),
    tags: readInventory({ items: [item] })[0]?.tags ?? [],
    usesText: uses.usesDisplay,
    recovery: recovery.join(", "),
    detail
  };
}

/**
 * The row menu: the entries of dnd5e 5.3.3's item list, with its keys and groups, so other modules recognise them;
 * then `dnd5e.getItemContextOptions` lets them add their own. Changes go through the window's own `actions` (the
 * attunement limit, the doll's rules, the prepare glide, favorites).
 * @param {Object} item
 * @param {{equip: Function, attune: Function, prepare: Function, favorite: Function|null, isFavorite: boolean}} actions
 */
export function itemMenuEntries(item, actions) {
  const sheetModes = dnd5e.applications.item.ItemSheet5e?.MODES ?? {};
  const actor = item.actor;
  const system = item.system ?? {};
  const owner = item.isOwner;
  const icon = (name) => `<i class="fa-light fa-${name}"></i>`;
  const prepares = CONFIG.DND5E.spellcasting?.[system.method]?.prepares;
  const always = system.prepared === CONFIG.DND5E.spellPreparationStates?.always?.value;
  const entries = [
    { name: "DND5E.ItemView", icon: icon("eye"), callback: () => item.sheet.render({ force: true, mode: sheetModes.PLAY }) },
    { name: "DND5E.ContextMenuActionEdit", icon: icon("pen"), condition: () => owner, callback: () => item.sheet.render({ force: true, mode: sheetModes.EDIT }) },
    {
      name: "DND5E.ContextMenuActionDuplicate", icon: icon("copy"), condition: () => owner && item.canDuplicate !== false,
      callback: () => item.clone({ name: game.i18n.format("DOCUMENT.CopyOf", { name: item.name }) }, { save: true, addSource: true })
    },
    { id: "delete", name: "DND5E.ContextMenuActionDelete", icon: icon("trash"), condition: () => owner && item.canDelete !== false, callback: () => item.deleteDialog() },
    { name: "DND5E.DisplayCard", icon: icon("message"), condition: () => Boolean(actor), callback: () => item.displayCard() },
    {
      name: "DND5E.Scroll.CreateScroll", icon: icon("scroll"), group: "action",
      condition: () => item.type === "spell" && !item.getFlag("dnd5e", "cachedFor") && actor?.isOwner,
      callback: async () => {
        const scroll = await Item.implementation.createScrollFromSpell(item);
        if (scroll) await Item.implementation.create(scroll, { parent: actor });
      }
    },
    {
      name: "DND5E.ConcentrationBreak", icon: icon("eye-slash"), group: "state",
      condition: () => Boolean(actor?.concentration?.items?.has(item)), callback: () => actor.endConcentration(item)
    },
    {
      name: `DND5E.ContextMenuAction${system.attuned ? "Unattune" : "Attune"}`, icon: icon("sun"), group: "state",
      condition: () => Boolean(system.attunement) && owner, callback: () => actions.attune()
    },
    {
      name: `DND5E.ContextMenuAction${system.equipped ? "Unequip" : "Equip"}`, icon: icon("shield-halved"), group: "state",
      condition: () => "equipped" in system && owner, callback: () => actions.equip()
    },
    {
      name: `DND5E.ContextMenuAction${item.isOnCooldown ? "Charge" : "ExpendCharge"}`, icon: icon("bolt"), group: "state",
      condition: () => Boolean(item.hasRecharge) && owner, callback: () => item.update({ "system.uses.spent": 1 - (system.uses?.spent ?? 0) })
    },
    {
      name: `DND5E.ContextMenuAction${system.prepared ? "Unprepare" : "Prepare"}`, icon: icon("book-bookmark"), group: "state",
      condition: () => item.type === "spell" && !item.hasRecharge && Boolean(prepares) && !always && owner && !item.getFlag("dnd5e", "cachedFor"),
      callback: () => actions.prepare()
    },
    {
      name: "DND5E.Identify", icon: icon("magnifying-glass"), group: "state",
      condition: () => owner && "identified" in system && !system.identified, callback: () => item.update({ "system.identified": true })
    },
    {
      name: actions.isFavorite ? "DND5E.FavoriteRemove" : "DND5E.Favorite", icon: icon("star"), group: "state",
      condition: () => Boolean(actions.favorite) && owner, callback: () => actions.favorite()
    },
    {
      name: system.properties?.has?.("gear") ? "DND5E.Gear.Action.Remove" : "DND5E.Gear.Action.Add", icon: icon("axe"), group: "state",
      condition: () => Boolean(actor?.system?.isNPC) && owner && Boolean(CONFIG.Item.dataModels[item.type]?.schema.has("quantity")),
      callback: () => {
        const properties = system.toObject().properties;
        return item.update({ "system.properties": system.properties.has("gear") ? properties.filter((p) => p !== "gear") : [...properties, "gear"] });
      }
    }
  ];
  Hooks.callAll("dnd5e.getItemContextOptions", item, entries);
  return entries;
}

/** An activity's menu as dnd5e builds it, after `dnd5e.getItemActivityContext` has had its say. */
export function activityMenuEntries(activity, target) {
  const entries = activity.getContextMenuOptions?.() ?? [];
  Hooks.callAll("dnd5e.getItemActivityContext", activity, target, entries);
  return entries;
}

/** Shows the window's own menu under the anchor; entries in either shape run on click. */
export function openItemMenu(root, anchor, entries, target) {
  closeItemMenu(root);
  const layout = menuLayout(entries, target);
  if (!layout.length) return;
  const shown = layout.map(({ entry }) => entry);
  const menu = document.createElement("div");
  menu.className = "aim-menu aim-popmenu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = layout.map(({ entry: e, divider }, i) => `${divider ? '<hr role="separator">' : ""}<button type="button" role="menuitem" data-menu-index="${i}">${e.icon ?? ""}<span>${escapeHTML(game.i18n.localize(e.name ?? e.label ?? ""))}</span></button>`).join("");
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
    if (!(key in prev.coins) || prev.coins[key] === value) continue;
    const coin = element.querySelector(`[data-coin="${key}"]`);
    pulse(coin, "is-flip");
    playBurst(element, coin?.querySelector("i, img") ?? coin, "coin");
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
