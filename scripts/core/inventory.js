// ─────────────────────────────────────────────────────────
// Actor window - inventory lists, list preferences, charges and coins (pure)
// ─────────────────────────────────────────────────────────

/** Inventory sections by dnd5e item type, in order; containers have their own section. */
export const INVENTORY_SECTIONS = ["weapon", "equipment", "consumable", "tool", "loot"];
export const VIEWS = ["list", "grid", "icons"];
export const SORTS = ["name", "weight", "price", "rarity", "manual"];
export const LIST_FILTERS = ["equipped", "attuned"];
const RARITY_ORDER = ["", "common", "uncommon", "rare", "veryRare", "legendary", "artifact"];

/**
 * A tab's list view, sort and filters, as remembered in the user's listPrefs setting.
 * @param {Record<string, object>} all
 * @param {string} tab
 * @returns {{view: string, sort: string, filters: string[]}}
 */
export function listPrefsFor(all, tab) {
  const prefs = all?.[tab] ?? {};
  return {
    view: VIEWS.includes(prefs.view) ? prefs.view : "list",
    sort: SORTS.includes(prefs.sort) ? prefs.sort : "name",
    filters: Array.isArray(prefs.filters) ? prefs.filters.filter((f) => LIST_FILTERS.includes(f)) : []
  };
}

/** A copy of every tab's preferences with one tab changed. */
export function withListPref(all, tab, patch) {
  return { ...all, [tab]: { ...listPrefsFor(all, tab), ...patch } };
}

const COMPARE = {
  weight: (a, b) => b.weight - a.weight,
  price: (a, b) => b.price * b.quantity - a.price * a.quantity,
  rarity: (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity),
  manual: (a, b) => a.sort - b.sort
};

/**
 * Sections by type and container trays, filtered and sorted. Items inside a container are listed only in its tray.
 * Entries: {id, name, type, container, weight (total), price (gold per unit), rarity, quantity, sort, equipped, attuned}.
 * @param {object[]} entries
 * @param {{query?: string, filters?: string[], sort?: string, locale?: string}} [options]
 */
export function groupInventory(entries, { query = "", filters = [], sort = "name", locale } = {}) {
  const q = query.trim().toLocaleLowerCase(locale);
  const shown = (e) => (!q || e.name.toLocaleLowerCase(locale).includes(q))
    && (!filters.includes("equipped") || e.equipped)
    && (!filters.includes("attuned") || e.attuned);
  const byName = (a, b) => a.name.localeCompare(b.name, locale);
  const compare = (a, b) => (COMPARE[sort]?.(a, b) || 0) || byName(a, b);
  const visible = (list) => list.filter(shown).sort(compare);
  const ids = new Set(entries.map((e) => e.id));
  const inside = (id) => entries.filter((e) => e.container === id);
  const narrowed = Boolean(q || filters.length);
  let count = 0;

  const tray = (bag) => {
    const children = inside(bag.id);
    const contents = visible(children.filter((e) => e.type !== "container"));
    const trays = children.filter((e) => e.type === "container").sort(compare).map(tray).filter(Boolean);
    const self = shown(bag);
    if (narrowed && !self && !contents.length && !trays.length) return null;
    count += contents.length + (self ? 1 : 0);
    return { entry: bag, contents, trays };
  };

  const top = entries.filter((e) => !e.container || !ids.has(e.container));
  const containers = top.filter((e) => e.type === "container").sort(compare).map(tray).filter(Boolean);
  const sections = INVENTORY_SECTIONS.map((id) => {
    const list = visible(top.filter((e) => e.type === id || (e.type !== "container" && id === "loot" && !INVENTORY_SECTIONS.includes(e.type))));
    count += list.length;
    return { id, entries: list };
  });
  return { sections, containers, count };
}

/** Charged items show pips; a stack of single-use items (torches, potions) shows its quantity instead. */
export function showsCharges({ max, quantity, autoDestroy }) {
  if (!(max > 0)) return false;
  return !(max === 1 && (autoDestroy || quantity > 1));
}

/** The new system.uses.spent after spending or restoring one charge. */
export function chargeChange(spent, max, direction) {
  return direction === "spend" ? Math.min(max, spent + 1) : Math.max(0, spent - 1);
}

/**
 * Read the coin field: −5 spends, +10 adds, a bare number sets.
 * @returns {{kind: "spend"|"add"|"set", amount: number}|null}
 */
export function parseCoinEntry(text) {
  const match = /^([−\-+]?)\s*(\d+)$/.exec(String(text ?? "").trim());
  if (!match) return null;
  const amount = Number(match[2]);
  if (match[1] === "+") return { kind: "add", amount };
  if (match[1]) return { kind: "spend", amount };
  return { kind: "set", amount };
}

export function applyCoinEntry(current, { kind, amount }) {
  if (kind === "spend") return Math.max(0, current - amount);
  if (kind === "add") return current + amount;
  return amount;
}

/** A gold value in the coin that reads best: gold, silver below 1 gp, copper below 1 sp. */
export function goldParts(gp) {
  if (!(gp > 0)) return null;
  if (gp >= 1) return { amount: Math.round(gp * 10) / 10, denom: "gp" };
  if (gp >= 0.1) return { amount: Math.round(gp * 10), denom: "sp" };
  return { amount: Math.max(1, Math.round(gp * 100)), denom: "cp" };
}

/** More containers than this start folded. */
const UNFOLDED_TRAYS = 3;

/** A tray is folded by the user's choice, else when the actor has more than three containers; search opens every tray it shows. */
export function trayFolded(id, folds, total, searching) {
  if (searching) return false;
  return folds?.[id] ?? total > UNFOLDED_TRAYS;
}

/** A folded tray peeks at up to six tiles of its contents (items first, then nested containers) and counts the rest. */
export function trayPeek(contents, trays, limit = 6) {
  const all = [...contents, ...trays.map((tray) => tray.entry)];
  return { tiles: all.slice(0, limit), more: Math.max(0, all.length - limit) };
}

/**
 * Why an item cannot go into a container (null for the inventory root), or null when it can:
 * "self" for the container itself, "inside" for one of its own nested containers, "same" when it is already there.
 * @param {{id: string, container: string|null}[]} entries
 */
export function containerDropRefusal(entries, itemId, containerId) {
  const parent = new Map(entries.map((e) => [e.id, e.container ?? null]));
  if ((parent.get(itemId) ?? null) === (containerId ?? null)) return "same";
  if (containerId === itemId) return "self";
  const seen = new Set();
  for (let at = containerId; at && !seen.has(at); at = parent.get(at)) {
    if (at === itemId) return "inside";
    seen.add(at);
  }
  return null;
}

/** The load band of a container: its filled share and whether it is over capacity; null without a capacity. */
export function loadBand(load) {
  if (!load || !(load.max > 0) || !Number.isFinite(load.max)) return null;
  return { share: Math.min(1, Math.max(0, load.value / load.max)).toFixed(3), over: load.value > load.max };
}
