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

describe("whole-word name matching", () => {
  const mk = (name, type, value, extra = {}) => ({ id: name, name, type, flags: {}, system: { type: { value }, ...extra } });

  it("never offers weapon hands to gloves", () => {
    const gauntlets = mk("Gauntlets of Ogre Power", "equipment", "trinket");
    assert.deepEqual(getValidSlotsForItem(gauntlets, actor), ["hands"]);
    assert.equal(isItemCompatibleWithSlot(gauntlets, "mainHand", actor), false);
    assert.equal(isItemCompatibleWithSlot(gauntlets, "offHand", actor), false);
  });

  it("keeps clothing-typed wearables out of the armor slot", () => {
    const gloves = mk("Gloves of Thievery", "equipment", "clothing");
    assert.deepEqual(getValidSlotsForItem(gloves, actor), ["hands"]);
  });

  it("treats real armor as armor whatever its name", () => {
    for (const name of ["Chain Shirt", "Кольчужная рубаха"]) {
      const shirt = mk(name, "equipment", "medium");
      assert.equal(isBodyArmor(shirt), true, name);
      assert.equal(classifyItem(shirt), "armor", name);
      assert.deepEqual(getValidSlotsForItem(shirt, actor), ["armor"], name);
    }
  });

  it("does not read tokens inside longer words", () => {
    assert.equal(classifyItem(mk("Bandage", "loot", "")), "loot");
    assert.equal(classifyItem(mk("Headband of Intellect", "equipment", "trinket")), "head");
    assert.deepEqual(getValidSlotsForItem(mk("Cloak of Light", "equipment", "clothing"), actor), ["cloak"]);
  });

  it("understands Russian inflections", () => {
    assert.equal(classifyItem(mk("Сапоги скорости", "equipment", "trinket")), "feet");
    assert.equal(classifyItem(mk("Кольцо невидимости", "equipment", "trinket")), "ring");
    assert.equal(classifyItem(mk("Перчатки ловкости", "equipment", "trinket")), "hands");
  });
});

describe("slot compatibility", () => {
  const helm = { id: "helm", name: "Helm of Brilliance", type: "equipment", flags: {}, system: { type: { value: "trinket" } } };
  const ioun = { id: "ioun", name: "Ioun Stone", type: "equipment", flags: {}, system: { type: { value: "trinket" } } };
  const potion = { id: "potion", name: "Potion of Healing", type: "consumable", flags: {}, system: { type: { value: "potion" } } };

  it("rejects wearables dropped on the wrong body part", () => {
    assert.equal(isItemCompatibleWithSlot(helm, "head", actor), true);
    assert.equal(isItemCompatibleWithSlot(helm, "feet", actor), false);
    assert.equal(isItemCompatibleWithSlot(helm, "ring1", actor), false);
  });

  it("never returns slots the template does not have", () => {
    assert.deepEqual(getValidSlotsForItem(potion, actor), ["mainHand", "offHand"]);
    assert.equal(isItemCompatibleWithSlot(potion, "quick1", actor), false);
  });

  it("gives unclassified items no automatic slot but allows placing them by hand", () => {
    assert.deepEqual(getValidSlotsForItem(ioun, actor), []);
    assert.equal(isItemCompatibleWithSlot(ioun, "neck", actor), true);
    assert.equal(isItemCompatibleWithSlot(ioun, "armor", actor), false);
  });
});
