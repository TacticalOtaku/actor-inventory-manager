// ─────────────────────────────────────────────────────────
// Actor window - a vehicle's cargo and crew places (pure)
// ─────────────────────────────────────────────────────────

/**
 * A weight from one unit to another by dnd5e's factors (how many pounds a unit holds); null without both factors.
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @param {Record<string, number>} factors
 */
export function convertWeight(value, from, to, factors) {
  const a = Number(factors?.[from]);
  const b = Number(factors?.[to]);
  return a > 0 && b > 0 ? (Number(value) || 0) * a / b : null;
}

/**
 * The cargo meter: load against capacity, the bar's share (0…1) and whether the load is over; without a capacity
 * there is no bar to fill.
 * @param {number} load
 * @param {number|null} capacity
 */
export function cargoMeter(load, capacity) {
  const max = Number(capacity) > 0 ? Number(capacity) : 0;
  return { value: load, max, share: max ? Math.min(1, load / max) : 0, over: max > 0 && load > max };
}

/**
 * A crew group's places: how many are taken, out of how many, the free ones and whether it is over; a group
 * without a maximum (draft animals) has no free places.
 * @param {number} count
 * @param {number|null} max
 */
export function seats(count, max) {
  const limit = Number(max) > 0 ? Number(max) : 0;
  return { count, max: limit, free: limit ? Math.max(0, limit - count) : 0, over: limit > 0 && count > limit };
}

/** A number as the window writes a weight: at most two decimals, none when whole. */
export const weightText = (value) => String(Math.round((Number(value) || 0) * 100) / 100);
