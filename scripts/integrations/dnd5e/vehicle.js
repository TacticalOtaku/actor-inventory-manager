// ─────────────────────────────────────────────────────────
// Actor Inventory Manager - DnD5e Integration (Vehicles)
// ─────────────────────────────────────────────────────────

import { convertWeight, getSystemWeightUnit, num } from "../../core/weight-calculator.js";
import { getDnd5eConfig, localizeOr, unitAbbreviation } from "./common.js";

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
 * What a vehicle's window shows. dnd5e 5.3.3: `details.type` (CONFIG.DND5E.vehicleTypes labels), size in
 * `traits.size`, `traits.keel` / `beam` {value, units}; damage and mishap thresholds `attributes.hp.dt` / `mt`;
 * travel speed `attributes.travel.speeds[type]` in `travel.units` (CONFIG.DND5E.travelUnits); the hold's load is
 * `attributes.encumbrance.value` in the default weight unit (kg with metric weights), against
 * `attributes.capacity.cargo` {value, units}, both converted by CONFIG.DND5E.weightUnits factors; `crew` and
 * `passengers` are {max, value: actor UUIDs}, `draft.value` actor UUIDs without a maximum; older worlds keep
 * `cargo.crew` / `cargo.passengers` as {name, quantity} rows.
 * @param {Object} actor
 */
export function readVehicle(actor) {
  if (actor?.type !== "vehicle") return null;
  const config = getDnd5eConfig();
  const system = actor.system ?? {};
  const attributes = system.attributes ?? {};
  const traits = system.traits ?? {};
  const type = system.details?.type ?? null;
  const typeLabel = config.vehicleTypes?.[type];
  const size = config.actorSizes?.[traits.size]?.label;
  const length = (dim) => (num(dim?.value, 0) > 0 ? `${dim.value} ${unitAbbreviation("movementUnits", dim.units || "ft")}` : "");
  const travel = attributes.travel ?? {};
  const units = travel.units ?? "mph";
  const capacity = attributes.capacity?.cargo ?? {};
  const capUnit = capacity.units || "tn";
  const loadRaw = num(attributes.encumbrance?.value, 0);
  const group = (part) => ({ max: num(part?.max, 0) || null, uuids: [...(part?.value ?? [])].filter(Boolean) });
  const legacy = (kind) => [...(system.cargo?.[kind] ?? [])].filter((row) => row?.name).map((row) => ({ kind, name: row.name, quantity: num(row.quantity, 1) }));
  const abbreviation = config.travelUnits?.[units]?.abbreviationHour;
  return {
    type,
    typeLabel: typeLabel ? localizeOr(typeLabel, typeLabel) : "",
    size: size ? localizeOr(size, size) : "",
    keel: length(traits.keel),
    beam: length(traits.beam),
    dt: num(attributes.hp?.dt, 0) || null,
    mt: num(attributes.hp?.mt, 0) || null,
    // travel.speeds has land, water and air; dnd5e keeps a space vehicle's speed under air.
    speed: { value: num(travel.speeds?.[type === "space" ? "air" : type], 0), unit: abbreviation ? localizeOr(abbreviation, abbreviation) : units },
    cargo: {
      load: convertWeight(loadRaw, getSystemWeightUnit(), capUnit),
      capacity: Number.isFinite(Number(capacity.value)) && capacity.value !== null ? Number(capacity.value) : null,
      unit: unitAbbreviation("weightUnits", capUnit)
    },
    crew: group(system.crew),
    passengers: group(system.passengers),
    draft: group(system.draft),
    legacy: [...legacy("crew"), ...legacy("passengers")]
  };
}
