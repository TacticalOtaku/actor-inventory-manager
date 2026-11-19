// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Actor Header & Rail)
// ─────────────────────────────────────────────────────────

import { countAttunedItems, getActorAttunementMax } from "../../core/attunement.js";
import { num } from "../../core/weight-calculator.js";
import { computeActorCurrency } from "../item-piles.js";
import { getDnd5eConfig, localizeOr, unitAbbreviation } from "./common.js";
import { extractSpellSlots } from "./spells.js";

/**
 * Name of the actor's main class: the one with the most levels.
 * dnd5e 5.3.3 exposes `actor.classes` as a record of class items keyed by
 * identifier; a class item's level is `system.levels`.
 * @param {Object} actor
 * @returns {string}
 */
function resolvePrimaryClassName(actor) {
  const classes = Object.values(actor?.classes ?? {});
  let primary = null;
  for (const cls of classes) {
    if (!primary || num(cls?.system?.levels, 0) > num(primary.system?.levels, 0)) primary = cls;
  }
  return primary?.name ?? "";
}

/**
 * Extract vital character statistics for the RPG panel
 * @param {Object} actor
 * @returns {Object}
 */
export function extractActorVitals(actor) {
  if (!actor) return {};

  const system = actor.system ?? {};
  const attributes = system.attributes ?? {};
  const hp = attributes.hp ?? { value: 0, max: 0, temp: 0 };
  const ac = attributes.ac?.value ?? 10;
  const movement = attributes.movement ?? {};
  const init = attributes.init?.total ?? 0;

  // Currency (calculated via Item Piles if active or standard dnd5e)
  const currencyData = computeActorCurrency(actor);

  // Abilities
  const abilities = {};
  const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
  for (const k of abilityKeys) {
    const ab = system.abilities?.[k] ?? {};
    const mod = num(ab.mod, 0);
    // 5.3.3 keeps the save as { value }.
    const save = num(ab.save?.value ?? ab.save, mod);
    abilities[k] = {
      value: num(ab.value, 10),
      mod: mod >= 0 ? `+${mod}` : `${mod}`,
      save: save >= 0 ? `+${save}` : `${save}`,
      proficient: Boolean(ab.proficient)
    };
  }

  // Senses & Passives
  const skills = system.skills ?? {};
  const passivePerception = skills.prc?.passive ?? (10 + num(abilities.wis?.mod, 0));
  const passiveInsight = skills.ins?.passive ?? (10 + num(abilities.wis?.mod, 0));
  const passiveInvestigation = skills.inv?.passive ?? (10 + num(abilities.int?.mod, 0));

  // Details
  const details = system.details ?? {};
  const race = details.race?.name ?? details.race ?? "";
  const alignment = details.alignment ?? "";
  const background = details.background?.name ?? details.background ?? "";
  const level = details.level ?? (actor.type === "npc" ? details.cr ?? "" : "");

  // Movement speed string
  const speeds = [];
  const speedUnit = unitAbbreviation("movementUnits", movement.units || "ft");
  if (movement.walk) speeds.push(`${movement.walk} ${speedUnit}`);
  for (const [mode, label] of [["fly", "Fly"], ["swim", "Swim"], ["climb", "Climb"], ["burrow", "Burrow"]]) {
    if (movement[mode]) speeds.push(`${localizeOr(`AIM.vitals.movement.${mode}`, label)} ${movement[mode]} ${speedUnit}`);
  }
  const speedDisplay = speeds.length > 0 ? speeds.join(", ") : `${movement.walk ?? 30} ${speedUnit}`;
  const hpValue = num(hp.value, 0);
  const hpMax = num(hp.max, 0);
  const hpTemp = num(hp.temp, 0);
  const sharePct = amount => (hpMax > 0 ? Math.min(100, Math.max(0, Math.round((amount / hpMax) * 100))) : 0);

  // Attunement calculation
  const attunedItemsCount = countAttunedItems(actor);
  const attunementMax = getActorAttunementMax(actor);

  return {
    name: actor.name,
    img: actor.img,
    level,
    race,
    background,
    alignment,
    className: resolvePrimaryClassName(actor),
    hp: {
      value: hpValue,
      max: hpMax,
      temp: hpTemp,
      pct: sharePct(hpValue),
      // Where the temporary-HP band ends: current plus temporary, as a share of max.
      tempPct: sharePct(hpValue + hpTemp)
    },
    ac,
    init: init >= 0 ? `+${init}` : `${init}`,
    speed: speedDisplay,
    speedWalk: num(movement.walk, 30),
    speedUnit,
    passives: {
      perception: passivePerception,
      insight: passiveInsight,
      investigation: passiveInvestigation
    },
    abilities,
    currency: {
      ...currencyData
    },
    attunement: {
      value: attunedItemsCount,
      max: attunementMax,
      isOver: attunedItemsCount > attunementMax,
      pct: attunementMax > 0 ? Math.min(100, Math.round((attunedItemsCount / attunementMax) * 100)) : 0
    }
  };
}

/**
 * The six abilities for the window header. dnd5e 5.3.3 keeps the save as `abilities.<key>.save.value`
 * and its proficiency as the number `proficient`.
 * @param {Object} actor
 * @returns {{key: string, abbr: string, label: string, value: number, mod: number, save: number, proficient: boolean}[]}
 */
export function readAbilities(actor) {
  const config = globalThis.CONFIG?.DND5E?.abilities ?? {};
  return Object.entries(actor?.system?.abilities ?? {}).map(([key, ab]) => {
    const mod = num(ab?.mod, 0);
    return {
      key,
      abbr: config[key]?.abbreviation ?? key,
      label: config[key]?.label ?? key,
      value: num(ab?.value, 10),
      mod,
      save: num(ab?.save?.value ?? ab?.save, mod),
      proficient: num(ab?.proficient, 0) > 0
    };
  });
}

/**
 * Level, experience and the documents the header links to: classes with their subclasses, species and background.
 * dnd5e 5.3.3 prepares `details.race` and `details.background` as the item documents.
 * @param {Object} actor
 */
export function readIdentity(actor) {
  const details = actor?.system?.details ?? {};
  const xp = details.xp ?? {};
  const link = (doc) => (doc && typeof doc === "object" ? { id: doc.id, name: doc.name } : null);
  const classes = Object.values(actor?.classes ?? {})
    .map((cls) => ({ id: cls.id, name: cls.name, levels: num(cls.system?.levels, 0), subclass: link(cls.subclass) }))
    .sort((a, b) => b.levels - a.levels);
  const max = num(xp.max, 0);
  return {
    level: num(details.level, 0),
    xp: { value: num(xp.value, 0), min: num(xp.min, 0), max, pct: num(xp.pct, 0), ready: max > 0 && num(xp.value, 0) >= max },
    classes,
    species: link(details.race),
    background: link(details.background)
  };
}

/**
 * What an NPC's window shows of its kind and legendary pools. dnd5e 5.3.3: `details.cr` is a number (0.125 for 1/8),
 * `details.xp.value` derives from it, `details.type.label` is prepared from type, subtype and swarm, size is
 * `traits.size` (CONFIG.DND5E.actorSizes); legendary actions and resistances are `resources.legact` / `legres`
 * {max, spent}, with `value` what is left. A pool without a maximum is null.
 * @param {Object} actor
 * @returns {{cr: number|null, xp: number, size: string, type: string, legendary: {actions: Object|null, resistance: Object|null}}|null}
 */
export function readNpc(actor) {
  if (actor?.type !== "npc") return null;
  const system = actor.system ?? {};
  const details = system.details ?? {};
  const size = getDnd5eConfig().actorSizes?.[system.traits?.size]?.label;
  const pool = (resource) => {
    const max = num(resource?.max, 0);
    return max > 0 ? { max, value: Math.max(0, Math.min(max, max - num(resource.spent, 0))) } : null;
  };
  const cr = Number(details.cr);
  return {
    cr: details.cr === null || details.cr === undefined || !Number.isFinite(cr) ? null : cr,
    xp: num(details.xp?.value, 0),
    size: size ? localizeOr(size, size) : "",
    type: details.type?.label ?? "",
    legendary: { actions: pool(system.resources?.legact), resistance: pool(system.resources?.legres) }
  };
}

/**
 * Everything the actor window's rail shows. dnd5e 5.3.3 shapes: `attributes.hd` is a HitDice object
 * (`value`, `max`, `largestAvailable`), each class carries its own `spellcasting` ({ability, attack, save}),
 * `actor.concentration.items` holds the items concentrated on, `attributes.exhaustion` is the level.
 * @param {Object} actor
 */
export function readRail(actor) {
  const system = actor?.system ?? {};
  const attributes = system.attributes ?? {};
  const config = globalThis.CONFIG?.DND5E ?? {};
  const hp = attributes.hp ?? {};
  const hd = attributes.hd ?? {};
  const conMod = num(system.abilities?.con?.mod, 0);
  const movement = attributes.movement ?? {};
  const casting = Object.values(actor?.classes ?? {})
    .filter((cls) => cls.spellcasting?.ability && cls.spellcasting.progression !== "none")
    .map((cls) => ({
      name: cls.name,
      ability: config.abilities?.[cls.spellcasting.ability]?.label ?? cls.spellcasting.ability,
      dc: num(cls.spellcasting.save, 0),
      attack: num(cls.spellcasting.attack, 0)
    }));
  return {
    hp: { value: num(hp.value, 0), max: num(hp.max, 0), temp: num(hp.temp, 0) },
    ac: num(attributes.ac?.value, 10),
    // 5.3.3 prepares the parts: base (for the default calculation armor + capped Dexterity), shield, bonus, cover.
    acParts: {
      calc: attributes.ac?.calc ?? "default",
      base: num(attributes.ac?.base, 10),
      armor: num(attributes.ac?.armor, 10),
      dex: num(attributes.ac?.dex, 0),
      shield: num(attributes.ac?.shield, 0),
      bonus: num(attributes.ac?.bonus, 0),
      cover: num(attributes.ac?.cover, 0),
      armorName: attributes.ac?.equippedArmor?.name ?? null
    },
    init: num(attributes.init?.total, 0),
    speed: num(movement.walk, 0),
    speedUnit: unitAbbreviation("movementUnits", movement.units || "ft"),
    prof: num(attributes.prof, 0),
    inspiration: Boolean(attributes.inspiration),
    exhaustion: { value: num(attributes.exhaustion, 0), max: num(config.conditionTypes?.exhaustion?.levels, 6) },
    death: { success: num(attributes.death?.success, 0), failure: num(attributes.death?.failure, 0) },
    hitDice: {
      value: num(hd.value, 0),
      max: num(hd.max, 0),
      formula: hd.largestAvailable ? `${hd.largestAvailable} ${conMod >= 0 ? "+" : "−"} ${Math.abs(conMod)}` : ""
    },
    slots: extractSpellSlots(actor),
    casting,
    passivePerception: num(system.skills?.prc?.passive, 10),
    concentration: [...(actor?.concentration?.items ?? [])].map((item) => item.name)
  };
}
