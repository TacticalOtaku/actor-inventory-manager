import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TIP_MAX_DEPTH, TIP_TIMING, cardsToSweep, openDelay, placeCompareRects, planClose, planOpen, planPin } from "../scripts/core/tooltips.js";

const card = (id, parent = null, extra = {}) => ({ id, parent, depth: 1, pinned: false, at: 0, ...extra });

describe("tooltip timing", () => {
  it("opens after 400 ms, at once while a top card is open, 300 ms for a link inside a card", () => {
    assert.equal(openDelay({ inCard: false, liveTop: false }), TIP_TIMING.open);
    assert.equal(openDelay({ inCard: false, liveTop: true }), 0);
    assert.equal(openDelay({ inCard: true, liveTop: true }), TIP_TIMING.nested);
    assert.deepEqual([TIP_TIMING.open, TIP_TIMING.nested, TIP_TIMING.close, TIP_TIMING.pinHold], [400, 300, 200, 1200]);
  });
});

describe("opening a card", () => {
  it("replaces the unpinned card hanging from the same parent and keeps pinned ones", () => {
    const cards = [card("a"), card("b", null, { pinned: true }), card("c", "a", { depth: 2 })];
    assert.deepEqual(planOpen(cards, null), { depth: 1, replace: ["a"] });
    assert.deepEqual(planOpen(cards, "a"), { depth: 2, replace: ["c"] });
  });

  it("stops at four levels", () => {
    const cards = [card("a"), card("b", "a", { depth: 2 }), card("c", "b", { depth: 3 }), card("d", "c", { depth: TIP_MAX_DEPTH })];
    assert.equal(planOpen(cards, "c").depth, 4);
    assert.equal(planOpen(cards, "d"), null);
  });
});

describe("closing a card", () => {
  it("takes its unpinned descendants along and lets pinned ones stand alone", () => {
    const cards = [card("a"), card("b", "a", { depth: 2 }), card("c", "b", { depth: 3 }), card("p", "a", { depth: 2, pinned: true })];
    assert.deepEqual(planClose(cards, "a"), { close: ["a", "b", "c"], detach: ["p"] });
  });
});

describe("pinning", () => {
  it("detaches the card, stamps its order and closes the oldest beyond six", () => {
    const cards = Array.from({ length: 6 }, (_, i) => card(`p${i}`, null, { pinned: true, at: i + 1 })).concat(card("n", "p5", { depth: 2 }));
    const { cards: next, close } = planPin(cards, "n", 7);
    const pinned = next.find((c) => c.id === "n");
    assert.deepEqual([pinned.pinned, pinned.parent, pinned.at], [true, null, 7]);
    assert.deepEqual(close, ["p0"]);
    assert.deepEqual(planPin(next, "n", 8).close, [], "pinning again changes nothing");
  });
});

describe("sweeping", () => {
  it("closes unpinned cards outside the chain under the pointer or the focused anchor", () => {
    const cards = [card("a"), card("b", "a", { depth: 2 }), card("x"), card("p", null, { pinned: true })];
    assert.deepEqual(cardsToSweep(cards, ["b"]), ["x"]);
    assert.deepEqual(cardsToSweep(cards, []), ["a", "b", "x"]);
  });

  it("keeps primary alive while companion compare card is hovered and closes both on primary close", () => {
    const cards = [card("a"), card("cmp", "a", { depth: 1, companion: true })];
    assert.deepEqual(cardsToSweep(cards, ["cmp"]), []);
    assert.deepEqual(planClose(cards, "a"), { close: ["a", "cmp"], detach: [] });
    assert.deepEqual(planOpen(cards, "a").replace, []);
  });
});

describe("compare placement", () => {
  const size = { width: 340, height: 220 };
  const gap = 8;

  it("places both cards to the right of the anchor when room allows", () => {
    const layout = placeCompareRects(
      { left: 100, right: 300, top: 120, bottom: 160 },
      size,
      size,
      { width: 1280, height: 800 },
      gap
    );
    assert.equal(layout.primary.left, 308);
    assert.equal(layout.compare.left, 308 + 340 + 8);
    assert.ok(layout.compare.left + 340 <= 1280 - gap);
  });

  it("places both cards to the left when the anchor sits near the right edge", () => {
    const layout = placeCompareRects(
      { left: 900, right: 1100, top: 120, bottom: 160 },
      size,
      size,
      { width: 1280, height: 800 },
      gap
    );
    assert.equal(layout.primary.left, 900 - 8 - 340);
    assert.equal(layout.compare.left, 900 - 8 - 340 - 8 - 340);
  });

  it("straddles around the anchor on medium viewports and stays inside narrow viewports", () => {
    const straddle = placeCompareRects(
      { left: 420, right: 620, top: 120, bottom: 160 },
      size,
      size,
      { width: 1000, height: 800 },
      gap
    );
    assert.equal(straddle.primary.left, 628);
    assert.equal(straddle.compare.left, 420 - 8 - 340);

    const narrow = placeCompareRects(
      { left: 100, right: 350, top: 100, bottom: 140 },
      size,
      size,
      { width: 520, height: 700 },
      gap
    );
    assert.ok(narrow.primary.left >= gap && narrow.primary.left + 340 <= 520 - gap);
    assert.ok(narrow.compare.top >= narrow.primary.top + 220);
  });
});
