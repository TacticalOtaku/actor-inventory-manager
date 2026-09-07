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
 * Parse numeric value safely.
 * `null`, `undefined` and empty strings count as "absent" and yield the fallback.
 * Number(null) is 0 and finite, which would otherwise swallow nullable dnd5e
 * fields such as `system.spells.spell1.override`.
 */
export function num(val, fallback = 0) {
  if (val === null || val === undefined || val === "") return fallback;
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
 * Per-point-of-STR encumbrance thresholds used by dnd5e.
 * Metric is NOT a unit conversion of the imperial values - the system defines
 * its own rounder metric numbers (CONFIG.DND5E.encumbrance.threshold).
 */
const THRESHOLD_PER_STR = {
  lb: { encumbered: 5, heavilyEncumbered: 10, maximum: 15, pushDrag: 30 },
  kg: { encumbered: 2.5, heavilyEncumbered: 5, maximum: 7.5, pushDrag: 15 }
};

function thresholdConfig(unit) {
  const fromSystem = globalThis.CONFIG?.DND5E?.encumbrance?.threshold;
  const key = unit === "kg" ? "metric" : "imperial";
  const fallback = THRESHOLD_PER_STR[unit === "kg" ? "kg" : "lb"];
  if (!fromSystem) return fallback;
  return {
    encumbered: num(fromSystem.encumbered?.[key], fallback.encumbered),
    heavilyEncumbered: num(fromSystem.heavilyEncumbered?.[key], fallback.heavilyEncumbered),
    maximum: num(fromSystem.maximum?.[key], fallback.maximum),
    pushDrag: num(fromSystem.maximum?.[key], fallback.maximum) * 2
  };
}

/**
 * Read the encumbrance block dnd5e derives on the actor.
 * This is the authoritative source: it accounts for the metric/imperial variant,
 * size and Powerful Build, encumbrance bonuses/multipliers from items and effects,
 * optional currency weight, and any patches applied by other modules
 * (Weighty Containers rewrites `.value` and `.pct` there).
 * @param {Object} actor
 * @returns {Object|null}
 */
export function getSystemEncumbrance(actor) {
  const enc = actor?.system?.attributes?.encumbrance;
  if (!enc) return null;
  const max = Number(enc.max);
  const value = Number(enc.value);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(value)) return null;
  return enc;
}

/**
 * Calculate base carrying capacity and encumbrance tiers for an actor in dnd5e
 * @param {Object} actor
 * @param {string} [unit="lb"]
 * @returns {Object}
 */
export function computeActorCapacity(actor, unit = "lb") {
  // Prefer the system's own derived thresholds when available.
  const systemEnc = getSystemEncumbrance(actor);
  if (systemEnc) {
    const thresholds = systemEnc.thresholds ?? {};
    const maxVal = num(systemEnc.max, 0);
    const encumberedVal = num(thresholds.encumbered, maxVal / 3);
    const heavyVal = num(thresholds.heavilyEncumbered, (maxVal / 3) * 2);
    return {
      max: Number(maxVal.toFixed(1)),
      encumbered: Number(encumberedVal.toFixed(1)),
      heavilyEncumbered: Number(heavyVal.toFixed(1)),
      maxPushDrag: Number((maxVal * 2).toFixed(1)),
      unit,
      fromSystem: true,
      raw: {
        maxLbs: convertWeight(maxVal, unit, "lb"),
        encumberedLbs: convertWeight(encumberedVal, unit, "lb"),
        heavilyEncumberedLbs: convertWeight(heavyVal, unit, "lb"),
        maxPushDragLbs: convertWeight(maxVal * 2, unit, "lb")
      }
    };
  }

  const str = num(actor?.system?.abilities?.str?.value, 10);
  const size = actor?.system?.traits?.size ?? "med";
  const sizeMult = SIZE_MULTIPLIERS[size] ?? 1;

  // Powerful Build bumps the actor one size category up for carrying purposes.
  const powerfulBuild = Boolean(
    actor?.system?.traits?.traits?.powerfulBuild ||
    actor?.flags?.dnd5e?.powerfulBuild
  );
  const effectiveSizeMult = powerfulBuild ? sizeMult * 2 : sizeMult;

  // Fallback tiers computed directly in the display unit, matching the
  // per-STR thresholds the system uses for that unit system.
  const t = thresholdConfig(unit);
  const max = str * t.maximum * effectiveSizeMult;
  const encumbered = str * t.encumbered * effectiveSizeMult;
  const heavilyEncumbered = str * t.heavilyEncumbered * effectiveSizeMult;
  const maxPushDrag = str * t.pushDrag * effectiveSizeMult;

  return {
    max: Number(max.toFixed(1)),
    encumbered: Number(encumbered.toFixed(1)),
    heavilyEncumbered: Number(heavilyEncumbered.toFixed(1)),
    maxPushDrag: Number(maxPushDrag.toFixed(1)),
    unit,
    fromSystem: false,
    raw: {
      maxLbs: convertWeight(max, unit, "lb"),
      encumberedLbs: convertWeight(encumbered, unit, "lb"),
      heavilyEncumberedLbs: convertWeight(heavilyEncumbered, unit, "lb"),
      maxPushDragLbs: convertWeight(maxPushDrag, unit, "lb")
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
  const systemEnc = getSystemEncumbrance(actor);
  let totalValueDisplay = 0;

  if (typeof options.overrideCarriedLbs === "number") {
    totalValueDisplay = formatWeight(options.overrideCarriedLbs, unit);
  } else if (systemEnc && !options.recalculateRaw) {
    totalValueDisplay = Number(num(systemEnc.value, 0).toFixed(1));
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
    fromSystem: Boolean(capacity.fromSystem),
    thresholds: {
      encumbered: capacity.encumbered,
      heavilyEncumbered: capacity.heavilyEncumbered,
      max: capacity.max,
      maxPushDrag: capacity.maxPushDrag
    },
    // Percentage offsets for drawing tier markers on the meter.
    stops: {
      encumbered: Math.min(100, Math.max(0, Math.round((capacity.encumbered / maxCapacity) * 100))),
      heavilyEncumbered: Math.min(100, Math.max(0, Math.round((capacity.heavilyEncumbered / maxCapacity) * 100)))
    }
  };
}
