import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TIP_MAX_DEPTH, TIP_TIMING, cardsToSweep, openDelay, planClose, planOpen, planPin } from "../scripts/core/tooltips.js";

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
});
