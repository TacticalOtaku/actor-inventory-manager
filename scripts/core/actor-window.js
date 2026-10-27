// ─────────────────────────────────────────────────────────
// Actor window - layout, motion, theme and tab rules (pure)
// ─────────────────────────────────────────────────────────

/** The window picks its layout from its own width, never the screen. */
export function layoutForWidth(width) {
  if (width < 420) return "compact";
  if (width < 760) return "narrow";
  if (width < 1320) return "standard";
  return "wide";
}

/** Motion levels from least to most (#9). */
export const MOTION_LEVELS = Object.freeze(["off", "reduced", "full"]);

/**
 * The highest level the machine allows: reduced motion in the OS allows «Выключены» only,
 * Foundry's performance-low mode «Сдержанно».
 * @param {{reducedMotion?: boolean, performanceLow?: boolean}} caps
 */
export function motionCap({ reducedMotion = false, performanceLow = false } = {}) {
  if (reducedMotion) return "off";
  if (performanceLow) return "reduced";
  return "full";
}

/** The level in effect: the player's choice, lowered to the cap; the choice itself is kept. */
export function effectiveMotion(chosen, caps) {
  const want = MOTION_LEVELS.includes(chosen) ? chosen : "full";
  const cap = motionCap(caps);
  return MOTION_LEVELS[Math.min(MOTION_LEVELS.indexOf(want), MOTION_LEVELS.indexOf(cap))];
}

export const THEMES = Object.freeze(["night", "parchment", "auto"]);

/** «Авто» follows Foundry's colour scheme for applications (or the OS when Foundry follows it). */
export function resolveTheme(choice, schemeIsLight) {
  if (choice === "auto") return schemeIsLight ? "parchment" : "night";
  return choice === "parchment" ? "parchment" : "night";
}

/** 1.x stored dark / light / auto. */
export function themeFromLegacy(value) {
  return { dark: "night", light: "parchment", auto: "auto" }[value] ?? "night";
}

/** Accents are stored by name; each theme has its own colour for each name (#17, #26). */
export const ACCENTS = Object.freeze(["brass", "embers", "arcane", "forest", "frost", "rose"]);
export const DEFAULT_ACCENT = "brass";

export function normalizeAccent(name) {
  return ACCENTS.includes(name) ? name : DEFAULT_ACCENT;
}

/** The nearest named accent for each of the ten 1.x hues (#17). */
const LEGACY_ACCENTS = Object.freeze({
  amber: "brass",
  peach: "embers",
  rose: "rose",
  orchid: "rose",
  lavender: "arcane",
  periwinkle: "arcane",
  sage: "forest",
  mint: "forest",
  azure: "frost",
  steel: "frost"
});

export function accentFromLegacy(id) {
  return LEGACY_ACCENTS[id] ?? DEFAULT_ACCENT;
}

export const DENSITIES = Object.freeze(["comfortable", "compact"]);

/** Tabs in order; Снаряжение can never be hidden. */
export const SHEET_TABS = Object.freeze(["overview", "equipment", "spells", "features", "effects", "biography"]);
export const ALWAYS_TAB = "equipment";

/**
 * Tabs that show: not hidden by the user and present on the actor (Заклинания hides itself without spells).
 * @param {{hidden?: string[], missing?: string[]}} options
 */
export function visibleTabs({ hidden = [], missing = [] } = {}) {
  return SHEET_TABS.filter((tab) => tab === ALWAYS_TAB || (!hidden.includes(tab) && !missing.includes(tab)));
}

/** A hidden open tab falls back to Снаряжение. */
export function fallbackTab(current, visible) {
  return visible.includes(current) ? current : ALWAYS_TAB;
}

/** Rail blocks the player can hide; hit points always show. `needs: "magic"` hides itself without spells. */
export const RAIL_BLOCKS = Object.freeze([
  { id: "hitDice" },
  { id: "spellSlots", needs: "magic" },
  { id: "stats" },
  { id: "spellcasting", needs: "magic" },
  { id: "effects" },
  { id: "chips" },
  { id: "rest" },
  { id: "favorites" }
].map(Object.freeze));

/**
 * What a click on the level orb does: the experience card until the orb is ready (and for observers or with
 * Shift); ready, it levels up the only class or asks which class first.
 * @param {{ready: boolean, canEdit: boolean, shift: boolean, classCount: number}} state
 * @returns {"card"|"level"|"choose"}
 */
export function orbAction({ ready, canEdit, shift, classCount }) {
  if (!ready || !canEdit || shift || classCount < 1) return "card";
  return classCount === 1 ? "level" : "choose";
}

/**
 * Entries of the window's «⋯» menu. dnd5e 5.3.3 has no standalone special traits or bastion dialog, so those open
 * the actor's own sheet on that tab.
 * @param {{type: string, bastion: boolean, polymorphed: boolean}} actor
 */
export function sheetMenuEntries({ type, bastion, polymorphed }) {
  const entries = ["openSheet"];
  if (type === "character") entries.push("traits");
  if (type === "character" && bastion) entries.push("bastion");
  if (polymorphed) entries.push("revert");
  return entries;
}

/** The actor sheet tab each menu entry opens (dnd5e 5.3.3 tab ids). */
export const SHEET_MENU_TABS = Object.freeze({ traits: "specialTraits", bastion: "bastion" });
