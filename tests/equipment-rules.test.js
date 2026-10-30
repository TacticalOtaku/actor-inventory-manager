import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { equipmentRuleEngine, findEquipSlot, getActorEquippedMap, getTwoHandLayout, isOffHandLockedBy2H, planEquip } from "../scripts/core/equipment-rules.js";
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

  it("prefer a free hand over swapping a one-handed weapon", () => {
    const actor = makeActor([weapon("dagger", [], true, "mainHand"), weapon("longsword")]);
    assert.equal(findEquipSlot(actor, actor.items.get("longsword")), "offHand");
  });

  it("picks the main hand as a swap instead of the blocked off hand", () => {
    const actor = makeActor([weapon("greataxe", ["two"], true, "mainHand"), weapon("longsword")]);
    assert.equal(findEquipSlot(actor, actor.items.get("longsword")), "mainHand");
  });

  it("put a shield in the off hand when both hands are free", () => {
    const actor = makeActor([shield("shield")]);
    assert.equal(findEquipSlot(actor, actor.items.get("shield")), "offHand");
  });

  it("let armor go on over clothes, even clothes an older doll left in the armor slot", () => {
    const clothes = { id: "clothes", name: "Traveler's Clothes", type: "equipment", flags: { "actor-inventory-manager": { slot: "armor" } }, system: { equipped: true, type: { value: "clothing" } } };
    const mail = { id: "mail", name: "Chain Mail", type: "equipment", flags: {}, system: { equipped: false, type: { value: "heavy" } } };
    const actor = makeActor([clothes, mail]);
    assert.equal(getActorEquippedMap(actor).has("armor"), false);
    assert.equal(findEquipSlot(actor, mail), "armor");
    assert.equal(equipmentRuleEngine.validateEquip(actor, mail, "armor").valid, true);
  });

  it("never push a held weapon out for a potion, and leave hands free of claws", () => {
    const potion = { id: "potion", name: "Potion of Healing", type: "consumable", flags: {}, system: { equipped: false, type: { value: "potion" } } };
    const claws = { ...weapon("claws"), system: { equipped: false, properties: new Set(), type: { value: "natural" } } };
    const full = makeActor([weapon("longsword", [], true, "mainHand"), shield("shield", true, "offHand"), potion, claws]);
    assert.equal(findEquipSlot(full, potion), null);
    assert.equal(findEquipSlot(full, claws), null);
    const oneFree = makeActor([weapon("longsword", [], true, "mainHand"), potion]);
    assert.equal(findEquipSlot(oneFree, potion), "offHand");
  });

  it("leave the hands free of equipped arrows, so a shield still goes on", () => {
    const arrows = { id: "arrows", name: "Arrows", type: "consumable", flags: {}, system: { equipped: true, type: { value: "ammo" } } };
    const actor = makeActor([weapon("longsword", [], true, "mainHand"), arrows, shield("shield")]);
    assert.equal(findEquipSlot(actor, arrows), null);
    assert.deepEqual([...getActorEquippedMap(actor).keys()], ["mainHand"]);
    assert.equal(findEquipSlot(actor, actor.items.get("shield")), "offHand");
  });

  it("never take off worn armor for generic gear", () => {
    const plate = { id: "plate", name: "Plate Armor", type: "equipment", flags: { "actor-inventory-manager": { slot: "armor" } }, system: { equipped: true, type: { value: "heavy" } } };
    const gear = [["Goggles of Night", "clothing"], ["Heavy Coat", "clothing"], ["Stone of Light", "trinket"], ["Robe of Stars", "wondrous"]]
      .map(([name, value]) => ({ id: name, name, type: "equipment", flags: {}, system: { equipped: false, type: { value } } }));
    const actor = makeActor([plate, ...gear]);
    for (const item of gear) assert.notEqual(findEquipSlot(actor, item), "armor", item.name);
    assert.equal(findEquipSlot(makeActor([{ ...plate, flags: {}, system: { equipped: false, type: { value: "heavy" } } }]), plate), "armor");
  });
});

describe("shields", () => {
  it("allow only one shield across all slots", () => {
    const actor = makeActor([shield("buckler", true, "offHand"), shield("tower")]);
    const result = equipmentRuleEngine.validateEquip(actor, actor.items.get("tower"), "mainHand");
    assert.equal(result.code, "SHIELD_ALREADY_EQUIPPED");
  });

  it("do not push a held two-handed weapon out of the main hand", () => {
    const actor = makeActor([weapon("greataxe", ["two"], true, "mainHand"), shield("buckler")]);
    const buckler = actor.items.get("buckler");
    const slotId = findEquipSlot(actor, buckler);
    assert.equal(slotId, "offHand");
    assert.equal(equipmentRuleEngine.validateEquip(actor, buckler, slotId).code, "OFFHAND_BLOCKED_BY_2H");
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

  it("leaves an item in a 1.9 attunement or quick slot unplaced (ADR 0005)", () => {
    const actor = makeActor([weapon("dagger", [], true, "quick1"), weapon("wand", [], true, "attunement2"), weapon("longsword", [], true)]);
    const map = getActorEquippedMap(actor);
    assert.equal(map.get("mainHand")?.id, "longsword");
    assert.deepEqual([...map.values()].map((item) => item.id), ["longsword"]);
  });
});

describe("equip plan", () => {
  const ring = (id, slot = null) => ({
    id, name: id, type: "equipment",
    flags: slot ? { "actor-inventory-manager": { slot } } : {},
    system: { equipped: Boolean(slot), type: { value: "ring" } }
  });
  const trinket = { id: "stone", name: "stone", type: "equipment", system: { equipped: false, type: { value: "trinket" } } };
  /** Each case builds [actor, item, chosen slot] and names the outcome per mode: a refusal code, or the writes in order. */
  const cases = [
    ["a free slot", () => makeActor([weapon("sword")]), "sword", "mainHand",
      { block: "sword+", auto_swap: "sword+", warn: "sword+" }],
    ["a chosen slot that is taken", () => makeActor([ring("old", "ring1"), ring("new")]), "new", "ring1",
      { block: "old- new+", auto_swap: "old- new+", warn: "old- new+" }],
    ["a picked slot with every place taken", () => makeActor([ring("a", "ring1"), ring("b", "ring2"), ring("new")]), "new", null,
      { block: "SLOT_OCCUPIED", auto_swap: "a- new+", warn: "a- new+" }],
    ["a rule broken by another item", () => makeActor([weapon("greataxe", ["two"], true, "mainHand"), shield("shield")]), "shield", "offHand",
      { block: "OFFHAND_BLOCKED_BY_2H", auto_swap: "greataxe- shield+", warn: "shield+" }],
    ["a rule broken with the slot taken", () => makeActor([weapon("greataxe", ["two"], true, "mainHand"), weapon("dagger", [], true, "offHand"), shield("shield")]), "shield", "offHand",
      { block: "OFFHAND_BLOCKED_BY_2H", auto_swap: "greataxe- dagger- shield+", warn: "dagger- shield+" }],
    ["a slot the item does not fit", () => makeActor([weapon("sword")]), "sword", "ring1",
      { block: "SLOT_INCOMPATIBLE", auto_swap: "SLOT_INCOMPATIBLE", warn: "SLOT_INCOMPATIBLE" }],
    ["an item with no place on the doll", () => makeActor([{ ...trinket }]), "stone", null,
      { block: "stone+", auto_swap: "stone+", warn: "stone+" }]
  ];
  const outcome = plan => plan.refusal?.code ?? plan.updates.map(u => `${u._id}${u["system.equipped"] ? "+" : "-"}`).join(" ");

  for (const [name, build, itemId, slotId, expected] of cases) {
    for (const [mode, result] of Object.entries(expected)) {
      it(`${name} in ${mode} mode: ${result}`, () => {
        const actor = build();
        assert.equal(outcome(planEquip(actor, actor.items.get(itemId), slotId, mode)), result);
      });
    }
  }

  it("warns only in warn mode, about the broken rule or the replaced item", () => {
    const taken = () => makeActor([ring("old", "ring1"), ring("new")]);
    for (const mode of ["block", "auto_swap"]) assert.equal(planEquip(taken(), taken().items.get("new"), "ring1", mode).warning, null);
    const actor = taken();
    assert.match(planEquip(actor, actor.items.get("new"), "ring1", "warn").warning, /'new' replaced 'old'/);
    const held = makeActor([weapon("greataxe", ["two"], true, "mainHand"), shield("shield")]);
    assert.match(planEquip(held, held.items.get("shield"), "offHand", "warn").warning, /requires both hands/);
  });

  it("writes the slot, the time and the way out of a bag on the equipped item, and no slot for a slotless one", () => {
    const actor = makeActor([{ ...weapon("sword"), system: { equipped: false, container: "bag", properties: new Set(), type: { value: "martialM" } } }, { ...trinket }]);
    const [sword] = planEquip(actor, actor.items.get("sword"), null, "block").updates;
    assert.equal(sword["flags.actor-inventory-manager.slot"], "mainHand");
    assert.equal(sword["system.container"], null);
    assert.equal(typeof sword["flags.actor-inventory-manager.equippedAt"], "number");
    const [stone] = planEquip(actor, actor.items.get("stone"), null, "block").updates;
    assert.equal(stone["flags.actor-inventory-manager.slot"], null);
    assert.equal("flags.actor-inventory-manager.equippedAt" in stone, false);
  });
});
