import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { equipmentRuleEngine, findEquipSlot, getActorEquippedMap, getTwoHandLayout, isOffHandLockedBy2H } from "../scripts/core/equipment-rules.js";
import { configurePaperdollRuntime, resetPaperdollRuntime } from "../scripts/core/paperdoll-runtime.js";
import { DND_2024_TEMPLATE } from "../scripts/core/paperdoll-templates.js";

afterEach(() => resetPaperdollRuntime());

function makeActor(items, flags = {}) {
  const actor = { documentName: "Actor", type: "character", hasPlayerOwner: true, flags: { "actor-inventory-manager": flags }, items: new Map() };
  for (const item of items) {
    item.parent = actor;
    item.flags ??= {};
    actor.items.set(item.id, item);
  }
  return actor;
}

const weapon = (id, props = [], equipped = false, slot = null) => ({
  id, name: id, type: "weapon",
  flags: slot ? { "actor-inventory-manager": { slot } } : {},
  system: { equipped, properties: new Set(props), type: { value: "martialM" } }
});
const shield = (id, equipped = false, slot = null) => ({
  id, name: id, type: "equipment",
  flags: slot ? { "actor-inventory-manager": { slot } } : {},
  system: { equipped, type: { value: "shield" } }
});

describe("two-handed weapons", () => {
  it("lock the off hand, not the main hand", () => {
    const actor = makeActor([weapon("greataxe", ["two"], true, "mainHand")]);
    const map = getActorEquippedMap(actor);
    assert.equal(isOffHandLockedBy2H(map, actor), true);
    assert.deepEqual(getTwoHandLayout(actor), { mainSlotIds: ["mainHand"], offSlotIds: ["offHand"] });
  });

  it("honour the slot flags of a custom template", () => {
    const slots = DND_2024_TEMPLATE.slots
      .filter(s => s.id !== "mainHand" && s.id !== "offHand")
      .concat([
        { id: "rightHand", label: "Right", category: "hand", itemTypes: ["weapon", "equipment"], accepts: ["weapon", "shield"], rules: { locksOffHandOn2H: true } },
        { id: "leftHand", label: "Left", category: "hand", itemTypes: ["weapon", "equipment"], accepts: ["weapon", "shield"], rules: { isShield: true } }
      ]);
    const actor = makeActor([weapon("greataxe", ["two"], true, "rightHand"), weapon("dagger")], { paperdollCustomTemplate: { slots } });
    assert.deepEqual(getTwoHandLayout(actor), { mainSlotIds: ["rightHand"], offSlotIds: ["leftHand"] });
    const result = equipmentRuleEngine.validateEquip(actor, actor.items.get("dagger"), "leftHand");
    assert.equal(result.valid, false);
    assert.equal(result.code, "OFFHAND_BLOCKED_BY_2H");
  });

  it("picks the main hand as a swap instead of the blocked off hand", () => {
    const actor = makeActor([weapon("greataxe", ["two"], true, "mainHand"), weapon("longsword")]);
    assert.equal(findEquipSlot(actor, actor.items.get("longsword")), "mainHand");
  });
});

describe("shields", () => {
  it("allow only one shield across all slots", () => {
    const actor = makeActor([shield("buckler", true, "offHand"), shield("tower")]);
    const result = equipmentRuleEngine.validateEquip(actor, actor.items.get("tower"), "mainHand");
    assert.equal(result.code, "SHIELD_ALREADY_EQUIPPED");
  });
});

describe("single per actor", () => {
  it("rejects a second item of the same kind", () => {
    const amulet = (id, equipped, slot) => ({ id, name: id, type: "equipment", flags: slot ? { "actor-inventory-manager": { slot } } : {}, system: { equipped, type: { value: "trinket" } } });
    const slots = [
      { id: "neck", label: "Neck", itemTypes: ["equipment"], accepts: ["neck"], rules: { singlePerActor: true } },
      { id: "charm", label: "Charm", itemTypes: ["equipment"], accepts: ["neck"], rules: { singlePerActor: true } }
    ];
    const actor = makeActor([amulet("Amulet of Health", true, "neck"), amulet("Periapt of Wound Closure", false)], { paperdollCustomTemplate: { slots } });
    const result = equipmentRuleEngine.validateEquip(actor, actor.items.get("Periapt of Wound Closure"), "charm");
    assert.equal(result.code, "SINGLE_PER_ACTOR");
  });
});

describe("rule messages", () => {
  it("are localized through the runtime port", () => {
    configurePaperdollRuntime({ format: (key, data) => `${key}|${data.item}` });
    const actor = makeActor([shield("buckler", true, "offHand"), shield("tower")]);
    const result = equipmentRuleEngine.validateEquip(actor, actor.items.get("tower"), "mainHand");
    assert.equal(result.error, "AIM.rules.shieldAlreadyEquipped|tower");
  });
});

describe("auto-reconcile setting", () => {
  it("leaves equipped items without a slot flag unplaced when disabled", () => {
    const actor = makeActor([weapon("longsword", [], true)]);
    assert.equal(getActorEquippedMap(actor).get("mainHand")?.id, "longsword");
    configurePaperdollRuntime({ autoReconcileSlots: () => false });
    assert.equal(getActorEquippedMap(actor).size, 0);
  });
});
