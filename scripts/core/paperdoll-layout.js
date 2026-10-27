// ─────────────────────────────────────────────────────────
// Actor window - where the doll's slots and attunement sockets sit (pure)
// ─────────────────────────────────────────────────────────

/** Slots beside the figure; the rest overflow into the grid under it. */
export const SLOTS_BESIDE_FIGURE = 12;
/** Sockets that fit under the figure between the bottom slots; more move to their own strip. */
const SOCKETS_UNDER_FIGURE = 3;
/** The strip lays sockets out in rows of at most five. */
const SOCKETS_PER_ROW = 5;

/**
 * The doll's grid: the first half of the slots fills the left column top-down, the rest the right column
 * bottom-aligned, so the main hand and the off hand face each other on the bottom row.
 * @param {Object[]} slots  the preset's slots in doll order
 * @param {{max: number, attuned: number}} attunement
 */
export function dollLayout(slots, { max, attuned }) {
  const placed = slots.slice(0, SLOTS_BESIDE_FIGURE);
  const extra = slots.slice(SLOTS_BESIDE_FIGURE);
  const half = Math.ceil(placed.length / 2);
  const rows = Math.max(half, 3);
  const right = placed.length - half;
  const sockets = Math.max(max, attuned);
  const strip = max > SOCKETS_UNDER_FIGURE || attuned > SOCKETS_UNDER_FIGURE;
  const socketsInGrid = sockets > 0 && !strip;
  return {
    // A preset without slots and without attunement is a banner over the hold, not an empty doll.
    banner: slots.length === 0 && sockets === 0,
    rows,
    placed: placed.map((slot, i) => (i < half
      ? { slot, column: 1, row: i + 1 }
      : { slot, column: 3, row: rows - right + (i - half) + 1 })),
    extra,
    figureRows: socketsInGrid ? rows - 1 : rows,
    sockets,
    socketsInGrid,
    strip: sockets > 0 && strip,
    socketColumns: Math.min(sockets, SOCKETS_PER_ROW),
    over: attuned > max
  };
}
