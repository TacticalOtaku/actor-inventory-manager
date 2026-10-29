// ─────────────────────────────────────────────────────────
// AIM: Actor Window - a vehicle's rail: thresholds, speed, the hold's load and who is aboard
// ─────────────────────────────────────────────────────────

import { cargoMeter, seats, weightText } from "../core/vehicle.js";
import { readVehicle } from "../integrations/dnd5e.js";
import { t } from "./html.js";

// shortcut: free places draw at most this many placeholders; a galleon's hundred deckhands show as a count instead.
const MAX_FREE_DRAWN = 12;

/** One aboard: a portrait to open, or «Неизвестный» for an actor the viewer may not see (or one that is gone). */
function member(uuid) {
  const actor = fromUuidSync(uuid);
  if (!actor?.testUserPermission?.(game.user, "LIMITED")) return { unknown: true, name: t("AIM.window.crew.unknown") };
  return { uuid, name: actor.name, img: actor.img, openLabel: t("AIM.window.crew.open", { name: actor.name }) };
}

function group(id, part) {
  const place = seats(part.uuids.length, part.max);
  return {
    id,
    label: t(`AIM.window.crew.${id}`),
    members: part.uuids.map(member),
    countText: place.max ? t("AIM.window.crew.count", { count: place.count, max: place.max }) : String(place.count),
    freeText: place.free ? t("AIM.window.crew.free", { n: place.free }) : "",
    freeSeats: Array.from({ length: Math.min(place.free, MAX_FREE_DRAWN) }),
    over: place.over
  };
}

/** What the rail shows of a vehicle: its stats, the cargo meter, the crew groups and rows without an actor. */
export function buildVehicleRail(actor) {
  const vehicle = readVehicle(actor);
  if (!vehicle) return null;
  const meter = cargoMeter(vehicle.cargo.load, vehicle.cargo.capacity);
  const groups = [group("crew", vehicle.crew), group("passengers", vehicle.passengers)];
  // Draft animals pull a land vehicle; the others have none.
  if (vehicle.type === "land" || vehicle.draft.uuids.length) groups.push(group("draft", vehicle.draft));
  return {
    dt: vehicle.dt ?? "—",
    mt: vehicle.mt ?? "—",
    speed: vehicle.speed,
    cargo: { ...meter, unit: vehicle.cargo.unit, valueText: weightText(meter.value), maxText: weightText(meter.max), share: meter.share.toFixed(4) },
    crew: groups,
    legacy: vehicle.legacy.map((row) => ({ ...row, kindLabel: t(`AIM.window.crew.${row.kind}`) }))
  };
}

/** The line under a vehicle's name: type, size, keel and beam. */
export function vehicleKind(actor) {
  const vehicle = readVehicle(actor);
  if (!vehicle) return "";
  return [
    vehicle.typeLabel,
    vehicle.size,
    vehicle.keel && t("AIM.window.vehicle.keel", { length: vehicle.keel }),
    vehicle.beam && t("AIM.window.vehicle.beam", { length: vehicle.beam })
  ].filter(Boolean).join(" · ");
}
