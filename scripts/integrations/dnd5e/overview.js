// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Overview & Biography)
// ─────────────────────────────────────────────────────────

import { num } from "../../core/weight-calculator.js";
import { getDnd5eConfig, localizeOr, unitAbbreviation } from "./common.js";

/** dnd5e's label for a trait key («Acid», «Simple», «Herbalism Kit»), the key itself without dnd5e. */
function traitLabel(key, trait) {
  return globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key, { trait }) ?? key;
}

/** A trait's keys and its «;»-separated custom entries as labels. */
function traitLabels(data, trait) {
  const custom = String(data?.custom ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  return [...(data?.value ?? [])].map((key) => traitLabel(key, trait)).concat(custom);
}

/**
 * Skills (or tools) for the overview: ability, the proficiency multiplier in effect (`prof.multiplier`, which
 * effects may raise above the stored `value`), total and passive score.
 * @param {"skills"|"tools"} kind
 */
function readChecks(actor, kind) {
  const config = getDnd5eConfig();
  return Object.entries(actor?.system?.[kind] ?? {}).map(([key, data]) => ({
    key,
    label: kind === "skills" ? localizeOr(config.skills?.[key]?.label, config.skills?.[key]?.label ?? key) : traitLabel(key, "tool"),
    ability: data?.ability ?? "",
    abilityAbbr: config.abilities?.[data?.ability]?.abbreviation ?? data?.ability ?? "",
    prof: num(data?.prof?.multiplier ?? data?.value, 0),
    total: num(data?.total, 0),
    passive: num(data?.passive, 10)
  }));
}

/** The 18 skills of the overview, in dnd5e's order. */
export const readSkills = (actor) => readChecks(actor, "skills");

/** Tool proficiencies of the overview. */
export const readTools = (actor) => readChecks(actor, "tools");

/**
 * Defenses from system.traits: resistances, immunities, vulnerabilities, condition immunities (keys and custom),
 * and damage modification (`dm.amount`, a formula per damage type, shown with its sign).
 */
export function readDefenses(actor) {
  const traits = actor?.system?.traits ?? {};
  const types = getDnd5eConfig().damageTypes ?? {};
  const out = Object.fromEntries(["dr", "di", "dv", "ci"].map((trait) => [trait, traitLabels(traits[trait], trait)]));
  out.dm = Object.entries(traits.dm?.amount ?? {}).filter(([, amount]) => String(amount ?? "").trim()).map(([type, amount]) => {
    const text = String(amount).trim();
    const shown = Number.isFinite(Number(text)) && Number(text) > 0 ? `+${text}` : text.replace(/^-/, "−");
    return `${localizeOr(types[type]?.label, types[type]?.label ?? type)} ${shown}`;
  });
  // The damage types among them, in the same order, for their chips.
  out.types = {
    ...Object.fromEntries(["dr", "di", "dv"].map((trait) => [trait, [...(traits[trait]?.value ?? [])].filter((key) => key in types)])),
    dm: Object.entries(traits.dm?.amount ?? {}).filter(([key, amount]) => key in types && String(amount ?? "").trim()).map(([key]) => key)
  };
  return out;
}

/**
 * Passive scores, senses and proficiencies for the overview. Senses moved to `attributes.senses.ranges` in dnd5e
 * 5.3 (the old keys only warn); languages come from dnd5e's prepared `labels`, telepathy from `communication`.
 */
export function readSenses(actor) {
  const system = actor?.system ?? {};
  const config = getDnd5eConfig();
  const senses = system.attributes?.senses ?? {};
  const unit = unitAbbreviation("movementUnits", senses.units || "ft");
  const languages = system.traits?.languages;
  const communication = Object.entries(config.communicationTypes ?? {})
    .filter(([key]) => num(languages?.communication?.[key]?.value, 0) > 0)
    .map(([key, { label }]) => `${localizeOr(label, label ?? key)} ${num(languages.communication[key].value, 0)} ${unit}`);
  return {
    passive: Object.fromEntries(["prc", "inv", "ins"].map((key) => [key, num(system.skills?.[key]?.passive, 10)])),
    senses: Object.entries(senses.ranges ?? {}).filter(([, range]) => num(range, 0) > 0)
      .map(([key, range]) => {
        const label = config.senses?.[key]?.label ?? config.senses?.[key] ?? key;
        return `${localizeOr(label, label)} ${num(range, 0)} ${unit}`;
      })
      .concat(senses.special ? [senses.special] : []),
    armor: traitLabels(system.traits?.armorProf, "armor"),
    weapon: traitLabels(system.traits?.weaponProf, "weapon"),
    languages: [...(languages?.labels?.languages ?? []), ...communication]
  };
}

/**
 * The biography fields dnd5e's own sheet edits: characteristics and personality as stored (`_source`, so an effect's
 * override is not written back), and the raw biography HTML. NPCs and vehicles have only the biography.
 */
export function readBiography(actor, keys) {
  const source = actor?._source?.system?.details ?? {};
  return {
    fields: Object.fromEntries(keys.map((key) => [key, String(source[key] ?? "")])),
    biography: String(source.biography?.value ?? "")
  };
}
