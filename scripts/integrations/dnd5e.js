// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration Adapter
// ─────────────────────────────────────────────────────────

// (rarity + school colours are resolved through the sc-rarity-colors adapter)
import { SPELL_SCHOOL_COLORS } from "../constants.js";
import { countAttunedItems, getActorAttunementMax, getAttunementStatus } from "../core/attunement.js";
import { PHYSICAL_ITEM_TYPES, canItemBeEquipped } from "../core/item-classifier.js";
import { getItemWeightInUnit, getSystemWeightUnit, num } from "../core/weight-calculator.js";
import { computeActorCurrency } from "./item-piles.js";
import { getItemRarityVisuals, getSpellSchoolVisuals } from "./sc-rarity-colors.js";

export { getSystemWeightUnit, SPELL_SCHOOL_COLORS };

/**
 * Localize a key, falling back to English when there is no translation (or no Foundry).
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function localizeOr(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
}

/**
 * Short label for a unit from a CONFIG.DND5E unit table (movementUnits,
 * distanceUnits, weightUnits). Unknown units show the key itself.
 * @param {string} tableName
 * @param {string} unit
 * @returns {string}
 */
export function unitAbbreviation(tableName, unit) {
  const abbreviation = getDnd5eConfig()[tableName]?.[unit]?.abbreviation;
  return abbreviation ? localizeOr(abbreviation, abbreviation) : unit;
}

/**
 * Get DnD5e config object safely
 */
export function getDnd5eConfig() {
  return globalThis.CONFIG?.DND5E ?? {};
}

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
 * Display name of an item rarity, empty for common items and rarities the system does not define
 * (custom ones added by rarity-colour modules). dnd5e 5.3.3 pre-localizes CONFIG.DND5E.itemRarity.
 * @param {string} rarityKey  normalized key, e.g. "veryRare"
 * @returns {string}
 */
function rarityLabel(rarityKey) {
  if (!rarityKey || rarityKey === "common") return "";
  const label = getDnd5eConfig().itemRarity?.[rarityKey];
  return typeof label === "string" ? localizeOr(label, label) : "";
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
    const save = num(ab.save, mod);
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

/**
 * The physical items the actor window lists. dnd5e 5.3.3 shapes: `price` is {value, denomination} per unit and
 * CONFIG.DND5E.currencies[denomination].conversion is coins per gold piece; charges are `uses.max` and `uses.spent`
 * (`uses.value` is derived); `container` is the id of the holding container; a container's own weight ignores quantity.
 * @param {Object} actor
 */
export function readInventory(actor) {
  const config = getDnd5eConfig();
  const unit = getSystemWeightUnit();
  const entries = [];
  for (const item of actor?.items ?? []) {
    if (!PHYSICAL_ITEM_TYPES.has(item.type)) continue;
    const system = item.system ?? {};
    const quantity = num(system.quantity, 1);
    const conversion = num(config.currencies?.[system.price?.denomination ?? "gp"]?.conversion, 1) || 1;
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    const attunement = getAttunementStatus(item);
    entries.push({
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img || "icons/svg/item-bag.svg",
      type: item.type,
      container: system.container ?? null,
      weight: getItemWeightInUnit(item, unit),
      price: num(system.price?.value, 0) / conversion,
      rarity: system.rarity ?? "",
      quantity,
      sort: num(item.sort, 0),
      equipped: Boolean(system.equipped),
      canEquip: canItemBeEquipped(item),
      attunement,
      attuned: attunement === "attuned",
      charges: max > 0 ? { value: Math.max(0, max - spent), max, spent, autoDestroy: Boolean(system.uses?.autoDestroy) } : null,
      identified: system.identified !== false,
      tags: [...(system.properties ?? [])].map((key) => config.itemProperties?.[key]?.label ?? key)
    });
  }
  return entries;
}

/**
 * A container's own capacity, used when Weighty Containers is absent. dnd5e 5.3.3: `system.computeCapacity()` resolves
 * {value, max, pct, units}, counting items when `capacity.count` is set, else weighing contents; max is Infinity
 * without a capacity. `capacity.weight.units` is the weight unit key ("lb", "kg").
 * @param {Object} container
 * @returns {Promise<{value: number, max: number, kind: "count"|"weight", unit: string}|null>}
 */
export async function readContainerCapacity(container) {
  if (typeof container?.system?.computeCapacity !== "function") return null;
  const { value = 0, max = Infinity } = await container.system.computeCapacity();
  const capacity = container.system.capacity ?? {};
  return { value: num(value, 0), max: Number(max), kind: capacity.count ? "count" : "weight", unit: capacity.weight?.units ?? "lb" };
}

/**
 * A vehicle's type (land, water, air, space). dnd5e 5.3.3 keeps it in `details.type`; older data had `vehicleType`.
 * @param {Object} actor
 * @returns {string|null}
 */
export function readVehicleType(actor) {
  if (actor?.type !== "vehicle") return null;
  return actor.system?.details?.type ?? actor.system?.vehicleType ?? null;
}

/**
 * What the banner over a vehicle's hold shows. dnd5e 5.3.3: size in `traits.size` (CONFIG.DND5E.actorSizes),
 * cargo capacity in `attributes.capacity.cargo` {value, units}.
 * @param {Object} actor
 * @returns {{size: string, cargo: number|null, unit: string}}
 */
export function readVehicleHold(actor) {
  const config = getDnd5eConfig();
  const size = actor?.system?.traits?.size;
  const cargo = actor?.system?.attributes?.capacity?.cargo ?? {};
  const label = config.actorSizes?.[size]?.label;
  return {
    size: label ? localizeOr(label, label) : (size ?? ""),
    cargo: Number.isFinite(Number(cargo.value)) && cargo.value !== null ? Number(cargo.value) : null,
    unit: cargo.units ? unitAbbreviation("weightUnits", cargo.units) : ""
  };
}

/**
 * The spells the spells tab lists. dnd5e 5.3.3 shapes: `method` (spell, pact, innate, atwill, ritual) and numeric
 * `prepared` (0, 1, 2 always); concentration and ritual are `properties`; the item's prepared `labels` carry
 * activation, range, school and `components.vsm`; materials are `materials` {value, cost}; uses are `uses.max`/`spent`;
 * `classIdentifier` names the class the spell came from (`actor.spellcastingClasses`).
 * @param {Object} actor
 */
export function readSpellbook(actor) {
  return [...(actor?.items ?? [])].filter((item) => item.type === "spell").map((item) => {
    const system = item.system ?? {};
    const labels = item.labels ?? {};
    const properties = system.properties ?? new Set();
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      level: num(system.level, 0),
      school: system.school ?? "",
      schoolLabel: labels.school ?? "",
      method: system.method ?? "",
      prepared: num(system.prepared, 0),
      // A class without a preparation limit (no formula, a 2014 warlock or sorcerer) knows its spells instead.
      known: knownByClass(actor, system.classIdentifier),
      canPrepare: resolveSpellPreparation(item).canPrepare && !knownByClass(actor, system.classIdentifier),
      ritual: properties.has("ritual"),
      concentration: properties.has("concentration"),
      activation: system.activation?.type ?? "",
      activationLabel: labels.activation ?? "",
      range: labels.range ?? system.range?.labels?.range ?? "",
      components: labels.components?.vsm ?? "",
      materials: system.materials?.value ? { text: system.materials.value, cost: num(system.materials.cost, 0) } : null,
      uses: max > 0 ? { value: Math.max(0, max - spent), max, spent } : null,
      sort: num(item.sort, 0)
    };
  });
}

/** Whether the spell's class has no preparation limit, so its spells are known rather than prepared. */
function knownByClass(actor, identifier) {
  const cls = identifier ? actor?.spellcastingClasses?.[identifier] : null;
  return Boolean(cls) && !(num(cls.system?.spellcasting?.preparation?.max, 0) > 0);
}

/**
 * Prepared spells against each casting class's limit. dnd5e 5.3.3 counts them on the class:
 * `actor.spellcastingClasses[identifier].system.spellcasting.preparation` {value, max}.
 * @param {Object} actor
 * @returns {{id: string, name: string, value: number, max: number}[]}
 */
export function readSpellPreparation(actor) {
  return Object.values(actor?.spellcastingClasses ?? {}).map((cls) => ({
    id: cls.id,
    name: cls.name,
    value: num(cls.system?.spellcasting?.preparation?.value, 0),
    max: num(cls.system?.spellcasting?.preparation?.max, 0)
  }));
}

/**
 * The features tab's entries: feats, and for an NPC or vehicle also weapons as attacks. dnd5e 5.3.3 shapes: the origin
 * is `flags.dnd5e.advancementRoot` (else `advancementOrigin`) "itemId.advancementId" naming the class, subclass,
 * species (`race`) or background item; a feature is passive with the `trait` property or no activities; uses are
 * `uses.max`/`spent` with `uses.recovery` [{period, formula}], a recharge being period "recharge"; an attack
 * activity labels `toHit` and `damage` [{label}].
 * @param {Object} actor
 * @param {{attacks?: boolean}} [options]
 */
export function readFeatures(actor, { attacks = false } = {}) {
  const config = getDnd5eConfig();
  return [...(actor?.items ?? [])].filter((item) => item.type === "feat" || (attacks && item.type === "weapon")).map((item) => {
    const system = item.system ?? {};
    const flags = item.flags?.dnd5e ?? {};
    const root = actor.items.get(String(flags.advancementRoot ?? flags.advancementOrigin ?? "").split(".")[0]);
    const properties = system.properties ?? new Set();
    const activities = [...(system.activities ?? [])];
    const max = num(system.uses?.max, 0);
    const spent = num(system.uses?.spent, 0);
    const recovery = Array.isArray(system.uses?.recovery) ? system.uses.recovery : [];
    const recharge = recovery.find((r) => r?.period === "recharge");
    const attack = item.type === "weapon" ? activities.find((a) => a.type === "attack") : null;
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      origin: featureOrigin(root),
      originId: root?.id ?? null,
      activation: resolveItemActivation(item).type,
      passive: properties.has("trait") || activities.length === 0,
      uses: max > 0 ? { value: Math.max(0, max - spent), max, spent } : null,
      recovery: recovery.filter((r) => r?.period && r.period !== "recharge")
        .map((r) => config.limitedUsePeriods?.[r.period]?.label ?? r.period).map((label) => localizeOr(label, label)),
      recharge: recharge ? { formula: String(recharge.formula ?? "6") } : null,
      attack: attack ? { toHit: attack.labels?.toHit ?? "", damage: (attack.labels?.damage ?? []).map((d) => d.label).filter(Boolean).join(" + ") } : null,
      tags: [...properties].filter((key) => key !== "trait").map((key) => config.itemProperties?.[key]?.label ?? key).map((label) => localizeOr(label, label)),
      sort: num(item.sort, 0)
    };
  });
}

/** The section a feature belongs to from the item its advancement came from. */
function featureOrigin(root) {
  switch (root?.type) {
    case "class": return { kind: "class", key: root.identifier ?? root.system?.identifier ?? root.id };
    case "subclass": return { kind: "class", key: root.system?.classIdentifier ?? root.class?.identifier ?? "other" };
    case "race": return { kind: "species", key: "species" };
    case "background": return { kind: "background", key: "background" };
    default: return { kind: "other", key: "other" };
  }
}

/**
 * The actor's favorites as the rail shows them. dnd5e 5.3.3: `system.favorites` [{type, id, sort}] with a relative UUID
 * for items, activities and effects (resolved with `fromUuid(id, {relative: actor})`, whose own `getFavoriteData()`
 * describes them), a slot key ("spell3", "pact") for slots and a skill or tool key otherwise.
 * @param {Object} actor
 */
export async function readFavorites(actor) {
  const config = getDnd5eConfig();
  const entries = [];
  for (const { id, type, sort } of actor?.system?.favorites ?? []) {
    const base = { id, type, sort: num(sort, 0), itemType: null, itemId: null, effectId: null, activityId: null, activation: "", level: null };
    if (type === "item" || type === "effect" || type === "activity") {
      const doc = await globalThis.fromUuid?.(id, { relative: actor });
      if (!doc || doc.dependentOrigin?.active === false) continue;
      const data = (type === "item" ? await doc.system?.getFavoriteData?.() : await doc.getFavoriteData?.()) ?? {};
      const item = type === "activity" ? doc.item : type === "item" ? doc : null;
      entries.push({
        ...base,
        ...data,
        itemType: item?.type ?? null,
        itemId: item?.id ?? null,
        effectId: type === "effect" ? doc.id : null,
        activityId: type === "activity" ? doc.id : null,
        activation: type === "activity" ? doc.activation?.type ?? "" : item ? resolveItemActivation(item).type : "",
        level: item?.type === "spell" ? num(item.system?.level, 0) : null,
        // dnd5e 5.3.3 gives the save DC as {value, formula, calculation}.
        saveDc: num(data.save?.dc?.value ?? data.save?.dc, 0) || null,
        title: data.title ?? doc.name,
        img: data.img ?? doc.img
      });
    } else if (type === "slots") {
      const slot = actor.system?.spells?.[id];
      if (!slot) continue;
      entries.push({ ...base, level: num(slot.level, 0), img: config.spellcasting?.[slot.type]?.img?.replace?.("{id}", id) ?? "",
        uses: { value: num(slot.value, 0), max: resolveSpellSlotMax(slot) } });
    } else if (type === "skill" || type === "tool") {
      const data = actor.system?.[`${type}s`]?.[id];
      if (!data) continue;
      const skill = type === "skill" ? config.skills?.[id] : null;
      const label = skill?.label ?? globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${id}`) ?? id;
      entries.push({ ...base, title: localizeOr(label, label), img: skill?.icon ?? "icons/svg/d20.svg", modifier: num(data.total, 0) });
    }
  }
  return entries;
}

/**
 * The actor's effects as dnd5e's sheet lists them (`allApplicableEffects`, without those of an inactive origin and,
 * for players, of an unidentified item): state, statuses, time left, source and why dnd5e suppresses one
 * (`isSuppressed`: its item unequipped or unattuned). Foundry 14 reports a permanent effect's remainder as infinite.
 */
export function readEffects(actor, { isGM = false } = {}) {
  const entries = [];
  for (const effect of actor?.allApplicableEffects?.() ?? []) {
    const item = effect.parent?.documentName === "Item" ? effect.parent : null;
    if (effect.dependentOrigin?.active === false || (item?.system?.identified === false && !isGM)) continue;
    const remaining = effect.duration?.remaining;
    let source = item?.name ?? "";
    if (!source && effect.origin) {
      try { source = globalThis.foundry?.utils?.fromUuidSync?.(effect.origin, { relative: actor, strict: false })?.name ?? ""; }
      catch { source = ""; }
    }
    const suppressed = Boolean(effect.isSuppressed);
    entries.push({
      id: effect.id,
      uuid: effect.uuid,
      itemId: item?.id ?? null,
      relativeId: effect.getRelativeUUID?.(actor) ?? effect.uuid,
      name: effect.name,
      img: effect.img,
      disabled: Boolean(effect.disabled),
      suppressed,
      suppressedBy: !suppressed ? null : item?.system?.equipped === false ? "unequipped"
        : item?.system?.attunement === "required" && !item.system.attuned ? "unattuned" : "other",
      temporary: Boolean(effect.isTemporary),
      statuses: [...(effect.statuses ?? [])],
      onActor: effect.parent === actor,
      time: Number.isFinite(remaining) && remaining > 0 ? effect.duration.label ?? "" : "",
      source: source === effect.name ? "" : source
    });
  }
  return entries;
}

/**
 * An effect's changes (Foundry 14 keeps them in `system.changes`, typed by `type` instead of `mode`), each labelled
 * by the nearest labelled data field of the actor (a derived key such as `attributes.ac.bonus` takes «Armor Class»),
 * otherwise by its key.
 */
export function readEffectChanges(effect, actor) {
  return [...(effect?.system?.changes ?? effect?.changes ?? [])].map(({ key, type, value }) => {
    const parts = String(key).replace(/^system\./, "").split(".");
    let label = null;
    for (let n = parts.length; n > 0 && !label; n--) {
      try { label = actor?.system?.schema?.getField?.(parts.slice(0, n).join("."))?.label || null; }
      catch { label = null; }
    }
    return { key, type, value, label: label ? localizeOr(label, label) : key };
  });
}

/**
 * The statuses the token HUD offers (`CONFIG.statusEffects` without `hud: false`), less exhaustion and
 * concentration, which keep their rail chips; a condition is a non-pseudo entry of `DND5E.conditionTypes`.
 */
export function readStatusEffects() {
  const conditions = getDnd5eConfig().conditionTypes ?? {};
  const concentrating = globalThis.CONFIG?.specialStatusEffects?.CONCENTRATING ?? "concentrating";
  return (globalThis.CONFIG?.statusEffects ?? [])
    .filter((s) => s.hud !== false && s.id !== "exhaustion" && s.id !== concentrating)
    .map((s) => ({ id: s.id, name: localizeOr(s.name, s.name ?? s.id), img: s.img, condition: Boolean(conditions[s.id] && !conditions[s.id].pseudo) }));
}

/** The actor's dnd5e coins in CONFIG.DND5E.currencies order (pp, gp, ep, sp, cp in 5.3.3). */
export function readCoins(actor) {
  const currencies = getDnd5eConfig().currencies ?? {};
  return Object.entries(currencies).map(([key, cfg]) => ({
    key,
    label: localizeOr(cfg.label, cfg.label ?? key),
    abbr: localizeOr(cfg.abbreviation, cfg.abbreviation ?? key),
    value: num(actor?.system?.currency?.[key], 0)
  }));
}

/**
 * Format item details for rendering in inventory list and tooltips
 * @param {Object} item
 * @returns {Object}
 */
export function formatItemForDisplay(item) {
  if (!item) return null;

  const system = item.system ?? {};
  const rarity = (system.rarity ?? "common").toLowerCase();
  const rarityVisuals = getItemRarityVisuals(rarity);
  const rarityColor = rarityVisuals.color;
  const hasGlow = rarityVisuals.hasGlow;
  const isEquipped = Boolean(system.equipped);
  const qty = num(system.quantity, 1);
  // Totals and containers are shown in the world's unit, so rows are too.
  const weightUnit = getSystemWeightUnit();
  const weightUnits = unitAbbreviation("weightUnits", weightUnit);
  const priceVal = num(system.price?.value, 0);
  const priceDenom = system.price?.denomination ?? "gp";

  // Attunement state
  const attunementStatus = getAttunementStatus(item);
  const isAttuned = attunementStatus === "attuned";
  const requiresAttunement = attunementStatus !== "none";

  // Properties array/list
  const properties = [];
  const config = getDnd5eConfig();
  const itemProps = config.itemProperties ?? {};
  for (const k of system.properties ?? []) {
    properties.push(itemProps[k]?.label ?? k);
  }

  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    type: item.type,
    rarity,
    rarityKey: rarityVisuals.rarityKey,
    rarityLabel: rarityLabel(rarityVisuals.rarityKey),
    rarityColor,
    rarityGlowColor: rarityVisuals.glowColor,
    hasGlow,
    cssVars: rarityVisuals.cssVars,
    isEquipped,
    canEquip: canItemBeEquipped(item),
    quantity: qty,
    hasMultiple: qty > 1,
    isAttuned,
    requiresAttunement,
    attunementStatus,
    weightDisplay: `${getItemWeightInUnit(item, weightUnit).toFixed(1)} ${weightUnits}`,
    priceDisplay: priceVal > 0 ? `${priceVal} ${priceDenom}` : "",
    properties,
    description: system.description?.value ?? ""
  };
}

/**
 * Resolve the usable maximum for a spell slot entry.
 * `override` is a nullable NumberField in dnd5e - only an explicit number wins
 * over the derived `max`.
 * @param {Object} slotData
 * @returns {number}
 */
export function resolveSpellSlotMax(slotData) {
  const override = slotData?.override;
  if (override !== null && override !== undefined && override !== "") {
    const parsed = Number(override);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return Math.max(0, num(slotData?.max, 0));
}

/**
 * Extract active spell slots for an actor
 * @param {Object} actor
 * @returns {Array<Object>}
 */
export function extractSpellSlots(actor) {
  if (!actor) return [];
  const spells = actor.system?.spells ?? {};
  const slots = [];

  const buildSlot = (key, data, label, level) => {
    const max = resolveSpellSlotMax(data);
    if (max <= 0) return null;
    const value = Math.max(0, Math.min(max, num(data.value, 0)));
    return {
      key,
      label,
      level,
      value,
      max,
      isEmpty: value === 0,
      isFull: value === max,
      pips: Array.from({ length: max }, (_, i) => ({ index: i, filled: i < value }))
    };
  };

  // Pact Magic (Warlock)
  const pactSlot = buildSlot(
    "pact",
    spells.pact ?? {},
    globalThis.game?.i18n?.localize("AIM.spells.pact") || "Pact",
    num(spells.pact?.level, 1)
  );
  if (pactSlot) slots.push(pactSlot);

  // Regular Spell Slots (1st to 9th circle)
  for (let lvl = 1; lvl <= 9; lvl++) {
    const key = `spell${lvl}`;
    const slot = buildSlot(
      key,
      spells[key] ?? {},
      globalThis.game?.i18n?.format("AIM.spells.levelSlot", { level: lvl }) || `Lvl ${lvl}`,
      lvl
    );
    if (slot) slots.push(slot);
  }

  return slots;
}

/**
 * Resolve the preparation state of a spell: `system.method` ("spell" | "pact" |
 * "atwill" | "innate" | "ritual") plus numeric `system.prepared`
 * (0 unprepared, 1 prepared, 2 always prepared).
 * @param {Object} spellItem
 * @returns {{ method: string, prepared: number, isPrepared: boolean, isAlways: boolean, canPrepare: boolean }}
 */
export function resolveSpellPreparation(spellItem) {
  const system = spellItem?.system ?? {};
  const level = num(system.level, 0);
  const method = system.method || "";
  const prepared = num(system.prepared, 0);
  const spellcasting = getDnd5eConfig().spellcasting ?? {};
  // `prepares` is declared for the "spell" and "pact" methods.
  const methodPrepares = spellcasting[method]
    ? Boolean(spellcasting[method].prepares)
    : (method === "spell" || method === "pact");
  return {
    method,
    prepared,
    isPrepared: prepared >= 1 || level === 0,
    isAlways: prepared >= 2,
    canPrepare: methodPrepares && level > 0
  };
}

/**
 * Resolve the activation descriptor of an item.
 * Activation lives on activities; spells without one still carry `system.activation`.
 * @param {Object} item
 * @returns {{ type: string, value: number|null, config: Object }}
 */
export function resolveItemActivation(item) {
  const system = item?.system ?? {};
  const first = system.activities?.contents?.[0];
  const activation = first?.activation?.type ? first.activation : (system.activation ?? {});
  const type = activation.type || "";
  return {
    type,
    value: activation.value ?? null,
    config: getDnd5eConfig().activityActivationTypes?.[type] ?? {}
  };
}

/**
 * Resolve limited-use and recharge state. Recharge is a `uses.recovery` entry.
 * @param {Object} item
 * @returns {{ hasUses: boolean, usesDisplay: string, hasRecharge: boolean, rechargeDisplay: string, isCharged: boolean }}
 */
export function resolveItemUses(item) {
  const system = item?.system ?? {};
  const uses = system.uses ?? {};
  const max = num(uses.max, 0);
  const value = num(uses.value, Math.max(0, max - num(uses.spent, 0)));
  const hasUses = max > 0;

  const recovery = Array.isArray(uses.recovery) ? uses.recovery : [];
  const rechargeFormula = recovery.find(entry => entry?.period === "recharge")?.formula;
  const hasRecharge = Boolean(rechargeFormula);
  const threshold = num(rechargeFormula, 6);

  return {
    hasUses,
    usesDisplay: hasUses ? `${value} / ${max}` : "",
    hasRecharge,
    rechargeDisplay: hasRecharge ? `${threshold}${threshold < 6 ? "+" : ""}` : "",
    // A recharging item is "spent" when it has no uses left.
    isCharged: value > 0
  };
}

/**
 * Is the spell prepared for the day? Cantrips are always known, not prepared,
 * so only leveled spells marked prepared or always prepared count.
 * @param {Object} spellItem
 * @returns {boolean}
 */
export function isSpellPreparedForDay(spellItem) {
  return num(spellItem?.system?.level, 0) > 0 && resolveSpellPreparation(spellItem).prepared >= 1;
}

/**
 * Extract spells from an actor, grouped by circle/level.
 * Prepared spells leave their level group and lead the list in a group of
 * their own (`isPreparedGroup`), ordered by level and then name.
 * @param {Object} actor
 * @param {string} searchFilter
 * @returns {Array<Object>}
 */
export function extractActorSpells(actor, searchFilter = "") {
  if (!actor) return [];

  const config = getDnd5eConfig();
  const spellSchools = config.spellSchools ?? {};
  const query = (searchFilter || "").trim().toLowerCase();

  const spellItems = Array.from(actor.items.values()).filter(i => {
    if (i.type !== "spell") return false;
    if (!query) return true;
    return (i.name || "").toLowerCase().includes(query) || (i.system?.school || "").toLowerCase().includes(query);
  });

  // Group by spell level (0 = cantrip, 1..9 = circle)
  const preparedSpells = [];
  const grouped = new Map();
  for (let lvl = 0; lvl <= 9; lvl++) {
    grouped.set(lvl, []);
  }

  for (const spell of spellItems) {
    const system = spell.system ?? {};
    const lvl = num(system.level, 0);
    const schoolKey = system.school || "";
    const schoolLabel = spellSchools[schoolKey]?.label ?? schoolKey.toUpperCase();
    const schoolVisuals = getSpellSchoolVisuals(schoolKey, lvl, SPELL_SCHOOL_COLORS);
    const schoolColor = schoolVisuals.color;

    // Preparation status
    const prep = resolveSpellPreparation(spell);
    const mode = prep.method;
    const isPrepared = prep.isPrepared;
    const isAlwaysPrepared = prep.isAlways;
    const canTogglePrep = prep.canPrepare;

    // Activation info
    const activation = resolveItemActivation(spell);
    const activationLabel = formatActivationLabel(activation);

    // Components & Properties
    const hasProp = k => Boolean(system.properties?.has?.(k));

    // Range display
    const range = system.range ?? {};
    let rangeDisplay = "";
    if (range.units === "self") rangeDisplay = localizeOr("AIM.spells.range.self", "Self");
    else if (range.units === "touch") rangeDisplay = localizeOr("AIM.spells.range.touch", "Touch");
    else if (range.value) rangeDisplay = `${range.value} ${unitAbbreviation("movementUnits", range.units || "ft")}`;

    const formattedSpell = {
      id: spell.id,
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img || "icons/svg/daze.svg",
      level: lvl,
      levelLabel: globalThis.game?.i18n?.format("AIM.spells.levelSlot", { level: lvl }) || `Lvl ${lvl}`,
      school: schoolKey,
      schoolLabel,
      schoolColor,
      cssVars: schoolVisuals.cssVars,
      isPrepared,
      isAlwaysPrepared,
      canTogglePrep,
      mode,
      activationLabel,
      activationType: activation.type || "special",
      rangeDisplay,
      components: {
        v: hasProp("vocal"),
        s: hasProp("somatic"),
        m: hasProp("material"),
        ritual: hasProp("ritual"),
        concentration: hasProp("concentration")
      }
    };

    if (isSpellPreparedForDay(spell)) {
      preparedSpells.push(formattedSpell);
    } else if (grouped.has(lvl)) {
      grouped.get(lvl).push(formattedSpell);
    } else {
      grouped.set(lvl, [formattedSpell]);
    }
  }

  // Format into level groups array, prepared spells first
  const result = [];
  if (preparedSpells.length > 0) {
    preparedSpells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    result.push({
      level: "prepared",
      isPreparedGroup: true,
      title: localizeOr("AIM.spells.preparedGroup", "Prepared Spells"),
      count: preparedSpells.length,
      spells: preparedSpells
    });
  }
  for (const [lvl, spells] of grouped.entries()) {
    if (spells.length > 0) {
      spells.sort((a, b) => a.name.localeCompare(b.name));
      const groupTitle = lvl === 0
        ? (globalThis.game?.i18n?.localize("AIM.spells.cantrips") || "Cantrips")
        : (globalThis.game?.i18n?.format("AIM.spells.levelGroup", { level: lvl }) || `Level ${lvl}`);

      result.push({
        level: lvl,
        title: groupTitle,
        count: spells.length,
        spells
      });
    }
  }

  return result;
}

/**
 * Build a human-readable activation label.
 * @param {{ type: string, value: number|null, config: Object }} activation
 * @returns {string}
 */
export function formatActivationLabel(activation) {
  if (!activation?.type) return "";
  const i18n = globalThis.game?.i18n;
  const localize = key => i18n?.localize?.(key);
  // dnd5e localizes its labels up front, so a world without a dnd5e translation
  // shows them in English. The module carries its own for the common types.
  const ownKey = `AIM.spells.activation.${activation.type}`;
  let base;
  if (i18n?.has?.(ownKey, false)) {
    base = localize(ownKey);
  } else {
    const label = activation.config?.label ? localize(activation.config.label) : null;
    base = label && !label.startsWith("DND5E.") ? label : activation.type;
  }
  const count = num(activation.value, 0);
  return count > 1 ? `${count} ${base}` : base;
}

/**
 * Extract active and passive features/actions from an actor
 * @param {Object} actor
 * @param {string} searchFilter
 * @returns {Object} { actions, bonus, reactions, passives }
 */
export function extractActorActions(actor, searchFilter = "") {
  if (!actor) return { actions: [], bonus: [], reactions: [], passives: [] };

  const query = (searchFilter || "").trim().toLowerCase();
  const featItems = Array.from(actor.items.values()).filter(i => {
    if (i.type !== "feat") return false;
    if (!query) return true;
    return (i.name || "").toLowerCase().includes(query) || (i.system?.type?.label || "").toLowerCase().includes(query);
  });

  const actions = [];
  const bonus = [];
  const reactions = [];
  const passives = [];

  for (const feat of featItems) {
    const system = feat.system ?? {};
    const activation = resolveItemActivation(feat);
    const uses = resolveItemUses(feat);

    const featureLabel = localizeOr("AIM.spells.feature", "Feature");
    const sourceLabel = system.type?.label || system.source?.custom || featureLabel;

    // Mirrors the dnd5e sheet: "trait" property or a passive activation type.
    const isTrait = system.properties?.has?.("trait") ?? false;
    const isPassiveActivation = Boolean(activation.config?.passive) || !activation.type;

    const formattedFeat = {
      id: feat.id,
      uuid: feat.uuid,
      name: feat.name,
      img: feat.img || "icons/svg/aura.svg",
      type: system.type?.value || "feat",
      sourceLabel,
      activationType: activation.type || "none",
      activationLabel: formatActivationLabel(activation),
      ...uses
    };

    if (isTrait || isPassiveActivation) {
      passives.push(formattedFeat);
    } else if (activation.type === "action") {
      actions.push(formattedFeat);
    } else if (activation.type === "bonus") {
      bonus.push(formattedFeat);
    } else if (activation.type === "reaction") {
      reactions.push(formattedFeat);
    } else {
      // legendary / lair / minute / hour / ... still belong to the active list.
      actions.push(formattedFeat);
    }
  }

  // Sort each category alphabetically
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  actions.sort(sortByName);
  bonus.sort(sortByName);
  reactions.sort(sortByName);
  passives.sort(sortByName);

  return { actions, bonus, reactions, passives };
}

/**
 * Increment or decrement an actor's spell slot count
 * @param {Object} actor
 * @param {string} slotKey
 * @param {number} delta
 */
export async function updateSpellSlot(actor, slotKey, delta) {
  if (!actor || !slotKey) return;
  const spells = actor.system?.spells ?? {};
  const currentSlot = spells[slotKey];
  if (!currentSlot) return;

  const max = resolveSpellSlotMax(currentSlot);
  const currentVal = num(currentSlot.value, 0);
  const newVal = Math.max(0, Math.min(max, currentVal + delta));

  if (newVal !== currentVal) {
    await actor.update({ [`system.spells.${slotKey}.value`]: newVal });
  }
}

/**
 * Toggle prepared state of a spell
 * @param {Object} spellItem
 */
export async function toggleSpellPreparation(spellItem) {
  if (!spellItem || spellItem.type !== "spell") return;
  const prep = resolveSpellPreparation(spellItem);

  // "Always prepared" is a property of the spell, not a per-day choice.
  if (prep.isAlways) return;
  if (!prep.canPrepare) return;

  return spellItem.update({ "system.prepared": prep.prepared >= 1 ? 0 : 1 });
}

/**
 * How many items a container holds, nested containers and stack quantities included.
 * dnd5e 5.3.3 exposes `system.contentsCount`, a promise for items inside a compendium. Deleting a
 * container with `{ deleteContents: true }` makes dnd5e delete them too; otherwise they stay behind.
 * @param {Object} item
 * @returns {Promise<number>}
 */
export async function getContainerContentsCount(item) {
  if (item?.type !== "container") return 0;
  const count = Number(await item.system?.contentsCount);
  return Number.isFinite(count) ? count : 0;
}
