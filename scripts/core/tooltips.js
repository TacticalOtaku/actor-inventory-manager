// ─────────────────────────────────────────────────────────
// Actor window - tooltip cards: timing, nesting, pinning and sweeping, over plain card records (pure)
// A card record: {id, parent: id|null, depth, pinned, at} — `at` orders pinned cards, oldest first.
// ─────────────────────────────────────────────────────────

export const TIP_TIMING = Object.freeze({ open: 400, nested: 300, close: 200, pinHold: 1200 });
export const TIP_MAX_DEPTH = 4;
export const TIP_MAX_PINNED = 6;

/** A top card opens after a pause, at once while another top card is open; a link inside a card waits less. */
export function openDelay({ inCard, liveTop }) {
  if (inCard) return TIP_TIMING.nested;
  return liveTop ? 0 : TIP_TIMING.open;
}

/**
 * Where a new card hanging from `parentId` goes: its depth and the unpinned cards it replaces (one live card per
 * level); null past four levels.
 */
export function planOpen(cards, parentId) {
  const parent = parentId ? cards.find((c) => c.id === parentId) : null;
  const depth = parent ? parent.depth + 1 : 1;
  if (depth > TIP_MAX_DEPTH) return null;
  return { depth, replace: cards.filter((c) => !c.pinned && c.parent === (parentId ?? null)).map((c) => c.id) };
}

/** Closing a card closes its unpinned descendants; a pinned one stands on its own from then on. */
export function planClose(cards, id) {
  const close = [];
  const detach = [];
  const walk = (cardId) => {
    close.push(cardId);
    for (const child of cards.filter((c) => c.parent === cardId)) {
      if (child.pinned) detach.push(child.id);
      else walk(child.id);
    }
  };
  if (cards.some((c) => c.id === id)) walk(id);
  return { close, detach };
}

/** Pinning detaches a card from its parent; past six pinned the oldest closes. */
export function planPin(cards, id, seq) {
  const target = cards.find((c) => c.id === id);
  if (!target || target.pinned) return { cards, close: [] };
  const next = cards.map((c) => (c.id === id ? { ...c, pinned: true, parent: null, at: seq } : c));
  const pinned = next.filter((c) => c.pinned).sort((a, b) => a.at - b.at);
  return { cards: next, close: pinned.slice(0, Math.max(0, pinned.length - TIP_MAX_PINNED)).map((c) => c.id) };
}

/**
 * The unpinned cards to close once the pointer has been away for a moment: every one outside the chains of the
 * `live` cards (under the pointer, or whose anchor is hovered or focused) and their ancestors.
 */
export function cardsToSweep(cards, live) {
  const keep = new Set();
  for (let id of live) {
    while (id && !keep.has(id)) {
      keep.add(id);
      id = cards.find((c) => c.id === id)?.parent ?? null;
    }
  }
  return cards.filter((c) => !c.pinned && !keep.has(c.id)).map((c) => c.id);
}
