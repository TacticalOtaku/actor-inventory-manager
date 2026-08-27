import test from "node:test";
import assert from "node:assert/strict";

import { isBodyArmor, isPhysicalItem, isShield } from "../scripts/core/item-classifier.js";

test("Inventory Filtering: Exclude non-physical actor items", () => {
  const feat = { id: "f1", name: "Divine Smite", type: "feat" };
  const breath = { id: "f2", name: "Breath Weapon", type: "feat" };
  const cls = { id: "c1", name: "Paladin", type: "class" };
  const spell = { id: "s1", name: "Bless", type: "spell" };
  const armor = { id: "a1", name: "Leather Armor", type: "equipment", system: { type: { value: "light" } } };
  const sword = { id: "w1", name: "Longsword", type: "weapon" };

  const allItems = [feat, breath, cls, spell, armor, sword];
  const physicalItems = allItems.filter(i => isPhysicalItem(i));

  assert.equal(physicalItems.length, 2);
  assert.equal(physicalItems.includes(armor), true);
  assert.equal(physicalItems.includes(sword), true);
  assert.equal(physicalItems.includes(feat), false);
  assert.equal(physicalItems.includes(breath), false);
  assert.equal(physicalItems.includes(cls), false);
  assert.equal(physicalItems.includes(spell), false);
});

test("Inventory Filtering: Tab categories filtering", () => {
  const sword = { id: "w1", name: "Longsword", type: "weapon" };
  const leather = { id: "a1", name: "Leather Armor", type: "equipment", system: { type: { value: "light" }, armor: { value: 11 } } };
  const shield = { id: "a2", name: "Shield", type: "equipment", system: { type: { value: "shield" }, armor: { value: 2 } } };
  const potion = { id: "c1", name: "Potion of Healing", type: "consumable" };
  const backpack = { id: "b1", name: "Backpack", type: "container" };
  const gem = { id: "l1", name: "Ruby", type: "loot" };

  const items = [sword, leather, shield, potion, backpack, gem];

  // Tab: weapons
  const weapons = items.filter(i => i.type === "weapon");
  assert.deepEqual(weapons, [sword]);

  // Tab: armor
  const armorTab = items.filter(i => (
    i.type === "equipment" &&
    (isBodyArmor(i) || isShield(i) || !["trinket", "vehicle"].includes(i.system?.type?.value))
  ));
  assert.deepEqual(armorTab, [leather, shield]);

  // Tab: consumables
  const consumables = items.filter(i => i.type === "consumable");
  assert.deepEqual(consumables, [potion]);

  // Tab: containers
  const containers = items.filter(i => i.type === "container" || i.type === "backpack");
  assert.deepEqual(containers, [backpack]);

  // Tab: loot
  const loot = items.filter(i => i.type === "loot" || i.type === "tool");
  assert.deepEqual(loot, [gem]);
});
