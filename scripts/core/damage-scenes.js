// ─────────────────────────────────────────────────────────
// Actor window - damage type scenes: which scene a type gets, multi-type parts, how a motion level plays it (pure)
// ─────────────────────────────────────────────────────────

/** dnd5e's thirteen damage types, each with a scene of its own; any other type gets the generic orb. */
export const SCENES = Object.freeze([
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder"
]);

export const sceneFor = (type) => (SCENES.includes(type) ? type : "generic");

/** «fire|cold» is one damage part of two types: a chip for each. */
export function damageParts(types) {
  return String(types ?? "").split("|").map((t) => t.trim()).filter(Boolean);
}

/**
 * How a scene plays at a motion level (#9). «Все»: it loops while the card is open (an ambient effect). «Сдержанно»:
 * one loop, then it holds its telling moment. «Выключены»: only that moment, drawn from a run simulated off screen.
 * @returns {{loop: boolean, stillOnly: boolean}}
 */
export function scenePlan(level) {
  return { loop: level === "full", stillOnly: level !== "full" && level !== "reduced" };
}
