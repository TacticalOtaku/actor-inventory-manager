// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration Adapter
// ─────────────────────────────────────────────────────────

// (rarity + school colours are resolved through the sc-rarity-colors adapter)
import { SPELL_SCHOOL_COLORS } from "../constants.js";
import { countAttunedItems, getActorAttunementMax, getAttunementStatus } from "../core/attunement.js";
import { canItemBeEquipped } from "../core/item-classifier.js";
import { getSystemWeightUnit, num } from "../core/weight-calculator.js";
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
      isOver: attunedItemsCount > attunementMax,
      pct: attunementMax > 0 ? Math.min(100, Math.round((attunedItemsCount / attunementMax) * 100)) : 0
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
  const weight = num(system.weight?.value, 0);
  const weightUnits = unitAbbreviation("weightUnits", system.weight?.units ?? getSystemWeightUnit());
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
    weightDisplay: `${(weight * qty).toFixed(1)} ${weightUnits}`,
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
  const localize = key => globalThis.game?.i18n?.localize?.(key);
  const label = activation.config?.label ? localize(activation.config.label) : null;
  const base = label && !label.startsWith("DND5E.") ? label : activation.type;
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

