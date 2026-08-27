import test from "node:test";
import assert from "node:assert/strict";

import { SLOTS } from "../scripts/constants.js";
import {
  classifyItem,
  getValidSlotsForItem,
  isBodyArmor,
  isItemCompatibleWithSlot,
  isShield,
  isTwoHandedWeapon
} from "../scripts/core/item-classifier.js";

test("Item Classifier: Two-Handed Weapons", () => {
  const greatsword = {
    id: "item1",
    name: "Greatsword",
    type: "weapon",
    system: {
      properties: new Set(["two", "hvy"])
    }
  };
  assert.equal(isTwoHandedWeapon(greatsword), true);
  assert.equal(classifyItem(greatsword), "weapon_two_handed");
  assert.deepEqual(getValidSlotsForItem(greatsword), [SLOTS.MAIN_HAND]);
  assert.equal(isItemCompatibleWithSlot(greatsword, SLOTS.MAIN_HAND), true);
  assert.equal(isItemCompatibleWithSlot(greatsword, SLOTS.OFF_HAND), false);

  const longsword = {
    id: "item2",
    name: "Longsword",
    type: "weapon",
    system: {
      properties: ["ver"]
    }
  };
  assert.equal(isTwoHandedWeapon(longsword), false);
  assert.equal(classifyItem(longsword), "weapon");
  assert.deepEqual(getValidSlotsForItem(longsword), [SLOTS.MAIN_HAND, SLOTS.OFF_HAND]);
});

test("Item Classifier: Body Armor and Shields", () => {
  const plate = {
    id: "item3",
    name: "Plate Armor",
    type: "equipment",
    system: {
      armor: { type: "heavy" },
      type: { value: "heavy" }
    }
  };
  assert.equal(isBodyArmor(plate), true);
  assert.equal(isShield(plate), false);
  assert.equal(classifyItem(plate), "armor");
  assert.deepEqual(getValidSlotsForItem(plate), [SLOTS.ARMOR]);

  const shield = {
    id: "item4",
    name: "Shield",
    type: "equipment",
    system: {
      armor: { type: "shield" },
      type: { value: "shield" }
    }
  };
  assert.equal(isShield(shield), true);
  assert.equal(isBodyArmor(shield), false);
  assert.equal(classifyItem(shield), "shield");
  assert.deepEqual(getValidSlotsForItem(shield), [SLOTS.OFF_HAND, SLOTS.MAIN_HAND]);
});

test("Item Classifier: Headgear, Rings, Cloaks, Boots, Amulets", () => {
  const helm = { id: "i5", name: "Helm of Telepathy", type: "equipment", system: { type: { value: "helmet" } } };
  assert.equal(classifyItem(helm), "head");
  assert.deepEqual(getValidSlotsForItem(helm), [SLOTS.HEAD]);

  const ring = { id: "i6", name: "Ring of Protection", type: "equipment", system: { type: { value: "ring" } } };
  assert.equal(classifyItem(ring), "ring");
  assert.deepEqual(getValidSlotsForItem(ring), [SLOTS.RING_1, SLOTS.RING_2]);

  const boots = { id: "i7", name: "Boots of Speed", type: "equipment", system: { type: { value: "boots" } } };
  assert.equal(classifyItem(boots), "feet");
  assert.deepEqual(getValidSlotsForItem(boots), [SLOTS.FEET]);

  const cloak = { id: "i8", name: "Cloak of Elvenkind", type: "equipment", system: { type: { value: "cloak" } } };
  assert.equal(classifyItem(cloak), "cloak");
  assert.deepEqual(getValidSlotsForItem(cloak), [SLOTS.CLOAK]);

  const amulet = { id: "i9", name: "Amulet of Health", type: "equipment", system: { type: { value: "amulet" } } };
  assert.equal(classifyItem(amulet), "neck");
  assert.deepEqual(getValidSlotsForItem(amulet), [SLOTS.NECK]);
});
