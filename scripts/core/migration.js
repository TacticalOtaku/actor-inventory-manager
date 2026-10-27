// ─────────────────────────────────────────────────────────
// Actor window - what the 1.9 → 2.0 world migration writes (ADR 0005, pure)
// ─────────────────────────────────────────────────────────

/** Stored in the hidden world setting `migrationVersion` once a migration ran without failures. */
export const MIGRATION_VERSION = "2.0.0";

const QUICK_SLOTS = Object.freeze(["quick1", "quick2", "quick3", "quick4"]);
const ATTUNEMENT_SLOTS = Object.freeze(["attunement1", "attunement2", "attunement3"]);

export const needsMigration = (stored) => stored !== MIGRATION_VERSION;

/**
 * 1.9 slot values that are no slot in 2.0: attunement comes from `system.attuned`, quick slots became favorites.
 * Their flags are not rewritten, and the auto-placement of equipped items leaves them alone.
 */
export const isLegacyNonSlot = (slot) => QUICK_SLOTS.includes(slot) || ATTUNEMENT_SLOTS.includes(slot);

/**
 * The item favorites a 1.9 character's quick slots become, in slot order, without those already there.
 * @param {{id: string, slot: string|null}[]} items
 * @param {{id: string}[]} [favorites]  dnd5e's `system.favorites`
 * @returns {{type: "item", id: string}[]}  relative UUIDs, as dnd5e stores item favorites
 */
export function quickSlotFavorites(items, favorites = []) {
  const have = new Set(favorites.map((favorite) => favorite.id));
  return items
    .filter((item) => QUICK_SLOTS.includes(item.slot))
    .sort((a, b) => QUICK_SLOTS.indexOf(a.slot) - QUICK_SLOTS.indexOf(b.slot))
    .map((item) => ({ type: "item", id: `.Item.${item.id}` }))
    .filter((favorite) => !have.has(favorite.id));
}

/** A 1.9 world template as a 2.0 preset: it gains the humanoid figure; null when it already has a figure. */
export function presetFromTemplate(template) {
  if (!template || typeof template !== "object" || template.figure) return null;
  return { ...template, figure: "human" };
}

/** The id of the world preset a 1.9 actor's own doll becomes; the same id every run keeps it from doubling. */
export const ownDollPresetId = (actorId) => `own-${actorId}`;

/**
 * The world preset a 1.9 actor's own doll (`paperdollCustomTemplate`) becomes, named «Своя кукла: {актор}».
 * @param {string} actorId
 * @param {Object} doll   the 1.9 template stored on the actor
 * @param {string} name   the preset's name, already localised
 */
export function ownDollPreset(actorId, doll, name) {
  return { ...doll, id: ownDollPresetId(actorId), name, figure: doll.figure || "human", isPreset: false };
}

/** Trades the update cancels: open ones that have not started executing; one in recovery is left alone. */
export const tradesToCancel = (sessions) => (sessions ?? []).filter((session) => session.status === "open");

/**
 * What a client's 1.9 look becomes: the device's theme and accent move to the user, only where the user has no
 * 2.0 value yet and the device had a 1.9 one.
 * @param {{theme?: string, accent?: string}} legacy  the 1.9 client values, undefined when never set
 * @param {{theme: boolean, accent: boolean}} has       whether the user already has a 2.0 value
 * @param {{theme: Function, accent: Function}} map     the 1.9 → 2.0 tables
 * @returns {{windowTheme?: string, windowAccent?: string}}
 */
export function lookFromLegacy(legacy, has, map) {
  const out = {};
  if (legacy.theme !== undefined && !has.theme) out.windowTheme = map.theme(legacy.theme);
  if (legacy.accent !== undefined && !has.accent) out.windowAccent = map.accent(legacy.accent);
  return out;
}

/** Whether the GM hears about the migration: when it moved anything, cancelled a trade or failed somewhere. */
export const worthReporting = ({ actors, items, presets, trades, failures }) => actors + items + presets + trades + failures > 0;
