// ─────────────────────────────────────────────────────────
// Actor window - the spells tab: sections, filters, what can be cast, slot gems, preparation (pure)
// ─────────────────────────────────────────────────────────

export const SPELL_FILTERS = ["prepared", "ritual", "concentration", "action", "bonus", "reaction"];

/** Methods outside the spellbook: they need no slots and are never prepared. */
const FREE_METHODS = ["innate", "atwill"];

/**
 * Ready to cast without preparing: cantrips, prepared or always-prepared spells, innate and at-will ones, and the
 * known spells of a class without a preparation limit (a 2014 warlock or sorcerer).
 */
export const ready = (s) => s.level === 0 || s.prepared >= 1 || FREE_METHODS.includes(s.method) || Boolean(s.known);

const MATCH = {
  prepared: ready,
  ritual: (s) => s.ritual,
  concentration: (s) => s.concentration,
  action: (s) => s.activation === "action",
  bonus: (s) => s.activation === "bonus",
  reaction: (s) => s.activation === "reaction"
};

/**
 * Whether dnd5e can cast the spell now: everything ready, plus rituals cast as rituals; an unprepared spell otherwise
 * has no cast button.
 * @param {{level: number, method: string, prepared: number, ritual: boolean}} s
 */
export function castable(s) {
  return ready(s) || s.ritual;
}

/**
 * Prepared spells (circle 1 and higher, by circle), the spellbook by circle with cantrips first, then innate and
 * at-will spells. Circles with slots show even when empty.
 * Entries: {id, name, level, method, prepared, known, ritual, concentration, activation}.
 * @param {object[]} spells
 * @param {{slotLevels?: number[], filters?: string[], query?: string, locale?: string}} [options]
 */
export function groupSpellbook(spells, { slotLevels = [], filters = [], query = "", locale } = {}) {
  const q = query.trim().toLocaleLowerCase(locale);
  const shown = (s) => (!q || s.name.toLocaleLowerCase(locale).includes(q)) && filters.every((f) => MATCH[f]?.(s) ?? true);
  const byName = (a, b) => a.name.localeCompare(b.name, locale);
  const visible = (list) => list.filter(shown).sort(byName);
  const book = spells.filter((s) => !FREE_METHODS.includes(s.method));
  const levels = [...new Set([...book.map((s) => s.level), ...slotLevels])].sort((a, b) => a - b);
  const circles = levels.map((level) => ({ level, entries: visible(book.filter((s) => s.level === level)) }));
  const innate = visible(spells.filter((s) => s.method === "innate"));
  const atwill = visible(spells.filter((s) => s.method === "atwill"));
  return {
    prepared: book.filter((s) => s.level > 0 && s.prepared >= 1).filter(shown).sort((a, b) => (a.level - b.level) || byName(a, b)),
    circles,
    innate,
    atwill,
    hasInnate: spells.some((s) => s.method === "innate"),
    hasAtwill: spells.some((s) => s.method === "atwill"),
    count: circles.reduce((n, c) => n + c.entries.length, 0) + innate.length + atwill.length
  };
}

/**
 * The value a slot track takes when a gem is clicked: a lit gem spends down to it, a hollow one restores up to it.
 * @param {number} value  lit gems
 * @param {number} index  clicked gem, from 0
 */
export function pipTarget(value, index) {
  return index < value ? index : index + 1;
}

/**
 * Prepared spells against each casting class's limit from dnd5e; past a limit dnd5e only warns.
 * @param {{name: string, value: number, max: number}[]} classes
 */
export function preparationState(classes) {
  const counted = classes.filter((c) => c.max > 0 || c.value > 0).map((c) => ({
    ...c,
    state: c.value > c.max ? "over" : c.value === c.max ? "full" : "ok"
  }));
  const over = counted.find((c) => c.state === "over");
  return { classes: counted, over: over ? { value: over.value, max: over.max } : null };
}
