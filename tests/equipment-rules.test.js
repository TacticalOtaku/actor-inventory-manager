import test from "node:test";
import assert from "node:assert/strict";

import { SLOTS } from "../scripts/constants.js";
import { equipmentRuleEngine, getActorEquippedMap, isOffHandLockedBy2H } from "../scripts/core/equipment-rules.js";

test("Equipment Rules: Two-Handed Weapon blocks Off-Hand", () => {
  const greatsword = {
    id: "gs1",
    name: "Greatsword",
    type: "weapon",
    system: { equipped: true, properties: new Set(["two"]) },
    flags: { "actor-inventory-manager": { slot: SLOTS.MAIN_HAND } }
  };

  const actor = {
    id: "actor1",
    name: "Conan",
    items: new Map([["gs1", greatsword]])
  };

  const slotMap = getActorEquippedMap(actor);
  assert.equal(slotMap.get(SLOTS.MAIN_HAND), greatsword);
  assert.equal(isOffHandLockedBy2H(slotMap), true);

  // Try to equip a dagger in offHand
  const dagger = {
    id: "dag1",
    name: "Dagger",
    type: "weapon",
    system: { equipped: false, properties: [] }
  };

  const result = equipmentRuleEngine.validateEquip(actor, dagger, SLOTS.OFF_HAND, { slotMap });
  assert.equal(result.valid, false);
  assert.equal(result.code, "OFFHAND_BLOCKED_BY_2H");
  assert.equal(result.conflictItem, greatsword);
});

test("Equipment Rules: Equipping 2H weapon with occupied Off-Hand flags auto-swap", () => {
  const shield = {
    id: "sh1",
    name: "Shield",
    type: "equipment",
    system: { equipped: true, armor: { type: "shield" }, type: { value: "shield" } },
    flags: { "actor-inventory-manager": { slot: SLOTS.OFF_HAND } }
  };

  const actor = {
    id: "actor1",
    name: "Paladin",
    items: new Map([["sh1", shield]])
  };

  const slotMap = getActorEquippedMap(actor);
  const halberd = {
    id: "halb1",
    name: "Halberd",
    type: "weapon",
    system: { equipped: false, properties: ["two", "rch"] }
  };

  const result = equipmentRuleEngine.validateEquip(actor, halberd, SLOTS.MAIN_HAND, { slotMap });
  assert.equal(result.valid, true);
  assert.equal(result.autoSwapItems.length, 1);
  assert.equal(result.autoSwapItems[0].id, "sh1");
});

test("Equipment Rules: Single Body Armor restriction", () => {
  const leather = {
    id: "arm1",
    name: "Leather Armor",
    type: "equipment",
    system: { equipped: true, armor: { type: "light" }, type: { value: "light" } },
    flags: { "actor-inventory-manager": { slot: SLOTS.ARMOR } }
  };

  const plate = {
    id: "arm2",
    name: "Plate Armor",
    type: "equipment",
    system: { equipped: false, armor: { type: "heavy" }, type: { value: "heavy" } }
  };

  const actor = {
    id: "actor1",
    name: "Fighter",
    items: new Map([["arm1", leather], ["arm2", plate]])
  };

  const slotMap = getActorEquippedMap(actor);

  // Trying to put plate into armor slot allows autoSwap
  const resultSwap = equipmentRuleEngine.validateEquip(actor, plate, SLOTS.ARMOR, { slotMap });
  assert.equal(resultSwap.valid, true);
  assert.equal(resultSwap.autoSwapItems.length, 1);
  assert.equal(resultSwap.autoSwapItems[0].id, "arm1");

  // Trying to put plate into head slot is rejected
  const resultIncompatible = equipmentRuleEngine.validateEquip(actor, plate, SLOTS.HEAD, { slotMap });
  assert.equal(resultIncompatible.valid, false);
  assert.equal(resultIncompatible.code, "SLOT_INCOMPATIBLE");
});

test("Equipment Rules: Dual Shields restriction", () => {
  const shield1 = {
    id: "sh1",
    name: "Shield 1",
    type: "equipment",
    system: { equipped: true, armor: { type: "shield" }, type: { value: "shield" } },
    flags: { "actor-inventory-manager": { slot: SLOTS.OFF_HAND } }
  };

  const shield2 = {
    id: "sh2",
    name: "Shield 2",
    type: "equipment",
    system: { equipped: false, armor: { type: "shield" }, type: { value: "shield" } }
  };

  const actor = {
    id: "actor1",
    name: "Tank",
    items: new Map([["sh1", shield1], ["sh2", shield2]])
  };

  const slotMap = getActorEquippedMap(actor);

  // Trying to equip a second shield into mainHand is rejected
  const result = equipmentRuleEngine.validateEquip(actor, shield2, SLOTS.MAIN_HAND, { slotMap });
  assert.equal(result.valid, false);
  assert.equal(result.code, "SHIELD_ALREADY_EQUIPPED");
  assert.equal(result.conflictItem, shield1);
});
