// ─────────────────────────────────────────────────────────
// Actor window - the effects tab: dnd5e's categories, what each row offers, the conditions grid (pure)
// ─────────────────────────────────────────────────────────

/** dnd5e's effect categories in the order the tab shows them; empty ones hide. */
export const EFFECT_CATEGORIES = ["temporary", "passive", "inactive", "suppressed"];

/**
 * Concentration (× ends it), a condition (× removes it: toggleStatusEffect deletes only an effect on the actor that
 * carries that one status) or an effect with a switch.
 */
function effectKind({ statuses, onActor }, { statusIds, concentrating }) {
  if (statuses.includes(concentrating)) return "concentration";
  if (onActor && statuses.length === 1 && statusIds.has(statuses[0])) return "condition";
  return "effect";
}

/**
 * Effects in dnd5e's categories: unavailable (suppressed), off, temporary and passive. Foundry 14 counts only
 * effects with a duration as temporary, so one carrying a status counts too; concentration, then the effects with
 * a status, lead the temporary ones. Entries: {statuses, onActor, disabled, suppressed, temporary}.
 * @param {object[]} entries
 * @param {{statusIds: Set<string>, concentrating: string}} options
 */
export function categorizeEffects(entries, options) {
  const withStatus = (e) => e.statuses.some((s) => options.statusIds.has(s));
  const rank = (e) => (e.kind === "concentration" ? 0 : withStatus(e) ? 1 : 2);
  const rows = entries.map((e) => ({
    ...e,
    kind: effectKind(e, options),
    category: e.suppressed ? "suppressed" : e.disabled ? "inactive" : e.temporary || withStatus(e) ? "temporary" : "passive"
  }));
  return EFFECT_CATEGORIES
    .map((key) => {
      const list = rows.filter((e) => e.category === key);
      return { key, entries: key === "temporary" ? list.sort((a, b) => rank(a) - rank(b)) : list };
    })
    .filter((group) => group.entries.length);
}

const CHANGE_MARKS = { multiply: " ×", upgrade: " ≥ ", downgrade: " ≤ " };

/** «КД +1», «Вес ×2», «Телосложение: 19»: a change as its label and what it does by its type. */
export function changeText({ type, value }, label) {
  const text = String(value ?? "").trim();
  // A formula may carry its own sign («+1d4»); it gets one sign, not two.
  if (type === "add") return `${label} ${text.startsWith("-") ? `−${text.slice(1)}` : `+${text.replace(/^\+/, "")}`}`;
  if (CHANGE_MARKS[type]) return `${label}${CHANGE_MARKS[type]}${text}`;
  return `${label}: ${text}`;
}

/**
 * The conditions grid: the conditions, then the other statuses, each by name; the active ones are lit.
 * @param {{id: string, name: string, condition: boolean}[]} statuses
 * @param {Set<string>} active  the actor's statuses
 */
export function conditionGrid(statuses, active, locale) {
  const rows = statuses.map((s) => ({ ...s, on: active.has(s.id) })).sort((a, b) => a.name.localeCompare(b.name, locale));
  return { conditions: rows.filter((s) => s.condition), statuses: rows.filter((s) => !s.condition) };
}
