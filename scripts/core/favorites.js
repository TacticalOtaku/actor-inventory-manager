// ─────────────────────────────────────────────────────────
// Actor window - favorites in the rail: groups by action cost, manual order, the tab of an entry (pure)
// ─────────────────────────────────────────────────────────

export const FAVORITE_GROUPS = ["action", "bonus", "reaction", "other"];

/** dnd5e spaces favorite sort values by this (CONST.SORT_INTEGER_DENSITY). */
const SORT_STEP = 100000;

/**
 * Favorites by action cost (Действие, Бонусное действие, Реакция, Прочее), each group in its manual order; empty
 * groups hide. Entries: {id, sort, activation}.
 */
export function groupFavorites(entries) {
  const groupOf = (e) => (FAVORITE_GROUPS.includes(e.activation) ? e.activation : "other");
  return FAVORITE_GROUPS
    .map((key) => ({ key, entries: entries.filter((e) => groupOf(e) === key).sort((a, b) => a.sort - b.sort) }))
    .filter((group) => group.entries.length);
}

/**
 * system.favorites with one favorite moved before or after another, sort values renumbered.
 * @param {{id: string, sort: number}[]} favorites
 */
export function reorderFavorites(favorites, id, targetId, before) {
  const ordered = [...favorites].sort((a, b) => a.sort - b.sort);
  const moving = ordered.find((f) => f.id === id);
  if (!moving || id === targetId || !ordered.some((f) => f.id === targetId)) return ordered;
  const rest = ordered.filter((f) => f.id !== id);
  const at = rest.findIndex((f) => f.id === targetId) + (before ? 0 : 1);
  rest.splice(at, 0, moving);
  return rest.map((f, i) => ({ ...f, sort: (i + 1) * SORT_STEP }));
}

/** The tab a favorite opens: a skill or tool «Обзор», an effect «Эффекты», slots and spells «Заклинания». */
export function tabForFavorite({ type, itemType }) {
  if (type === "skill" || type === "tool") return "overview";
  if (type === "effect") return "effects";
  if (type === "slots" || itemType === "spell") return "spells";
  if (itemType === "feat") return "features";
  return "equipment";
}
