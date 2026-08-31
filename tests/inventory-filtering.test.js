import test from "node:test";
import assert from "node:assert/strict";

import { isBodyArmor, isPhysicalItem, isShield } from "../scripts/core/item-classifier.js";
import {
  buildAttunementSlots,
  buildInventoryCounts,
  buildSpellsCounts,
  filterAndSortInventoryItems,
  resolveThemeContext
} from "../scripts/ui/inventory-context.js";

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

test("Inventory Context: filters, searches and sorts without mutating input", () => {
  const items = [
    { name: "Dagger", type: "weapon", system: { weight: { value: 1 }, price: { value: 2 } } },
    { name: "Greatsword", type: "weapon", system: { weight: { value: 6 }, price: { value: 50 } } },
    { name: "Potion", type: "consumable", system: { weight: { value: 0.5 }, price: { value: 10 } } }
  ];

  const result = filterAndSortInventoryItems(items, { tab: "weapons", search: "g", sortBy: "weight" });
  assert.deepEqual(result.map(item => item.name), ["Greatsword", "Dagger"]);
  assert.deepEqual(items.map(item => item.name), ["Dagger", "Greatsword", "Potion"]);
});

test("Inventory Context: derives counts, attunement, spells and auto theme", () => {
  const items = [
    { name: "Sword", type: "weapon", system: {} },
    { name: "Charm", type: "equipment", system: { type: { value: "trinket" }, attunement: 2 } },
    { name: "Potion", type: "consumable", system: {} }
  ];

  assert.deepEqual(buildInventoryCounts(items, []), {
    all: 3, weapons: 1, armor: 0, consumables: 1, containers: 0, loot: 1
  });
  assert.equal(buildAttunementSlots(items, 2, item => ({ name: item.name }))[0].item.name, "Charm");
  assert.deepEqual(buildSpellsCounts(
    [{ count: 2 }, { count: 1 }],
    { actions: [{}], bonus: [{}], reactions: [], passives: [{}] }
  ), { all: 6, spells: 3, actions: 2, passives: 1 });
  assert.deepEqual(resolveThemeContext("auto", true, key => key), {
    theme: "light",
    isDark: false,
    isLight: true,
    themeIcon: "fa-solid fa-sun",
    themeTooltip: "AIM.theme.switchToDark"
  });
});
