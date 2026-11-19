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
  return { depth, replace: cards.filter((c) => !c.pinned && !c.companion && c.parent === (parentId ?? null)).map((c) => c.id) };
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

/**
 * Position a primary hover card and its side-by-side comparison companion without overlapping
 * each other or spilling outside the viewport.
 * @param {{left: number, right: number, top: number, bottom: number}} anchorRect
 * @param {{width: number, height: number}} primarySize
 * @param {{width: number, height: number}} compareSize
 * @param {{width: number, height: number}} viewport
 * @param {number} [gap=8]
 * @returns {{primary: {left: number, top: number}, compare: {left: number, top: number}}}
 */
export function placeCompareRects(anchorRect, primarySize, compareSize, viewport, gap = 8) {
  const { width: w1, height: h1 } = primarySize;
  const { width: w2, height: h2 } = compareSize;
  const { width: vw, height: vh } = viewport;
  const clampTop = (top, h) => Math.max(gap, Math.min(top, vh - h - gap));
  const clampLeft = (left, w) => Math.max(gap, Math.min(left, vw - w - gap));

  const rightPrimary = anchorRect.right + gap;
  const leftPrimary = anchorRect.left - gap - w1;
  const rightCompare = anchorRect.right + gap;
  const leftCompare = anchorRect.left - gap - w2;

  // 1. Both to the right of anchor
  if (rightPrimary + w1 + gap + w2 <= vw - gap) {
    return {
      primary: { left: rightPrimary, top: clampTop(anchorRect.top, h1) },
      compare: { left: rightPrimary + w1 + gap, top: clampTop(anchorRect.top, h2) }
    };
  }
  // 2. Both to the left of anchor
  if (leftPrimary - gap - w2 >= gap) {
    return {
      primary: { left: leftPrimary, top: clampTop(anchorRect.top, h1) },
      compare: { left: leftPrimary - gap - w2, top: clampTop(anchorRect.top, h2) }
    };
  }
  // 3. Straddle: primary right + compare left
  if (rightPrimary + w1 <= vw - gap && leftCompare >= gap) {
    return {
      primary: { left: rightPrimary, top: clampTop(anchorRect.top, h1) },
      compare: { left: leftCompare, top: clampTop(anchorRect.top, h2) }
    };
  }
  // 4. Straddle: primary left + compare right
  if (leftPrimary >= gap && rightCompare + w2 <= vw - gap) {
    return {
      primary: { left: leftPrimary, top: clampTop(anchorRect.top, h1) },
      compare: { left: rightCompare, top: clampTop(anchorRect.top, h2) }
    };
  }
  // 5. Tight viewport fallback: pick side with more room for primary, then place compare beside or below.
  const spaceRight = vw - anchorRect.right;
  const pLeft = clampLeft(spaceRight >= anchorRect.left ? rightPrimary : leftPrimary, w1);
  const pTop = clampTop(anchorRect.top, h1);
  if (vw >= w1 + w2 + gap * 3) {
    const cLeft = pLeft + w1 + gap + w2 <= vw - gap
      ? pLeft + w1 + gap
      : pLeft - gap - w2 >= gap
        ? pLeft - gap - w2
        : clampLeft(pLeft + w1 + gap, w2);
    return {
      primary: { left: pLeft, top: pTop },
      compare: { left: cLeft, top: clampTop(anchorRect.top, h2) }
    };
  }
  return {
    primary: { left: pLeft, top: pTop },
    compare: { left: clampLeft(pLeft, w2), top: clampTop(pTop + h1 + gap, h2) }
  };
}
