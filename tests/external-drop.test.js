import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dropBehavior, received, refusedType, spellBecomes } from "../scripts/core/external-drop.js";

const base = { fromActor: false, sameActor: false, isPile: false, ownsSource: false, isGM: false, shift: false };

describe("drops from outside (ADR 0004)", () => {
  it("copy from the sidebar, a compendium, chat, a journal or a bastion card", () => {
    assert.deepEqual(dropBehavior(base), { behavior: "copy", refusal: null });
  });

  it("move from another actor the user owns, refuse one they do not, and an Item Piles pile", () => {
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, ownsSource: true }), { behavior: "move", refusal: null });
    assert.deepEqual(dropBehavior({ ...base, fromActor: true }), { behavior: null, refusal: "notOwner" });
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, ownsSource: true, isPile: true }), { behavior: null, refusal: "pile" });
  });

  it("let the GM copy, and move with Shift", () => {
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, isGM: true }), { behavior: "copy", refusal: null });
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, isGM: true, shift: true }), { behavior: "move", refusal: null });
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, isGM: true, isPile: true }), { behavior: "copy", refusal: null });
  });

  it("leave a drop from the window's own actor to the window's own drag", () => {
    assert.deepEqual(dropBehavior({ ...base, fromActor: true, sameActor: true, ownsSource: true }), { behavior: null, refusal: null });
  });

  it("refuse the types the actor's sheet does not take", () => {
    const vehicle = new Set(["background", "class", "race", "spell", "subclass"]);
    assert.equal(refusedType(["weapon", "spell"], vehicle), "spell");
    assert.equal(refusedType(["weapon", "loot"], vehicle), null);
    assert.equal(refusedType(["class"], undefined), null);
  });

  it("turn a spell into a scroll only on the equipment tab", () => {
    assert.deepEqual(["equipment", "spells", "overview"].map(spellBecomes), ["scroll", "spell", "spell"]);
  });

  it("see a new item or a grown stack as received", () => {
    const before = new Map([["a", 1], ["b", 3]]);
    assert.equal(received(before, new Map([["a", 1], ["b", 3], ["c", 1]])), true);
    assert.equal(received(before, new Map([["a", 1], ["b", 4]])), true);
    assert.equal(received(before, new Map([["a", 1], ["b", 3]])), false);
  });
});
