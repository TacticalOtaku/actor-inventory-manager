import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FLAGS, MODULE_ID } from "../scripts/constants.js";
import { annotateCompareStats, averageDiceFormula, findCompareTargets, parseSignedNumber } from "../scripts/core/item-compare.js";

function makeActor(items) {
  const actor = {
    documentName: "Actor",
    type: "character",
    hasPlayerOwner: true,
    flags: {},
    items: new Map()
  };
  for (const item of items) {
    item.parent = actor;
    item.flags ??= {};
    actor.items.set(item.id, item);
  }
  return actor;
}

const weapon = (id, props = [], { equipped = false, slot = null } = {}) => ({
  id,
  name: id,
  type: "weapon",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, properties: new Set(props), type: { value: "martialM" } }
});

const shield = (id, { equipped = false, slot = null } = {}) => ({
  id,
  name: id,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value: "shield" } }
});

const armor = (id, { equipped = false, slot = null } = {}) => ({
  id,
  name: id,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value: "heavy" } }
});

const ring = (id, name, { equipped = false, slot = null } = {}) => ({
  id,
  name,
  type: "equipment",
  flags: slot ? { [MODULE_ID]: { [FLAGS.SLOT]: slot } } : {},
  system: { equipped, type: { value: "trinket" } }
});

describe("findCompareTargets", () => {
  it("finds the equipped armor or weapon matching the hovered item's target slot", () => {
    const wornPlate = armor("plate", { equipped: true, slot: "armor" });
    const bagSplint = armor("splint", { equipped: false });
    const actor = makeActor([wornPlate, bagSplint]);

    const targets = findCompareTargets(actor, bagSplint);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].slotId, "armor");
    assert.equal(targets[0].item.id, "plate");
  });

  it("ignores already-equipped items and non-equippable loot", () => {
    const wornPlate = armor("plate", { equipped: true, slot: "armor" });
    const gem = { id: "gem", name: "Ruby", type: "loot", flags: {}, system: {} };
    const actor = makeActor([wornPlate, gem]);

    assert.deepEqual(findCompareTargets(actor, wornPlate), []);
    assert.deepEqual(findCompareTargets(actor, gem), []);
  });

  it("prefers the main-hand weapon over an off-hand shield when hovering a 1H weapon", () => {
    const sword = weapon("sword", [], { equipped: true, slot: "mainHand" });
    const buckler = shield("buckler", { equipped: true, slot: "offHand" });
    const axe = weapon("axe", [], { equipped: false });
    const actor = makeActor([sword, buckler, axe]);

    const targets = findCompareTargets(actor, axe);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].item.id, "sword");
  });

  it("surfaces a 2H weapon locking the off hand when hovering a shield", () => {
    const greatsword = weapon("greatsword", ["two"], { equipped: true, slot: "mainHand" });
    const bagShield = shield("shield", { equipped: false });
    const actor = makeActor([greatsword, bagShield]);

    const targets = findCompareTargets(actor, bagShield);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].slotId, "mainHand");
    assert.equal(targets[0].item.id, "greatsword");
  });

  it("respects ring1/ring2 preference when one ring slot is free vs both full", () => {
    const ring1 = ring("r1", "Ring of Protection", { equipped: true, slot: "ring1" });
    const ring2 = ring("r2", "Ring of Warmth", { equipped: true, slot: "ring2" });
    const bagRing = ring("r3", "Ring of Evasion", { equipped: false });

    // Even with ring2 free, comparing against ring1 gives useful context when ring1 is occupied.
    const oneOccupied = makeActor([ring1, bagRing]);
    assert.equal(findCompareTargets(oneOccupied, bagRing)[0].item.id, "r1");

    const bothOccupied = makeActor([ring1, ring2, bagRing]);
    assert.equal(findCompareTargets(bothOccupied, bagRing)[0].slotId, "ring1");
  });
});

describe("dice and stat comparison helpers", () => {
  it("parses signed numbers and evaluates dice formulas", () => {
    assert.equal(parseSignedNumber("+5"), 5);
    assert.equal(parseSignedNumber("−2"), -2);
    assert.equal(parseSignedNumber("18"), 18);
    assert.equal(parseSignedNumber("bad"), null);

    assert.equal(averageDiceFormula("1d8 + 3 Рубящий"), 7.5);
    assert.equal(averageDiceFormula("2d6 + 1d4 + 2 Огонь, 1d6 Холод"), 15);
    assert.equal(averageDiceFormula("1d10 - 1"), 4.5);
    assert.equal(averageDiceFormula("1d8 + @mod"), null);
    assert.equal(averageDiceFormula("Special"), null);
  });

  it("annotates armor, toHit, and damage deltas without mutating non-comparable stats", () => {
    const hovered = [
      { key: "toHit", value: "+7" },
      { key: "damage", value: "2d6 + 4 Рубящий" },
      { key: "armor", value: "18" },
      { key: "weight", value: "3 lb" }
    ];
    const equipped = [
      { key: "toHit", value: "+5" },
      { key: "damage", value: "1d8 + 4 Рубящий" },
      { key: "armor", value: "19" },
      { key: "weight", value: "6 lb" }
    ];

    const annotated = annotateCompareStats(hovered, equipped);
    assert.deepEqual(annotated, [
      { key: "toHit", value: "+7", delta: "+2", diff: "better" },
      { key: "damage", value: "2d6 + 4 Рубящий", delta: "+2.5", diff: "better" },
      { key: "armor", value: "18", delta: "−1", diff: "worse" },
      { key: "weight", value: "3 lb" }
    ]);
  });
});
