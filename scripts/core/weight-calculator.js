// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - Weight & Encumbrance Calculator
// ─────────────────────────────────────────────────────────

import { LBS_PER_KG } from "../constants.js";

/**
 * Size multiplier for carrying capacity in dnd5e
 */
const SIZE_MULTIPLIERS = {
  tiny: 0.5,
  sm: 1,
  med: 1,
  lg: 2,
  huge: 4,
  grg: 8
};

/**
 * Parse numeric value safely
 */
export function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Get current active system weight unit from game settings ("kg" or "lb")
 * @returns {"kg"|"lb"}
 */
export function getSystemWeightUnit() {
  try {
    return globalThis.game?.settings?.get?.("dnd5e", "metricWeightUnits") ? "kg" : "lb";
  } catch {
    return "lb";
  }
}

/**
 * Convert any numeric weight from a source unit to a target unit
 * @param {number} value
 * @param {string} [sourceUnit="lb"]
 * @param {string} [targetUnit="lb"]
 * @returns {number}
 */
export function convertWeight(value, sourceUnit = "lb", targetUnit = "lb") {
  const n = num(value, 0);
  const src = (sourceUnit || "lb").toLowerCase().trim();
  const tgt = (targetUnit || "lb").toLowerCase().trim();

  const srcIsKg = src === "kg" || src === "kgs" || src === "килограмм" || src === "кг";
  const tgtIsKg = tgt === "kg" || tgt === "kgs" || tgt === "килограмм" || tgt === "кг";

  if (srcIsKg === tgtIsKg) return n;

  if (srcIsKg && !tgtIsKg) {
    // kg -> lb
    return n * LBS_PER_KG;
  } else {
    // lb -> kg
    return n / LBS_PER_KG;
  }
}

/**
 * Convert pounds (lbs) to display unit (lbs or kg)
 */
export function formatWeight(lbs, unit = "lb") {
  const value = unit === "kg" ? lbs / LBS_PER_KG : lbs;
  return Number(value.toFixed(1));
}

/**
 * Calculate the weight of an item document converted to the specified target unit (or system unit)
 * @param {Object} item
 * @param {string} [targetUnit] "lb" | "kg"
 * @returns {number}
 */
export function getItemWeightInUnit(item, targetUnit = null) {
  if (!item) return 0;
  const tgt = targetUnit ?? getSystemWeightUnit();
  const rawWeight = num(item.system?.weight?.value ?? item.system?.weight, 0);
  const itemUnits = (item.system?.weight?.units || "lb").toLowerCase();
  const qty = Math.max(1, num(item.system?.quantity, 1));

  const converted = convertWeight(rawWeight, itemUnits, tgt);
  return converted * qty;
}

/**
 * Calculate raw weight of a single item document in pounds (lbs)
 */
export function getItemWeightLbs(item) {
  return getItemWeightInUnit(item, "lb");
}

/**
 * Extract container maximum capacity and convert to target unit
 * @param {Object} container
 * @param {string} [targetUnit] "lb" | "kg"
 * @returns {{ maxCapacity: number, capacityType: string, originalUnits: string }}
 */
export function getContainerCapacityInUnit(container, targetUnit = null) {
  if (!container) return { maxCapacity: 0, capacityType: "weight", originalUnits: "" };
  const tgt = targetUnit ?? getSystemWeightUnit();
  const system = container.system ?? {};
  const cap = system.capacity;

  let rawMax = 0;
  let capacityType = "weight";
  let rawUnits = "";

  if (typeof cap === "number") {
    rawMax = cap;
    rawUnits = "lb";
  } else if (cap && typeof cap === "object") {
    if (cap.weight !== undefined) {
      if (typeof cap.weight === "object" && cap.weight !== null) {
        rawMax = num(cap.weight.value ?? cap.weight.max, 0);
        rawUnits = cap.weight.units || "";
      } else {
        rawMax = num(cap.weight, 0);
      }
      capacityType = "weight";
    }

    if (!rawMax && cap.value !== undefined) {
      rawMax = num(cap.value, 0);
      rawUnits = cap.units || "";
      capacityType = cap.type || "weight";
    }

    if (!rawMax && cap.max !== undefined) {
      rawMax = num(cap.max, 0);
    }

    if (!rawMax && cap.count !== undefined && cap.count !== null) {
      rawMax = num(cap.count, 0);
      capacityType = "items";
    }
  }

  // Weighty Containers flags
  const wcFlags = container.flags?.["weighty-containers"];
  if (wcFlags && !rawMax) {
    rawMax = num(wcFlags.maxWeight ?? wcFlags.capacity ?? wcFlags.rules?.maxWeight, 0);
    rawUnits = wcFlags.units || "";
  }

  // Fallback defaults for standard 5e containers (all standard 5e values are in lbs)
  if (!rawMax) {
    const nameLower = (container.name || "").toLowerCase();
    if (nameLower.includes("pouch") || nameLower.includes("поясная сумка") || nameLower.includes("кошель")) {
      rawMax = 6;
      rawUnits = "lb";
    } else if (nameLower.includes("chest") || nameLower.includes("сундук")) {
      rawMax = 300;
      rawUnits = "lb";
    } else if (nameLower.includes("barrel") || nameLower.includes("бочка")) {
      rawMax = 200;
      rawUnits = "lb";
    } else if (nameLower.includes("basket") || nameLower.includes("корзина")) {
      rawMax = 40;
      rawUnits = "lb";
    } else if (nameLower.includes("bag of holding") || nameLower.includes("бездонная сумка")) {
      rawMax = 500;
      rawUnits = "lb";
    } else if (nameLower.includes("haversack") || nameLower.includes("походная сумка")) {
      rawMax = 120;
      rawUnits = "lb";
    } else if (container.type === "container" || container.type === "backpack" || system.type?.value === "container") {
      rawMax = 30;
      rawUnits = "lb";
    }
  }

  if (capacityType === "items" || rawMax === 0) {
    return { maxCapacity: rawMax, capacityType, originalUnits: rawUnits };
  }

  // If unit wasn't specified, assume "lb"
  const sourceUnit = rawUnits || "lb";
  const convertedMax = convertWeight(rawMax, sourceUnit, tgt);

  return {
    maxCapacity: Math.round(convertedMax * 10) / 10,
    capacityType,
    originalUnits: rawUnits || sourceUnit
  };
}

/**
 * Calculate base carrying capacity and encumbrance tiers for an actor in dnd5e
 * @param {Object} actor
 * @param {string} [unit="lb"]
 * @returns {Object}
 */
export function computeActorCapacity(actor, unit = "lb") {
  const str = num(actor?.system?.abilities?.str?.value, 10);
  const size = actor?.system?.traits?.size ?? "med";
  const sizeMult = SIZE_MULTIPLIERS[size] ?? 1;

  // Powerful build / countAsTrait check
  const powerfulBuild = Boolean(
    actor?.system?.traits?.traits?.powerfulBuild ||
    actor?.flags?.dnd5e?.powerfulBuild ||
    actor?.system?.attributes?.encumbrance?.multiplier > 1
  );
  const effectiveSizeMult = powerfulBuild ? sizeMult * 2 : sizeMult;

  // Standard 5e carrying capacity in lbs:
  // Max = STR * 15 * sizeMult
  // Variant encumbrance:
  // Encumbered = STR * 5 * sizeMult
  // Heavily Encumbered = STR * 10 * sizeMult
  // Push/Drag/Lift = STR * 30 * sizeMult
  const maxLbs = str * 15 * effectiveSizeMult;
  const encumberedLbs = str * 5 * effectiveSizeMult;
  const heavilyEncumberedLbs = str * 10 * effectiveSizeMult;
  const maxPushDragLbs = str * 30 * effectiveSizeMult;

  return {
    max: formatWeight(maxLbs, unit),
    encumbered: formatWeight(encumberedLbs, unit),
    heavilyEncumbered: formatWeight(heavilyEncumberedLbs, unit),
    maxPushDrag: formatWeight(maxPushDragLbs, unit),
    unit,
    raw: {
      maxLbs,
      encumberedLbs,
      heavilyEncumberedLbs,
      maxPushDragLbs
    }
  };
}

/**
 * Compute total carried weight and encumbrance status for an actor
 * @param {Object} actor
 * @param {Object} [options={}]
 * @returns {Object}
 */
export function computeActorEncumbrance(actor, options = {}) {
  const unit = options.unit ?? getSystemWeightUnit();
  const capacity = computeActorCapacity(actor, unit);

  // If actor has system encumbrance pre-calculated (or patched by weighty-containers)
  const systemEnc = actor?.system?.attributes?.encumbrance;
  let totalValueDisplay = 0;

  if (typeof options.overrideCarriedLbs === "number") {
    totalValueDisplay = formatWeight(options.overrideCarriedLbs, unit);
  } else if (systemEnc && typeof systemEnc.value === "number" && !options.recalculateRaw) {
    totalValueDisplay = Number(systemEnc.value.toFixed(1));
  } else {
    // Recalculate raw item weights from actor.items
    let totalLbs = 0;
    if (actor?.items) {
      for (const item of actor.items.values()) {
        totalLbs += getItemWeightLbs(item);
      }
    }
    totalValueDisplay = formatWeight(totalLbs, unit);
  }

  const maxCapacity = capacity.max > 0 ? capacity.max : 1;
  const pct = Math.min(100, Math.max(0, Math.round((totalValueDisplay / maxCapacity) * 100)));
  const isOverMax = totalValueDisplay > capacity.max;
  const isHeavilyEncumbered = totalValueDisplay > capacity.heavilyEncumbered;
  const isEncumbered = totalValueDisplay > capacity.encumbered;

  let tier = "normal";
  let tierLabelKey = "AIM.encumbrance.normal";
  let tierClass = "is-normal";

  if (isOverMax) {
    tier = "overburdened";
    tierLabelKey = "AIM.encumbrance.overburdened";
    tierClass = "is-overburdened";
  } else if (isHeavilyEncumbered) {
    tier = "heavily_encumbered";
    tierLabelKey = "AIM.encumbrance.heavily_encumbered";
    tierClass = "is-heavily-encumbered";
  } else if (isEncumbered) {
    tier = "encumbered";
    tierLabelKey = "AIM.encumbrance.encumbered";
    tierClass = "is-encumbered";
  }

  return {
    value: totalValueDisplay,
    max: capacity.max,
    pct,
    unit,
    tier,
    tierLabelKey,
    tierClass,
    isEncumbered,
    isHeavilyEncumbered,
    isOverMax,
    thresholds: {
      encumbered: capacity.encumbered,
      heavilyEncumbered: capacity.heavilyEncumbered,
      max: capacity.max
    }
  };
}
