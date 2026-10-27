// ─────────────────────────────────────────────────────────
// Actor window - the features tab: groups by origin or by action cost, filters, uses (pure)
// ─────────────────────────────────────────────────────────

import { applyCoinEntry, parseCoinEntry } from "./inventory.js";

export const FEATURE_FILTERS = ["action", "bonus", "reaction", "passive"];
/** NPC and vehicle groups by action cost, in order; empty groups hide. */
export const ACTION_GROUPS = ["passive", "action", "bonus", "reaction", "legendary", "lair", "other"];

const MATCH = {
  action: (e) => !e.passive && e.activation === "action",
  bonus: (e) => !e.passive && e.activation === "bonus",
  reaction: (e) => !e.passive && e.activation === "reaction",
  passive: (e) => e.passive
};

function narrow(entries, { query = "", filters = [], locale } = {}) {
  const q = query.trim().toLocaleLowerCase(locale);
  return entries
    .filter((e) => (!q || e.name.toLocaleLowerCase(locale).includes(q)) && filters.every((f) => MATCH[f]?.(e) ?? true))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/**
 * Character features by origin, as dnd5e groups them: a section per class (its subclass features inside), then the
 * species, the background and everything else. Entries: {id, name, origin: {kind, key}, activation, passive}.
 * @param {object[]} entries
 * @param {{classes: string[], query?: string, filters?: string[], locale?: string}} options  classes: identifiers in order
 */
export function groupByOrigin(entries, { classes = [], ...options } = {}) {
  const narrowed = Boolean(options.query?.trim() || options.filters?.length);
  const keys = [...classes, "species", "background", "other"];
  return keys
    .map((key) => ({ key, entries: narrow(entries.filter((e) => (keys.includes(e.origin.key) ? e.origin.key : "other") === key), options) }))
    // Every class keeps its section; the others show when they have features. A search hides what it empties.
    .filter((group) => group.entries.length || (!narrowed && classes.includes(group.key)));
}

/** NPC and vehicle features and attacks by action cost; passive features first as «Особенности». */
export function groupByAction(entries, options = {}) {
  const groupOf = (e) => (e.passive ? "passive" : ACTION_GROUPS.includes(e.activation) ? e.activation : "other");
  return ACTION_GROUPS
    .map((key) => ({ key, entries: narrow(entries.filter((e) => groupOf(e) === key), options) }))
    .filter((group) => group.entries.length);
}

/**
 * A uses counter edited like HP and coins: −1 spends, +2 restores, a bare number sets, within 0 and the maximum.
 * @returns {number|null} the new value, null when the entry cannot be read
 */
export function applyUsesEntry({ value, max }, text) {
  const entry = parseCoinEntry(text);
  if (!entry) return null;
  return Math.max(0, Math.min(max, applyCoinEntry(value, entry)));
}

/** «5–6» for a recharge on 5, «6» on a six. */
export function rechargeLabel(formula) {
  const threshold = Math.min(6, Math.max(1, Number(formula) || 6));
  return threshold < 6 ? `${threshold}–6` : "6";
}
