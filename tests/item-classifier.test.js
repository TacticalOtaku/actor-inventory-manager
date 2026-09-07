import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyItem,
  findBestSlotForEquipping,
  getValidSlotsForItem,
  isBodyArmor,
  isItemCompatibleWithSlot,
  isShield,
  isTwoHandedWeapon
} from "../scripts/core/item-classifier.js";
import { DND_2024_TEMPLATE } from "../scripts/core/paperdoll-templates.js";

/**
 * An actor stub whose paperdoll template resolves to the 2024 preset.
 * getActorPaperdollTemplate falls back to that preset when no flags are set.
 */
const actor = { documentName: "Actor", flags: {}, system: {}, items: new Map() };

const greataxe = {
  id: "axe",
  name: "Greataxe",
  type: "weapon",
  system: { properties: new Set(["two"]), type: { value: "martialM" } }
};

const longsword = {
  id: "sword",
  name: "Longsword",
  type: "weapon",
  system: { properties: new Set(["ver"]), type: { value: "martialM" } }
};

const shield = {
  id: "shield",
  name: "Shield",
  type: "equipment",
  system: { type: { value: "shield" }, properties: new Set() }
};

const plate = {
  id: "plate",
  name: "Plate Armor",
  type: "equipment",
  system: { type: { value: "heavy" }, properties: new Set() }
};

describe("item classification", () => {
  it("recognises two-handed weapons", () => {
    assert.equal(isTwoHandedWeapon(greataxe), true);
    assert.equal(isTwoHandedWeapon(longsword), false);
    assert.equal(classifyItem(greataxe), "weapon_two_handed");
    assert.equal(classifyItem(longsword), "weapon");
  });

  it("recognises shields and body armor", () => {
    assert.equal(isShield(shield), true);
    assert.equal(isBodyArmor(plate), true);
    assert.equal(isBodyArmor(shield), false);
    assert.equal(classifyItem(shield), "shield");
    assert.equal(classifyItem(plate), "armor");
  });
});

describe("two-handed weapons never offer the off hand", () => {
  it("resolves to the main hand only", () => {
    const slots = getValidSlotsForItem(greataxe, actor);
    assert.deepEqual(slots, ["mainHand"]);
  });

  it("is not compatible with the off-hand slot", () => {
    assert.equal(isItemCompatibleWithSlot(greataxe, "offHand", actor), false);
    assert.equal(isItemCompatibleWithSlot(greataxe, "mainHand", actor), true);
  });

  it("does not auto-equip into the off hand when the main hand is taken", () => {
    // Auto-equip must not pick a slot the rule engine will then refuse.
    const occupied = new Map([["mainHand", longsword]]);
    assert.equal(findBestSlotForEquipping(actor, greataxe, occupied), "mainHand");
  });
});

describe("one-handed weapons and shields", () => {
  it("lets a versatile weapon use either hand", () => {
    const slots = getValidSlotsForItem(longsword, actor);
    assert.ok(slots.includes("mainHand"));
    assert.ok(slots.includes("offHand"));
  });

  it("prefers a free hand when auto-equipping", () => {
    const occupied = new Map([["mainHand", greataxe]]);
    assert.equal(findBestSlotForEquipping(actor, longsword, occupied), "offHand");
  });

  it("keeps shields out of armor and ring slots", () => {
    assert.equal(isItemCompatibleWithSlot(shield, "armor", actor), false);
    assert.equal(isItemCompatibleWithSlot(shield, "ring1", actor), false);
    assert.equal(isItemCompatibleWithSlot(shield, "offHand", actor), true);
  });

  it("keeps body armor out of every non-armor slot", () => {
    for (const slot of DND_2024_TEMPLATE.slots.filter(s => s.id !== "armor")) {
      assert.equal(
        isItemCompatibleWithSlot(plate, slot.id, actor),
        false,
        `plate armor should not fit ${slot.id}`
      );
    }
    assert.equal(isItemCompatibleWithSlot(plate, "armor", actor), true);
  });
});
