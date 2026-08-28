// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration Adapter
// ─────────────────────────────────────────────────────────

import { ITEM_RARITY_COLORS } from "../constants.js";
import { num } from "../core/weight-calculator.js";
import { computeActorCurrency } from "./item-piles.js";
import {
  getItemRarityVisuals,
  getRarityColor,
  getSpellSchoolColor,
  getSpellSchoolVisuals
} from "./sc-rarity-colors.js";

/**
 * Get DnD5e config object safely
 */
export function getDnd5eConfig() {
  return globalThis.CONFIG?.DND5E ?? {};
}

/**
 * Get system weight unit ("kg" or "lb")
 */
export function getSystemWeightUnit() {
  try {
    return globalThis.game?.settings?.get("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  } catch {
    return "lb";
  }
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
  const init = attributes.init?.total ?? attributes.init?.mod ?? 0;

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
  const speedUnit = movement.units || "ft";
  if (movement.walk) speeds.push(`${movement.walk} ${speedUnit}`);
  if (movement.fly) speeds.push(`Fly ${movement.fly} ${speedUnit}`);
  if (movement.swim) speeds.push(`Swim ${movement.swim} ${speedUnit}`);
  if (movement.climb) speeds.push(`Climb ${movement.climb} ${speedUnit}`);
  const speedDisplay = speeds.length > 0 ? speeds.join(", ") : `${movement.walk ?? 30} ${speedUnit}`;

  // Attunement calculation
  const attunedItemsCount = Array.from(actor.items.values()).filter(i => {
    const att = i.system?.attunement;
    return i.system?.attuned === true || att === 2 || att === "attuned" || att === "ATTUNED" || String(att).toLowerCase() === "attuned";
  }).length;
  const attunementMax = attributes.attunement?.max ?? 3;

  return {
    name: actor.name,
    img: actor.img,
    level,
    race,
    background,
    alignment,
    hp: {
      value: num(hp.value, 0),
      max: num(hp.max, 0),
      temp: num(hp.temp, 0),
      pct: hp.max > 0 ? Math.min(100, Math.max(0, Math.round((num(hp.value, 0) / num(hp.max, 0)) * 100))) : 0
    },
    ac,
    init: init >= 0 ? `+${init}` : `${init}`,
    speed: speedDisplay,
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
      pct: attunementMax > 0 ? Math.round((attunedItemsCount / attunementMax) * 100) : 0
    }
  };
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
  const rarityVisuals = getItemRarityVisuals(rarity, item);
  const rarityColor = rarityVisuals.color;
  const hasGlow = rarityVisuals.hasGlow;
  const isEquipped = Boolean(system.equipped);
  const qty = num(system.quantity, 1);
  const weight = num(system.weight?.value ?? system.weight, 0);
  const weightUnits = system.weight?.units ?? getSystemWeightUnit();
  const priceVal = num(system.price?.value ?? system.price, 0);
  const priceDenom = system.price?.denomination ?? "gp";

  // Attunement state
  let attunementStatus = "none";
  let requiresAttunement = false;
  let isAttuned = false;

  const att = system.attunement;
  const attuned = system.attuned;

  if (attuned === true || att === 2 || att === "attuned" || att === "ATTUNED" || String(att).toLowerCase() === "attuned") {
    attunementStatus = "attuned";
    isAttuned = true;
    requiresAttunement = true;
  } else if (att === 1 || att === "required" || att === "optional" || String(att).toLowerCase() === "required" || String(att).toLowerCase() === "optional") {
    attunementStatus = "required";
    isAttuned = false;
    requiresAttunement = true;
  }

  // Properties array/list
  const properties = [];
  const config = getDnd5eConfig();
  const itemProps = config.itemProperties ?? {};
  const weaponProps = config.weaponProperties ?? {};
  const armorProps = config.armorProperties ?? {};

  const propSet = system.properties;
  if (propSet) {
    const keys = propSet instanceof Set ? Array.from(propSet) : Array.isArray(propSet) ? propSet : Object.keys(propSet).filter(k => propSet[k]);
    for (const k of keys) {
      const label = itemProps[k]?.label ?? weaponProps[k]?.label ?? armorProps[k]?.label ?? k;
      properties.push(label);
    }
  }

  return {
    id: item.id,
    uuid: item.uuid,
    name: item.name,
    img: item.img || "icons/svg/item-bag.svg",
    type: item.type,
    rarity,
    rarityKey: rarityVisuals.rarityKey,
    rarityColor,
    rarityGlowColor: rarityVisuals.glowColor,
    hasGlow,
    cssVars: rarityVisuals.cssVars,
    isEquipped,
    quantity: qty,
    hasMultiple: qty > 1,
    isAttuned,
    requiresAttunement,
    attunementStatus,
    weightDisplay: `${(weight * qty).toFixed(1)} ${weightUnits}`,
    priceDisplay: priceVal > 0 ? `${priceVal} ${priceDenom}` : "",
    properties,
    description: system.description?.value ?? ""
  };
}

export const SPELL_SCHOOL_COLORS = {
  abj: "#3498db", // Abjuration: Blue
  con: "#f39c12", // Conjuration: Amber
  div: "#9b59b6", // Divination: Purple
  enc: "#e91e63", // Enchantment: Pink
  evo: "#e74c3c", // Evocation: Red
  ill: "#1abc9c", // Illusion: Teal
  nec: "#2ecc71", // Necromancy: Green
  trs: "#d35400"  // Transmutation: Dark Orange
};

/**
 * Extract active spell slots for an actor
 * @param {Object} actor
 * @returns {Array<Object>}
 */
export function extractSpellSlots(actor) {
  if (!actor) return [];
  const spells = actor.system?.spells ?? {};
  const slots = [];

  // Pact Magic (Warlock)
  if (spells.pact && (num(spells.pact.max, 0) > 0 || num(spells.pact.override, 0) > 0)) {
    const max = num(spells.pact.override, spells.pact.max);
    const value = Math.max(0, Math.min(max, num(spells.pact.value, 0)));
    slots.push({
      key: "pact",
      label: globalThis.game?.i18n?.localize("AIM.spells.pact") || "Pact",
      level: spells.pact.level || 1,
      value,
      max,
      pips: Array.from({ length: max }, (_, i) => ({ index: i, filled: i < value }))
    });
  }

  // Regular Spell Slots (1st to 9th circle)
  for (let lvl = 1; lvl <= 9; lvl++) {
    const key = `spell${lvl}`;
    const data = spells[key];
    if (data && (num(data.max, 0) > 0 || num(data.override, 0) > 0)) {
      const max = num(data.override, data.max);
      const value = Math.max(0, Math.min(max, num(data.value, 0)));
      slots.push({
        key,
        label: globalThis.game?.i18n?.format("AIM.spells.levelSlot", { level: lvl }) || `Lvl ${lvl}`,
        level: lvl,
        value,
        max,
        pips: Array.from({ length: max }, (_, i) => ({ index: i, filled: i < value }))
      });
    }
  }

  return slots;
}

/**
 * Extract spells from an actor, grouped by circle/level
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

    // Preparation status (dnd5e 5.1+ uses system.method & system.prepared)
    const mode = system.method ?? (system.preparation?.mode || "prepared");
    const preparedVal = system.prepared ?? system.preparation?.prepared;
    const isAlwaysOrInnate = mode === "always" || mode === "atwill" || mode === "innate" || mode === "pact";
    const isPrepared = Boolean(preparedVal || isAlwaysOrInnate || lvl === 0);
    const canTogglePrep = mode === "prepared" && lvl > 0;

    // Activation info
    const act = system.activation ?? {};
    let activationLabel = "";
    if (act.type) {
      if (act.type === "action") activationLabel = "1 Action";
      else if (act.type === "bonus") activationLabel = "Bonus";
      else if (act.type === "reaction") activationLabel = "Reaction";
      else if (act.type === "minute") activationLabel = `${act.cost || 1} min`;
      else if (act.type === "hour") activationLabel = `${act.cost || 1} hr`;
      else activationLabel = act.type;
    }

    // Components & Properties
    const propSet = system.properties;
    const hasProp = (k) => {
      if (!propSet) return false;
      if (propSet instanceof Set) return propSet.has(k);
      if (Array.isArray(propSet)) return propSet.includes(k);
      return Boolean(propSet[k]);
    };

    const isVocal = hasProp("vocal") || Boolean(system.components?.vocal || system.components?.v);
    const isSomatic = hasProp("somatic") || Boolean(system.components?.somatic || system.components?.s);
    const isMaterial = hasProp("material") || Boolean(system.components?.material || system.components?.m);
    const isRitual = hasProp("ritual") || Boolean(system.components?.ritual);
    const isConcentration = hasProp("concentration") || Boolean(system.components?.concentration);

    // Range display
    const range = system.range ?? {};
    let rangeDisplay = "";
    if (range.units === "self") rangeDisplay = "Self";
    else if (range.units === "touch") rangeDisplay = "Touch";
    else if (range.value) rangeDisplay = `${range.value} ${range.units || "ft"}`;

    const formattedSpell = {
      id: spell.id,
      uuid: spell.uuid,
      name: spell.name,
      img: spell.img || "icons/svg/daze.svg",
      level: lvl,
      school: schoolKey,
      schoolLabel,
      schoolColor,
      cssVars: schoolVisuals.cssVars,
      isPrepared,
      canTogglePrep,
      mode,
      activationLabel,
      activationType: act.type || "special",
      rangeDisplay,
      components: {
        v: isVocal,
        s: isSomatic,
        m: isMaterial,
        ritual: isRitual,
        concentration: isConcentration
      }
    };

    if (grouped.has(lvl)) {
      grouped.get(lvl).push(formattedSpell);
    } else {
      grouped.set(lvl, [formattedSpell]);
    }
  }

  // Format into level groups array
  const result = [];
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
    const act = system.activation ?? {};
    const uses = system.uses ?? {};
    const recharge = system.recharge ?? {};

    const hasUses = Boolean(uses.max && uses.max > 0);
    const usesDisplay = hasUses ? `${uses.value ?? 0} / ${uses.max}` : "";

    const hasRecharge = Boolean(recharge.value);
    const rechargeDisplay = hasRecharge ? `${recharge.value}+` : "";

    let sourceLabel = system.type?.label || system.source?.custom || system.source || "Feature";
    if (typeof sourceLabel !== "string") sourceLabel = "Feature";

    const formattedFeat = {
      id: feat.id,
      uuid: feat.uuid,
      name: feat.name,
      img: feat.img || "icons/svg/aura.svg",
      type: system.type?.value || "feat",
      sourceLabel,
      activationType: act.type || "none",
      hasUses,
      usesDisplay,
      hasRecharge,
      rechargeDisplay,
      isCharged: Boolean(recharge.charged)
    };

    if (act.type === "action") {
      actions.push(formattedFeat);
    } else if (act.type === "bonus") {
      bonus.push(formattedFeat);
    } else if (act.type === "reaction") {
      reactions.push(formattedFeat);
    } else {
      passives.push(formattedFeat);
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

  const max = num(currentSlot.override, currentSlot.max);
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
  const system = spellItem.system ?? {};
  const currentPrepared = Boolean(system.prepared ?? system.preparation?.prepared);
  const next = !currentPrepared;

  const updateData = {};
  if (system.prepared !== undefined || system.method !== undefined) {
    updateData["system.prepared"] = next;
  } else {
    updateData["system.preparation.prepared"] = next;
  }
  await spellItem.update(updateData);
}

