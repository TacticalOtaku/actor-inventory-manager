// ─────────────────────────────────────────────────────────
// Actor window - the overview and biography tabs: proficiency marks, the dialogs behind each card (pure)
// ─────────────────────────────────────────────────────────

/** dnd5e's characteristics (system.details) in the order its biography tab lists them. */
export const CHARACTERISTICS = ["alignment", "age", "height", "weight", "eyes", "hair", "skin", "gender", "faith"];

/** Personality fields of system.details; the appearance spans the row. */
export const PERSONALITY = ["trait", "ideal", "bond", "flaw", "appearance"];

/** dnd5e's damage and condition traits of the defenses card, in order. */
export const DEFENSES = ["dr", "di", "dv", "ci", "dm"];

/**
 * The dnd5e dialogs behind each card's gear; a card with several opens a menu.
 * kind: the dialog family the window maps to dnd5e's classes; trait/type: its option.
 */
export const CARD_CONFIGS = {
  skills: [{ id: "skills", kind: "skills" }],
  tools: [{ id: "tool", kind: "tools", trait: "tool" }],
  defenses: [
    ...["dr", "di", "dv", "dm"].map((trait) => ({ id: trait, kind: "damages", trait })),
    { id: "ci", kind: "traits", trait: "ci" }
  ],
  senses: [
    { id: "senses", kind: "senses", type: "senses" },
    { id: "languages", kind: "languages", trait: "languages" },
    { id: "weapon", kind: "weapons", trait: "weapon" },
    { id: "armor", kind: "traits", trait: "armor" }
  ]
};

/** dnd5e's proficiency multiplier as a mark: hollow, half, filled, ringed for expertise. */
export function profMark(multiplier) {
  const m = Number(multiplier) || 0;
  return m >= 2 ? "expert" : m >= 1 ? "prof" : m > 0 ? "half" : "none";
}

/** «+3», «−1»: a bonus as the sheet shows it; a missing one is «+0», never «−NaN». */
export const signed = (n) => {
  const value = Number(n) || 0;
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
};
