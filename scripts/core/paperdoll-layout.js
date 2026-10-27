// ─────────────────────────────────────────────────────────
// Actor window - where the doll's slots and attunement sockets sit (pure)
// ─────────────────────────────────────────────────────────

/** Slots beside the figure; the rest overflow into the grid under it. */
export const SLOTS_BESIDE_FIGURE = 12;
/** Sockets that fit under the figure between the bottom slots; more move to their own strip. */
const SOCKETS_UNDER_FIGURE = 3;
/** The strip lays sockets out in rows of at most five. */
const SOCKETS_PER_ROW = 5;

/** Where the GM may put a slot: either column beside the figure, or the grid under the doll. */
export const SLOT_ZONES = Object.freeze(["left", "right", "under"]);
const PER_SIDE = SLOTS_BESIDE_FIGURE / 2;

/**
 * The doll's grid. A slot with a zone goes where the GM put it; a slot without one takes its place by order: the
 * first half of the slots beside the figure fills the left column top-down, the rest the right column
 * bottom-aligned, so the main hand and the off hand face each other on the bottom row. A full column, the "under"
 * zone and anything past twelve slots go to the grid under the doll, in order.
 * @param {Object[]} slots  the preset's slots in doll order
 * @param {{max: number, attuned: number}} attunement
 */
export function dollLayout(slots, { max, attuned }) {
  const left = [], right = [], extra = [];
  const beside = slots.filter((slot) => slot.zone !== "under").length;
  const leftByOrder = Math.ceil(Math.min(beside, SLOTS_BESIDE_FIGURE) / 2);
  for (const slot of slots) {
    const side = slot.zone === "under" ? null
      : slot.zone === "left" ? left
      : slot.zone === "right" ? right
      : left.length < leftByOrder ? left : right;
    (side && side.length < PER_SIDE ? side : extra).push(slot);
  }
  const rows = Math.max(left.length, right.length, 3);
  const sockets = Math.max(max, attuned);
  const strip = max > SOCKETS_UNDER_FIGURE || attuned > SOCKETS_UNDER_FIGURE;
  const socketsInGrid = sockets > 0 && !strip;
  return {
    // A preset without slots and without attunement is a banner over the hold, not an empty doll.
    banner: slots.length === 0 && sockets === 0,
    rows,
    placed: [
      ...left.map((slot, i) => ({ slot, column: 1, row: i + 1 })),
      ...right.map((slot, i) => ({ slot, column: 3, row: rows - right.length + i + 1 }))
    ],
    extra,
    figureRows: socketsInGrid ? rows - 1 : rows,
    sockets,
    socketsInGrid,
    strip: sockets > 0 && strip,
    socketColumns: Math.min(sockets, SOCKETS_PER_ROW),
    over: attuned > max
  };
}
